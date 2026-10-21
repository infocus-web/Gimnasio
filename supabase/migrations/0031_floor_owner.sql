-- =====================================================================
-- 0031 · Sala y tablero del dueño (agente D)
--
--   1. Máquinas con QR        machines + machine_exercises · machine_save() · machine_view()
--      El cartel de cada máquina lleva un QR a /<gym>/maquina/<code>. Sin sesión
--      se ven los ejercicios (con video); con sesión de socio, además su última
--      carga, su mejor marca y si el ejercicio está en la rutina que le toca hoy.
--   2. Pantalla de TV         floor_settings · floor_tv_link/unlink/save/settings · tv_feed()
--      Se vincula con una clave propia (se guarda solo el hash, como la tablet
--      del molinete). tv_feed() solo lo llama el servidor (/api/floor/tv).
--   3. Rutinas con IA         ai_usage_log · ai_routine_reserve/release/create_draft
--      Máximo 20 sugerencias por día por gimnasio. El borrador queda en
--      workout_programs con is_draft = true hasta que el profe lo aprueba.
--   4. Tablero del negocio    business_dashboard(p_org, p_from, p_to)  (reports.read)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Quién maneja la sala: profesores activos o quien tenga training.manage_all
-- ---------------------------------------------------------------------
create or replace function private.can_manage_floor(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_permission(p_org, 'training.manage_all')
      or exists (select 1 from public.staff s
                  where s.org_id = p_org and s.user_id = auth.uid() and s.active and s.role = 'trainer')
$$;
revoke execute on function private.can_manage_floor(uuid) from public, anon;
grant execute on function private.can_manage_floor(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1. Máquinas
-- ---------------------------------------------------------------------
create table if not exists public.machines (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 80),
  area       text check (area is null or length(area) <= 60),
  photo_url  text check (photo_url is null or (photo_url ~ '^https://' and length(photo_url) <= 500)),
  code       text not null unique check (code ~ '^[a-z0-9]{4,12}$'),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create index if not exists machines_org_idx on public.machines (org_id, active, name);
drop trigger if exists machines_touch on public.machines;
create trigger machines_touch before update on public.machines
  for each row execute function public.touch_updated_at();

create table if not exists public.machine_exercises (
  machine_id  uuid not null,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  org_id      uuid not null,
  position    int  not null default 0,
  primary key (machine_id, exercise_id),
  foreign key (machine_id, org_id) references public.machines (id, org_id) on delete cascade
);
create index if not exists machine_exercises_exercise_idx on public.machine_exercises (exercise_id);

alter table public.machines enable row level security;
alter table public.machine_exercises enable row level security;

drop policy if exists machines_select on public.machines;
create policy machines_select on public.machines for select to authenticated
  using ((select private.staff_id(org_id)) is not null);
drop policy if exists machine_exercises_select on public.machine_exercises;
create policy machine_exercises_select on public.machine_exercises for select to authenticated
  using ((select private.staff_id(org_id)) is not null);
-- Escrituras: solo por machine_save()
revoke all on public.machines, public.machine_exercises from anon;
revoke insert, update, delete on public.machines, public.machine_exercises from authenticated;
grant select on public.machines, public.machine_exercises to authenticated;

-- Código corto del QR (sin letras que se confunden: i, l, o, 0, 1)
create or replace function private.machine_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  v_alpha text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_code  text;
  v_bytes bytea;
begin
  loop
    v_bytes := extensions.gen_random_bytes(6);
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(v_alpha, 1 + (get_byte(v_bytes, i) % length(v_alpha)), 1);
    end loop;
    exit when not exists (select 1 from public.machines where code = v_code);
  end loop;
  return v_code;
end $$;
revoke execute on function private.machine_code() from public, anon, authenticated;

-- Alta / edición de una máquina con sus ejercicios (p_id null = nueva)
create or replace function public.machine_save(
  p_org          uuid,
  p_id           uuid,
  p_name         text,
  p_area         text default null,
  p_photo_url    text default null,
  p_active       boolean default true,
  p_exercise_ids uuid[] default '{}'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id  uuid;
  v_ids uuid[] := coalesce(p_exercise_ids, '{}');
  v_bad int;
begin
  if not private.can_manage_floor(p_org) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'NAME_REQUIRED'; end if;
  if cardinality(v_ids) > 20 then raise exception 'TOO_MANY_EXERCISES'; end if;
  select count(*) into v_bad from unnest(v_ids) x(id)
   where not exists (select 1 from public.exercises e where e.id = x.id and (e.org_id = p_org or e.org_id is null));
  if v_bad > 0 then raise exception 'EXERCISE_NOT_FOUND'; end if;
  p_photo_url := nullif(btrim(coalesce(p_photo_url, '')), '');

  if p_id is null then
    insert into public.machines (org_id, name, area, photo_url, code, active)
    values (p_org, btrim(p_name), nullif(btrim(coalesce(p_area, '')), ''), p_photo_url, private.machine_code(), coalesce(p_active, true))
    returning id into v_id;
  else
    update public.machines
       set name = btrim(p_name), area = nullif(btrim(coalesce(p_area, '')), ''), photo_url = p_photo_url,
           active = coalesce(p_active, true)
     where id = p_id and org_id = p_org
    returning id into v_id;
    if v_id is null then raise exception 'MACHINE_NOT_FOUND'; end if;
    delete from public.machine_exercises where machine_id = v_id;   -- se reemplaza la lista completa
  end if;

  insert into public.machine_exercises (machine_id, exercise_id, org_id, position)
  select v_id, x.id, p_org, min(x.ord)::int
    from unnest(v_ids) with ordinality x(id, ord)
   group by x.id;
  return v_id;
end $$;
revoke execute on function public.machine_save(uuid, uuid, text, text, text, boolean, uuid[]) from public, anon;
grant execute on function public.machine_save(uuid, uuid, text, text, text, boolean, uuid[]) to authenticated;

-- Página pública de la máquina (/<gym>/maquina/<code>).
--   Sin sesión: máquina + ejercicios. Con sesión de socio de ESE gimnasio: además
--   SUS datos (última carga, mejor marca, si está en la rutina de hoy). Nunca de otro socio.
create or replace function public.machine_view(p_slug text, p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org     public.organizations;
  v_mac     public.machines;
  v_member  public.members;
  v_prog    uuid;
  v_today   uuid;     -- día de la rutina que le toca hoy (el siguiente al último que hizo)
  v_ex      jsonb;
  v_me      jsonb := null;
begin
  select * into v_org from public.organizations where slug = lower(coalesce(p_slug, ''));
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select * into v_mac from public.machines
   where code = lower(btrim(coalesce(p_code, ''))) and org_id = v_org.id and active;
  if not found then return jsonb_build_object('status', 'not_found', 'gym', v_org.name); end if;

  if auth.uid() is not null then
    select * into v_member from public.members
     where org_id = v_org.id and user_id = auth.uid() and status <> 'archived';
  end if;

  if v_member.id is not null then
    select pa.program_id into v_prog from public.program_assignments pa
     where pa.member_id = v_member.id and pa.status = 'active'
     order by pa.created_at desc limit 1;
    if v_prog is not null then
      -- Igual que la app: el día siguiente al último entrenamiento hecho de esta rutina
      select coalesce(
        (select w2.id from public.program_workouts w2
          where w2.program_id = v_prog
            and w2.day_index > (select w.day_index from public.workout_logs l
                                  join public.program_workouts w on w.id = l.workout_id
                                 where l.member_id = v_member.id and w.program_id = v_prog
                                 order by l.performed_at desc limit 1)
          order by w2.day_index limit 1),
        (select w3.id from public.program_workouts w3 where w3.program_id = v_prog order by w3.day_index limit 1))
        into v_today;
    end if;
    v_me := jsonb_build_object('first_name', v_member.first_name, 'has_program', v_prog is not null);
  end if;

  select coalesce(jsonb_agg(x.j order by x.pos, x.name), '[]'::jsonb) into v_ex from (
    select me.position as pos, e.name,
           jsonb_build_object(
             'id', e.id, 'name', e.name, 'muscle_group', e.muscle_group, 'video_url', e.video_url,
             'instructions', e.instructions,
             'last', case when v_member.id is null then null else (
                 select jsonb_build_object('performed_at', l.performed_at,
                          'sets', (select jsonb_agg(jsonb_build_object('set', s2.set_number, 'reps', s2.reps, 'weight_kg', s2.weight_kg) order by s2.set_number)
                                     from public.set_logs s2 where s2.workout_log_id = l.id and s2.exercise_id = e.id))
                   from public.workout_logs l
                  where l.member_id = v_member.id
                    and exists (select 1 from public.set_logs s where s.workout_log_id = l.id and s.exercise_id = e.id)
                  order by l.performed_at desc limit 1) end,
             'best', case when v_member.id is null then null else (
                 select jsonb_build_object('weight_kg', s.weight_kg, 'reps', s.reps, 'performed_at', l.performed_at)
                   from public.set_logs s join public.workout_logs l on l.id = s.workout_log_id
                  where l.member_id = v_member.id and s.exercise_id = e.id and s.weight_kg is not null
                  order by s.weight_kg desc, s.reps desc nulls last, l.performed_at desc limit 1) end,
             'in_routine', case when v_prog is null then null else (
                 select jsonb_build_object('day_name', w.name, 'day_index', w.day_index, 'is_today', w.id = v_today,
                                           'target_sets', pe.target_sets, 'target_reps', pe.target_reps,
                                           'target_weight_kg', pe.target_weight_kg, 'rest_seconds', pe.rest_seconds,
                                           'notes', pe.notes)
                   from public.program_exercises pe join public.program_workouts w on w.id = pe.workout_id
                  where w.program_id = v_prog and pe.exercise_id = e.id
                  order by (w.id = v_today) desc, w.day_index, pe.position limit 1) end
           ) as j
      from public.machine_exercises me
      join public.exercises e on e.id = me.exercise_id
     where me.machine_id = v_mac.id
  ) x;

  return jsonb_build_object(
    'status', 'ok',
    'gym', v_org.name,
    'machine', jsonb_build_object('name', v_mac.name, 'area', v_mac.area, 'photo_url', v_mac.photo_url, 'code', v_mac.code),
    'exercises', v_ex,
    'member', v_me,
    'signed_in', auth.uid() is not null);
end $$;
revoke execute on function public.machine_view(text, text) from public;
grant execute on function public.machine_view(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Pantalla de TV de la sala
-- ---------------------------------------------------------------------
create table if not exists public.floor_settings (
  org_id          uuid primary key references public.organizations (id) on delete cascade,
  tv_token_hash   text unique,
  tv_linked_at    timestamptz,
  tv_seen_at      timestamptz,
  ranking_enabled boolean not null default true,
  message         text check (message is null or length(message) <= 280),
  updated_at      timestamptz not null default now()
);
alter table public.floor_settings enable row level security;
-- Sin políticas: se lee y escribe solo con las funciones de abajo (el hash nunca sale)
revoke all on public.floor_settings from anon, authenticated;

create or replace function private.can_manage_tv(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_permission(p_org, 'training.manage_all') or private.has_permission(p_org, 'org.manage')
$$;
revoke execute on function private.can_manage_tv(uuid) from public, anon;
grant execute on function private.can_manage_tv(uuid) to authenticated, service_role;

create or replace function public.floor_tv_settings(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v public.floor_settings;
begin
  if not private.can_manage_tv(p_org) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into v from public.floor_settings where org_id = p_org;
  return jsonb_build_object('linked', v.tv_token_hash is not null, 'linked_at', v.tv_linked_at, 'seen_at', v.tv_seen_at,
                            'ranking_enabled', coalesce(v.ranking_enabled, true), 'message', v.message);
end $$;

-- Genera una clave nueva (la anterior deja de funcionar). Se muestra una sola vez.
create or replace function public.floor_tv_link(p_org uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not private.can_manage_tv(p_org) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  insert into public.floor_settings (org_id, tv_token_hash, tv_linked_at, tv_seen_at)
  values (p_org, encode(extensions.digest(v_token, 'sha256'), 'hex'), now(), null)
  on conflict (org_id) do update
     set tv_token_hash = excluded.tv_token_hash, tv_linked_at = now(), tv_seen_at = null, updated_at = now();
  return v_token;
end $$;

create or replace function public.floor_tv_unlink(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_manage_tv(p_org) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update public.floor_settings set tv_token_hash = null, tv_seen_at = null, updated_at = now() where org_id = p_org;
end $$;

create or replace function public.floor_tv_save(p_org uuid, p_ranking boolean, p_message text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_manage_tv(p_org) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if length(coalesce(p_message, '')) > 280 then raise exception 'MESSAGE_TOO_LONG'; end if;
  insert into public.floor_settings (org_id, ranking_enabled, message)
  values (p_org, coalesce(p_ranking, true), nullif(btrim(coalesce(p_message, '')), ''))
  on conflict (org_id) do update
     set ranking_enabled = excluded.ranking_enabled, message = excluded.message, updated_at = now();
end $$;

revoke execute on function public.floor_tv_settings(uuid), public.floor_tv_link(uuid), public.floor_tv_unlink(uuid),
                           public.floor_tv_save(uuid, boolean, text) from public, anon;
grant execute on function public.floor_tv_settings(uuid), public.floor_tv_link(uuid), public.floor_tv_unlink(uuid),
                          public.floor_tv_save(uuid, boolean, text) to authenticated;

-- Nombre corto para mostrar en público: "Juan P."
create or replace function private.short_name(p_first text, p_last text) returns text
language sql immutable set search_path = '' as $$
  select btrim(initcap(split_part(btrim(coalesce(p_first, '')), ' ', 1))
               || coalesce(' ' || nullif(upper(left(btrim(coalesce(p_last, '')), 1)), '') || '.', ''))
$$;

-- Lo que muestra la TV (POST /api/floor/tv, solo el servidor)
create or replace function public.tv_feed(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_fs     public.floor_settings;
  v_org    public.organizations;
  v_today  date;
  v_month  timestamptz;
  v_raw    jsonb;
  v_occ    int;
  v_src    text := 'checkins';
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{48}$' then return jsonb_build_object('status', 'unauthorized'); end if;
  select * into v_fs from public.floor_settings
   where tv_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found then return jsonb_build_object('status', 'unauthorized'); end if;
  select * into v_org from public.organizations where id = v_fs.org_id;
  update public.floor_settings set tv_seen_at = now()
   where org_id = v_org.id and (tv_seen_at is null or tv_seen_at < now() - interval '1 minute');

  v_today := (now() at time zone v_org.timezone)::date;
  v_month := date_trunc('month', v_today)::timestamp at time zone v_org.timezone;

  -- Concurrencia: si existe el cálculo de 0029 (gym_occupancy, agente B) se usa; si no, entradas de los últimos 75 min.
  -- (se llama al cálculo interno: public.gym_occupancy() exige un usuario del gimnasio y acá no hay)
  if to_regproc('private.gym_occupancy_calc') is not null then
    begin
      execute 'select to_jsonb(private.gym_occupancy_calc($1))' into v_raw using v_org.id;
      if jsonb_typeof(v_raw) = 'number' then
        v_occ := (v_raw #>> '{}')::numeric::int;
      elsif jsonb_typeof(v_raw) = 'object' then
        v_occ := coalesce(v_raw ->> 'people', v_raw ->> 'current', v_raw ->> 'count')::numeric::int;
      end if;
      if v_occ is not null then v_src := 'gym_occupancy'; end if;
    exception when others then
      v_occ := null;
    end;
  end if;
  if v_occ is null then
    select count(distinct c.member_id) into v_occ from public.checkins c
     where c.org_id = v_org.id and c.allowed and c.created_at > now() - interval '75 minutes';
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'gym', v_org.name,
    'timezone', v_org.timezone,
    'server_time', now(),
    'occupancy', v_occ,
    'occupancy_source', v_src,
    'occupancy_level', case when jsonb_typeof(v_raw) = 'object' and v_src <> 'checkins' then v_raw ->> 'level' end,
    'capacity', case when jsonb_typeof(v_raw) = 'object' and v_src <> 'checkins' then (v_raw ->> 'capacity')::numeric::int end,
    'message', v_fs.message,
    'ranking_enabled', v_fs.ranking_enabled,
    'classes', (select coalesce(jsonb_agg(x order by x.starts_at), '[]'::jsonb) from (
        select s.starts_at, s.ends_at, ct.name, ct.color, st.display_name as instructor, r.name as room, s.capacity,
               (select count(*) from public.bookings b where b.session_id = s.id and b.status in ('booked', 'checked_in'))::int as booked
          from public.class_sessions s
          join public.class_types ct on ct.id = s.class_type_id
          join public.staff st on st.id = s.instructor_id
          join public.rooms r on r.id = s.room_id
         where s.org_id = v_org.id and s.status = 'scheduled'
           and s.starts_at >= v_today::timestamp at time zone v_org.timezone
           and s.starts_at < (v_today + 1)::timestamp at time zone v_org.timezone
           and s.ends_at > now()
         order by s.starts_at limit 8) x),
    'ranking', case when not v_fs.ranking_enabled then '[]'::jsonb else (
        select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'days', x.days) order by x.days desc, x.name), '[]'::jsonb) from (
          select private.short_name(m.first_name, m.last_name) as name,
                 count(distinct (c.created_at at time zone v_org.timezone)::date)::int as days
            from public.checkins c join public.members m on m.id = c.member_id
           where c.org_id = v_org.id and c.allowed and c.created_at >= v_month and m.status <> 'archived'
           group by m.id, m.first_name, m.last_name
           order by days desc, name
           limit 10) x) end,
    'birthdays', (select coalesce(jsonb_agg(x.name order by x.name), '[]'::jsonb) from (
        select private.short_name(m.first_name, m.last_name) as name
          from public.members m
         where m.org_id = v_org.id and m.status = 'active' and m.birth_date is not null
           and extract(month from m.birth_date) = extract(month from v_today)
           and extract(day from m.birth_date) = extract(day from v_today)
         limit 20) x)
  );
end $$;
revoke execute on function public.tv_feed(text) from public, anon, authenticated;
grant execute on function public.tv_feed(text) to service_role;

-- ---------------------------------------------------------------------
-- 3. Rutinas sugeridas con IA
-- ---------------------------------------------------------------------
alter table public.workout_programs add column if not exists is_draft boolean not null default false;
alter table public.workout_programs add column if not exists ai_generated boolean not null default false;

create table if not exists public.ai_usage_log (
  id         bigint generated always as identity primary key,
  org_id     uuid not null references public.organizations (id) on delete cascade,
  staff_id   uuid,
  kind       text not null default 'routine',
  day        date not null,
  status     text not null default 'pending' check (status in ('pending', 'ok', 'failed')),
  program_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_log_day_idx on public.ai_usage_log (org_id, kind, day);
alter table public.ai_usage_log enable row level security;
revoke all on public.ai_usage_log from anon, authenticated;

-- Reserva un uso del día (antes de llamar a la IA). Devuelve el número de ticket.
create or replace function public.ai_routine_reserve(p_org uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_limit constant int := 20;
  v_day   date;
  v_used  int;
  v_id    bigint;
begin
  if not private.can_manage_floor(p_org) or private.staff_id(p_org) is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select (now() at time zone timezone)::date into v_day from public.organizations where id = p_org;
  perform pg_advisory_xact_lock(hashtextextended('ai_usage:' || p_org::text, 0));   -- dos pedidos a la vez no pasan el límite
  select count(*) into v_used from public.ai_usage_log
   where org_id = p_org and kind = 'routine' and day = v_day and status <> 'failed';
  if v_used >= v_limit then
    raise exception 'AI_DAILY_LIMIT' using hint = format('Se usaron las %s sugerencias de hoy. Mañana se renuevan.', v_limit);
  end if;
  insert into public.ai_usage_log (org_id, staff_id, kind, day) values (p_org, private.staff_id(p_org), 'routine', v_day)
  returning id into v_id;
  return jsonb_build_object('ticket', v_id, 'used', v_used + 1, 'limit', v_limit, 'remaining', v_limit - v_used - 1);
end $$;

-- La IA falló: el uso no cuenta. SOLO el servidor (service_role) la llama, justo después de que su
-- propia llamada a la IA falló: si la pudiera llamar el profe, devolvería sus tickets y pasaría el límite.
create or replace function public.ai_routine_release(p_org uuid, p_ticket bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.ai_usage_log set status = 'failed'
   where id = p_ticket and org_id = p_org and status = 'pending' and program_id is null;
end $$;

create or replace function public.ai_routine_usage(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_used int;
begin
  if not private.can_manage_floor(p_org) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select count(*) into v_used from public.ai_usage_log u join public.organizations o on o.id = u.org_id
   where u.org_id = p_org and u.kind = 'routine' and u.day = (now() at time zone o.timezone)::date and u.status <> 'failed';
  return jsonb_build_object('used', v_used, 'limit', 20, 'remaining', greatest(20 - v_used, 0));
end $$;

-- Crea el BORRADOR validado. p_payload:
--   {"name":"…","goal":"…","level":"beginner|intermediate|advanced","description":"…",
--    "days":[{"name":"…","exercises":[{"exercise_id":"uuid","sets":3,"reps":"8-12","rest_seconds":90,"notes":"…"}]}]}
create or replace function public.ai_routine_create_draft(p_org uuid, p_ticket bigint, p_payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_staff uuid := private.staff_id(p_org);
  v_prog  uuid;
  v_wid   uuid;
  d       jsonb;
  e       jsonb;
  v_di    int := 0;
  v_pos   int;
  v_sets  int;
  v_rest  int;
  v_reps  text;
  v_level text := nullif(p_payload ->> 'level', '');
begin
  if not private.can_manage_floor(p_org) or v_staff is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (select 1 from public.ai_usage_log where id = p_ticket and org_id = p_org and status = 'pending' and staff_id = v_staff) then
    raise exception 'AI_TICKET_INVALID';
  end if;
  if jsonb_typeof(p_payload -> 'days') <> 'array' or jsonb_array_length(p_payload -> 'days') not between 1 and 7 then
    raise exception 'AI_INVALID_ROUTINE' using hint = 'La rutina tiene que tener entre 1 y 7 días.';
  end if;
  if v_level is not null and v_level not in ('beginner', 'intermediate', 'advanced') then v_level := null; end if;

  insert into public.workout_programs (org_id, author_id, name, description, goal, level, is_template, is_draft, ai_generated)
  values (p_org, v_staff, left(coalesce(nullif(btrim(p_payload ->> 'name'), ''), 'Rutina sugerida'), 80),
          left(nullif(btrim(p_payload ->> 'description'), ''), 1000), left(nullif(btrim(p_payload ->> 'goal'), ''), 60),
          v_level, true, true, true)
  returning id into v_prog;

  for d in select * from jsonb_array_elements(p_payload -> 'days') loop
    v_di := v_di + 1;
    if jsonb_typeof(d -> 'exercises') <> 'array' or jsonb_array_length(d -> 'exercises') not between 1 and 15 then
      raise exception 'AI_INVALID_ROUTINE' using hint = format('El día %s no tiene ejercicios válidos.', v_di);
    end if;
    insert into public.program_workouts (org_id, program_id, day_index, name)
    values (p_org, v_prog, v_di, left(coalesce(nullif(btrim(d ->> 'name'), ''), 'Día ' || v_di), 60))
    returning id into v_wid;
    v_pos := 0;
    for e in select * from jsonb_array_elements(d -> 'exercises') loop
      if coalesce(e ->> 'exercise_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or not exists (select 1 from public.exercises x where x.id = (e ->> 'exercise_id')::uuid and (x.org_id = p_org or x.org_id is null)) then
        raise exception 'EXERCISE_NOT_FOUND';
      end if;
      v_sets := case when coalesce(e ->> 'sets', '') ~ '^\d{1,2}$' then (e ->> 'sets')::int end;
      if v_sets is null or v_sets not between 1 and 10 then
        raise exception 'AI_INVALID_ROUTINE' using hint = 'Las series tienen que ser entre 1 y 10.';
      end if;
      v_reps := left(nullif(btrim(e ->> 'reps'), ''), 20);
      v_rest := case when coalesce(e ->> 'rest_seconds', '') ~ '^\d{1,4}$' then least((e ->> 'rest_seconds')::int, 600) end;
      insert into public.program_exercises (org_id, workout_id, exercise_id, position, target_sets, target_reps, rest_seconds, notes)
      values (p_org, v_wid, (e ->> 'exercise_id')::uuid, v_pos, v_sets, coalesce(v_reps, '10'), v_rest,
              left(nullif(btrim(e ->> 'notes'), ''), 200));
      v_pos := v_pos + 1;
    end loop;
  end loop;

  update public.ai_usage_log set status = 'ok', program_id = v_prog where id = p_ticket;
  return v_prog;
end $$;

revoke execute on function public.ai_routine_reserve(uuid), public.ai_routine_release(uuid, bigint),
                           public.ai_routine_usage(uuid), public.ai_routine_create_draft(uuid, bigint, jsonb) from public, anon;
grant execute on function public.ai_routine_reserve(uuid),
                          public.ai_routine_usage(uuid), public.ai_routine_create_draft(uuid, bigint, jsonb) to authenticated;
revoke execute on function public.ai_routine_release(uuid, bigint) from authenticated;
grant execute on function public.ai_routine_release(uuid, bigint) to service_role;

-- ---------------------------------------------------------------------
-- 4. Tablero del negocio
-- ---------------------------------------------------------------------
-- Números de un período [p_from, p_to) (se calculan igual para el actual y el anterior)
create or replace function private.bd_totals(p_org uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_rev     bigint;
  v_n       int;
  v_new     int;
  v_lapsed  int;
  v_due     int;
  v_renew   int;
  v_entries int;
  v_unique  int;
  v_active  int;
  v_at      timestamptz := least(p_to, now());
begin
  -- Ingresos: cobros de cuotas acreditados (no incluye anulados ni reintegrados)
  select coalesce(sum(amount_cents), 0), count(*) into v_rev, v_n
    from public.payments
   where org_id = p_org and status = 'succeeded' and paid_at >= p_from and paid_at < p_to;

  -- Altas: cuentas cuyo PRIMER pago cae en el período
  select count(*) into v_new from (
    select billing_account_id, min(paid_at) as first_paid
      from public.payments where org_id = p_org and status = 'succeeded' group by 1) x
   where first_paid >= p_from and first_paid < p_to;

  -- Bajas: cuentas cuya última membresía venció en el período y pasaron 10 días sin renovar
  select count(*) into v_lapsed from (
    select billing_account_id, max(current_period_end) as last_end
      from public.memberships where org_id = p_org and status <> 'canceled' group by 1) x
   where last_end >= p_from and last_end < p_to and last_end + interval '10 days' <= now();

  -- Renovación: cuotas que vencían en el período (ya pasaron 10 días o ya renovaron) y cuántas se renovaron
  with due as (
    select distinct on (i.billing_account_id) i.billing_account_id, i.period_end,
           exists (select 1 from public.invoices i2
                    where i2.billing_account_id = i.billing_account_id and i2.id <> i.id and i2.status = 'paid'
                      and i2.period_end > i.period_end and i2.created_at <= i.period_end + interval '10 days') as renewed
      from public.invoices i
     where i.org_id = p_org and i.status = 'paid' and i.membership_id is not null
       and i.period_end >= p_from and i.period_end < p_to
     order by i.billing_account_id, i.period_end desc
  )
  select count(*) filter (where renewed or period_end + interval '10 days' <= now()), count(*) filter (where renewed)
    into v_due, v_renew from due;

  select count(*), count(distinct member_id) into v_entries, v_unique
    from public.checkins where org_id = p_org and allowed and created_at >= p_from and created_at < p_to;

  -- Socios activos al final del período (o ahora, si el período no terminó)
  select count(distinct mm.member_id) into v_active
    from public.memberships ms join public.membership_members mm on mm.membership_id = ms.id
   where ms.org_id = p_org and ms.status <> 'canceled'
     and ms.current_period_start <= v_at and ms.current_period_end > v_at;

  return jsonb_build_object(
    'revenue_cents', v_rev, 'payments', v_n,
    'ticket_cents', case when v_n > 0 then round(v_rev::numeric / v_n)::bigint end,
    'new_members', v_new, 'lapsed', v_lapsed,
    'renewal_due', v_due, 'renewed', v_renew,
    'renewal_pct', case when v_due > 0 then round(100.0 * v_renew / v_due)::int end,
    'entries', v_entries, 'unique_visitors', v_unique,
    'active_members', v_active);
end $$;
revoke execute on function private.bd_totals(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- Período anterior: por defecto, los mismos días inmediatamente antes; el panel puede pasar
-- otro (ej. "este mes al día 21" contra "del 1 al 21 del mes pasado").
create or replace function public.business_dashboard(p_org uuid, p_from date, p_to date,
                                                     p_prev_from date default null, p_prev_to date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz    text;
  v_from  timestamptz;
  v_to    timestamptz;
  v_days  int;
begin
  if not private.has_permission(p_org, 'reports.read') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_PERIOD'; end if;
  if p_to - p_from > 366 then raise exception 'PERIOD_TOO_LONG'; end if;
  v_days := p_to - p_from + 1;
  if p_prev_from is null or p_prev_to is null or p_prev_to < p_prev_from or p_prev_to - p_prev_from > 366 then
    p_prev_from := p_from - v_days;
    p_prev_to   := p_from - 1;
  end if;
  select timezone into v_tz from public.organizations where id = p_org;
  v_from  := p_from::timestamp at time zone v_tz;
  v_to    := (p_to + 1)::timestamp at time zone v_tz;

  return jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to, 'days', v_days,
                                 'prev_from', p_prev_from, 'prev_to', p_prev_to),
    'current', private.bd_totals(p_org, v_from, v_to),
    'previous', private.bd_totals(p_org, p_prev_from::timestamp at time zone v_tz, (p_prev_to + 1)::timestamp at time zone v_tz),
    'by_plan', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'cents', cents, 'payments', n) order by cents desc, name), '[]'::jsonb) from (
        select coalesce(pl.name, 'Otros cobros') as name, sum(p.amount_cents)::bigint as cents, count(*)::int as n
          from public.payments p
          left join public.invoices i on i.id = p.invoice_id
          left join public.memberships ms on ms.id = i.membership_id
          left join public.membership_plans pl on pl.id = ms.plan_id
         where p.org_id = p_org and p.status = 'succeeded' and p.paid_at >= v_from and p.paid_at < v_to
         group by 1) x),
    'debt', jsonb_build_object(
        'accounts', (select count(*) from public.billing_accounts where org_id = p_org and delinquent)::int,
        'open_cents', (select coalesce(sum(i.amount_due_cents - i.amount_paid_cents), 0)::bigint
                         from public.invoices i join public.billing_accounts ba on ba.id = i.billing_account_id
                        where i.org_id = p_org and ba.delinquent and i.status = 'open'),
        'list', (select coalesce(jsonb_agg(jsonb_build_object('member_id', x.mid, 'name', x.name, 'open_cents', x.open_cents)
                                           order by x.open_cents desc, x.name), '[]'::jsonb) from (
                   select m.id as mid, btrim(m.first_name || ' ' || m.last_name) as name,
                          coalesce((select sum(i.amount_due_cents - i.amount_paid_cents) from public.invoices i
                                     where i.billing_account_id = ba.id and i.status = 'open'), 0)::bigint as open_cents
                     from public.billing_accounts ba join public.members m on m.id = ba.payer_member_id
                    where ba.org_id = p_org and ba.delinquent
                    order by 3 desc, 2 limit 10) x)),
    'heatmap', (select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'hour', hr, 'n', n) order by dow, hr), '[]'::jsonb) from (
        select extract(isodow from created_at at time zone v_tz)::int as dow,
               extract(hour from created_at at time zone v_tz)::int as hr, count(*)::int as n
          from public.checkins
         where org_id = p_org and allowed and created_at >= v_from and created_at < v_to
         group by 1, 2) x),
    'class_slots', (select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'hour', hr, 'classes', n, 'instructors', ni) order by dow, hr), '[]'::jsonb) from (
        select extract(isodow from starts_at at time zone v_tz)::int as dow,
               extract(hour from starts_at at time zone v_tz)::int as hr,
               count(*)::int as n, count(distinct instructor_id)::int as ni
          from public.class_sessions
         where org_id = p_org and status <> 'canceled' and starts_at >= v_from and starts_at < v_to
         group by 1, 2) x)
  );
end $$;
revoke execute on function public.business_dashboard(uuid, date, date, date, date) from public, anon;
grant execute on function public.business_dashboard(uuid, date, date, date, date) to authenticated;
