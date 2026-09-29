-- =====================================================================
-- Evolution Platform v2 · 0010 · Soporte para la app del socio (Fase A)
--   · Horario de apertura del gimnasio (para "Cerrado" / horarios pico)
--   · Posición de cada equipo en la sala (mapa de bicis)
--   · Agenda con "usa equipos" y mi reserva
--   · Mapa de equipos de una clase (sin exponer QUIÉN reservó)
--   · Horarios pico y ocupación estimada (agregados, sin datos personales)
-- =====================================================================

-- Horario semanal. ISO: 1 = lunes … 7 = domingo. Días sin fila = cerrado.
alter table public.organizations
  add column if not exists opening_hours jsonb not null default
    '[{"weekday":1,"open":"07:00","close":"23:00"},{"weekday":2,"open":"07:00","close":"23:00"},
      {"weekday":3,"open":"07:00","close":"23:00"},{"weekday":4,"open":"07:00","close":"23:00"},
      {"weekday":5,"open":"07:00","close":"23:00"},{"weekday":6,"open":"09:00","close":"14:00"}]'::jsonb,
  add column if not exists busy_threshold int not null default 40 check (busy_threshold > 0);

-- Posición en la grilla del mapa de sala (null = se ubica automáticamente)
alter table public.equipment
  add column if not exists grid_row smallint check (grid_row between 1 and 30),
  add column if not exists grid_col smallint check (grid_col between 1 and 30);

-- Agenda: se agregan columnas al final (compatible con la vista anterior)
create or replace view public.class_sessions_availability with (security_invoker = false) as
select s.id, s.org_id, s.class_type_id, ct.name as class_name, ct.color, s.room_id, r.name as room_name,
       s.instructor_id, st.display_name as instructor_name, s.starts_at, s.ends_at, s.status,
       s.capacity,
       s.capacity - coalesce(b.taken, 0)       as spots_left,
       s.waitlist_capacity - coalesce(b.waiting, 0) as waitlist_left,
       ct.equipment_kind,
       (ct.equipment_kind is not null) as uses_equipment,
       st.photo_url as instructor_photo_url,
       s.booking_closes_min
  from public.class_sessions s
  join public.class_types ct on ct.id = s.class_type_id
  join public.rooms r        on r.id = s.room_id
  join public.staff st       on st.id = s.instructor_id
  left join lateral (
    select count(*) filter (where status in ('booked', 'checked_in')) as taken,
           count(*) filter (where status = 'waitlisted')              as waiting
      from public.bookings where session_id = s.id
  ) b on true
 where s.org_id in (select private.my_org_ids());

-- Mapa de equipos de una sesión: libre / ocupado / mío. No revela quién ocupa.
create or replace function public.session_equipment_map(p_session_id uuid)
returns table (id uuid, label text, taken boolean, mine boolean, grid_row int, grid_col int)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_s    public.class_sessions;
  v_kind text;
begin
  select * into v_s from public.class_sessions where class_sessions.id = p_session_id;
  if v_s.id is null or v_s.org_id not in (select private.my_org_ids()) then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  select equipment_kind into v_kind from public.class_types where class_types.id = v_s.class_type_id;
  if v_kind is null then return; end if;

  return query
  with eq as (
    select e.id, e.label, e.grid_row, e.grid_col,
           row_number() over (order by length(e.label), e.label) - 1 as n
      from public.equipment e
     where e.room_id = v_s.room_id and e.kind = v_kind and e.status = 'active'
  )
  select eq.id, eq.label,
         exists (select 1 from public.bookings b
                  where b.equipment_id = eq.id and b.status in ('booked', 'checked_in')
                    and b.during && v_s.during),
         exists (select 1 from public.bookings b
                  where b.equipment_id = eq.id and b.session_id = v_s.id
                    and b.status in ('booked', 'checked_in')
                    and b.member_id in (select private.actable_member_ids())),
         coalesce(eq.grid_row, (eq.n / 4) + 1)::int,
         coalesce(eq.grid_col, (eq.n % 4) + 1)::int
    from eq
   order by 5, 6;
end $$;

-- Horarios pico: promedio de ingresos por día (ISO) y hora en las últimas N semanas.
create or replace function public.peak_hours(p_org_id uuid, p_weeks int default 6)
returns table (weekday int, hour int, avg_checkins numeric)
language plpgsql stable security definer set search_path = '' as $$
declare v_tz text;
begin
  if p_org_id not in (select private.my_org_ids()) then raise exception 'FORBIDDEN'; end if;
  select timezone into v_tz from public.organizations where id = p_org_id;
  return query
  select extract(isodow from c.created_at at time zone v_tz)::int,
         extract(hour   from c.created_at at time zone v_tz)::int,
         round(count(*)::numeric / greatest(p_weeks, 1), 1)
    from public.checkins c
   where c.org_id = p_org_id and c.allowed
     and c.created_at >= now() - make_interval(weeks => greatest(p_weeks, 1))
   group by 1, 2
   order by 1, 2;
end $$;

-- Estado "ahora": closed / quiet / moderate / busy (ingresos de los últimos 90 min).
create or replace function public.current_occupancy(p_org_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org   public.organizations;
  v_local timestamp;
  v_day   jsonb;
  v_n     int;
  v_level text;
  v_next  jsonb;
begin
  if p_org_id not in (select private.my_org_ids()) then raise exception 'FORBIDDEN'; end if;
  select * into v_org from public.organizations where id = p_org_id;
  v_local := now() at time zone v_org.timezone;

  select d into v_day from jsonb_array_elements(v_org.opening_hours) d
   where (d ->> 'weekday')::int = extract(isodow from v_local)::int
     and v_local::time >= (d ->> 'open')::time and v_local::time < (d ->> 'close')::time
   limit 1;

  -- próxima apertura (para "Cerrado · abre a las 07:00")
  select d into v_next from jsonb_array_elements(v_org.opening_hours) d
   order by ((d ->> 'weekday')::int - extract(isodow from v_local)::int + 7) % 7
            + case when ((d ->> 'weekday')::int = extract(isodow from v_local)::int
                         and v_local::time >= (d ->> 'open')::time) then 7 else 0 end
   limit 1;

  if v_day is null then
    return jsonb_build_object('level', 'closed', 'recent_checkins', 0, 'next_open', v_next);
  end if;

  select count(*) into v_n from public.checkins
   where org_id = p_org_id and allowed and created_at >= now() - interval '90 minutes';
  v_level := case when v_n >= v_org.busy_threshold then 'busy'
                  when v_n >= v_org.busy_threshold / 2 then 'moderate'
                  else 'quiet' end;
  return jsonb_build_object('level', v_level, 'recent_checkins', v_n, 'closes_at', v_day ->> 'close');
end $$;

-- Permisos: Supabase da EXECUTE por defecto a anon/authenticated en funciones
-- nuevas; lo sacamos y habilitamos solo lo necesario.
revoke execute on function public.session_equipment_map(uuid), public.peak_hours(uuid, int),
  public.current_occupancy(uuid) from public, anon;
grant execute on function public.session_equipment_map(uuid), public.peak_hours(uuid, int),
  public.current_occupancy(uuid) to authenticated;
grant select on public.class_sessions_availability to authenticated;
