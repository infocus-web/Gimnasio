-- =====================================================================
-- 0036 · Ideas tomadas de SocioPlus y Technogym (ver docs del proyecto)
--   1. Encuestas NPS: el socio la responde en la app (a los 30 días del
--      alta y una vez por trimestre). El panel ve el NPS y los comentarios.
--   2. Evolution Check: evaluación física que carga el profe (fuerza,
--      resistencia, cardio, movilidad, equilibrio, composición). Los
--      puntajes y la "edad fitness" se calculan en la app (scoring.ts).
--   3. Balanza: el profe carga mediciones (InBody / Tanita) a mano o
--      importa el CSV de la balanza; el socio las ve en Progreso.
--   4. Retos mensuales: el gimnasio crea el reto, el socio se anota,
--      se mide con datos reales (entradas, entrenos, kilos, clases) y al
--      terminar se premia con días de plan (member_rewards).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0 · Helpers
-- ---------------------------------------------------------------------
-- Profesor activo del gimnasio o alguien con training.manage_all
create or replace function private.is_coach(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_permission(p_org, 'training.manage_all')
      or exists (select 1 from public.staff s
                  where s.org_id = p_org and s.user_id = auth.uid() and s.active and s.role = 'trainer')
$$;

-- "Juan P." para rankings (sin apellido completo)
create or replace function private.short_name(p_first text, p_last text) returns text
language sql immutable set search_path = '' as $$
  select private.engagement_first_name(p_first) || coalesce(' ' || upper(left(nullif(btrim(p_last), ''), 1)) || '.', '')
$$;

-- ---------------------------------------------------------------------
-- 1 · Encuestas NPS
-- ---------------------------------------------------------------------
alter table public.engagement_settings add column if not exists nps_enabled boolean not null default true;

create table if not exists public.survey_responses (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  member_id   uuid not null references public.members (id) on delete cascade,
  campaign    text not null check (campaign ~ '^(d30|q[0-9]{4}-[1-4])$'),
  score       int check (score between 0 and 10),          -- null = "ahora no"
  comment     text check (length(comment) <= 1000),
  created_at  timestamptz not null default now(),
  unique (member_id, campaign)
);
create index if not exists survey_responses_org on public.survey_responses (org_id, created_at desc);

alter table public.survey_responses enable row level security;
revoke all on public.survey_responses from anon, authenticated;
grant select on public.survey_responses to authenticated;
create policy survey_responses_select on public.survey_responses for select to authenticated
  using (member_id in (select private.actable_member_ids())
         or (select private.has_permission(org_id, 'members.write')));

-- Qué encuesta le toca a un socio hoy (null = ninguna)
--   d30      : entre 30 y 120 días desde el alta, una sola vez
--   trimestre: socio con 60+ días, una por trimestre, y nunca a menos de 45 días de la anterior
create or replace function private.survey_pending(p_member uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  m      public.members;
  v_tz   text;
  v_on   boolean;
  v_q    text;
begin
  select * into m from public.members where id = p_member;
  if not found or m.status <> 'active' then return null; end if;
  select coalesce(s.nps_enabled, true), o.timezone into v_on, v_tz
    from public.organizations o left join public.engagement_settings s on s.org_id = o.id where o.id = m.org_id;
  if not coalesce(v_on, true) then return null; end if;
  if (private.engagement_current_membership(p_member)).id is null then return null; end if;

  if m.created_at <= now() - interval '30 days' and m.created_at > now() - interval '120 days' then
    if not exists (select 1 from public.survey_responses where member_id = p_member and campaign = 'd30') then
      return 'd30';
    end if;
  end if;

  v_q := 'q' || to_char(now() at time zone v_tz, 'YYYY') || '-' || extract(quarter from now() at time zone v_tz)::int;
  if m.created_at <= now() - interval '60 days'
     and not exists (select 1 from public.survey_responses where member_id = p_member and campaign = v_q)
     and not exists (select 1 from public.survey_responses where member_id = p_member and created_at > now() - interval '45 days') then
    return v_q;
  end if;
  return null;
end $$;

-- La app pregunta si hay encuesta (solo para el propio socio: nadie responde por otro)
create or replace function public.member_survey(p_member uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_c text; v_gym text;
begin
  if not exists (select 1 from public.members where id = p_member and user_id = auth.uid()) then return null; end if;
  v_c := private.survey_pending(p_member);
  if v_c is null then return null; end if;
  select o.name into v_gym from public.members m join public.organizations o on o.id = m.org_id where m.id = p_member;
  return jsonb_build_object('campaign', v_c, 'gym', v_gym);
end $$;

create or replace function public.survey_answer(p_member uuid, p_campaign text, p_score int, p_comment text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select org_id into v_org from public.members where id = p_member and user_id = auth.uid();
  if v_org is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_score is not null and (p_score < 0 or p_score > 10) then raise exception 'INVALID_SCORE' using errcode = 'P0001'; end if;
  if p_campaign is distinct from private.survey_pending(p_member) then raise exception 'SURVEY_NOT_PENDING' using errcode = 'P0001'; end if;
  insert into public.survey_responses (org_id, member_id, campaign, score, comment)
  values (v_org, p_member, p_campaign, p_score, nullif(left(btrim(coalesce(p_comment, '')), 1000), ''));
end $$;

-- Panel: NPS del período, evolución por mes y respuestas
create or replace function public.nps_report(p_org uuid, p_days int default 90) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_days int := least(greatest(coalesce(p_days, 90), 7), 730);
  v_tz   text;
begin
  if not private.has_permission(p_org, 'members.write') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select timezone into v_tz from public.organizations where id = p_org;
  return (
    with r as (
      select * from public.survey_responses where org_id = p_org and created_at > now() - make_interval(days => v_days)
    ), s as (
      select count(*) filter (where score is not null)::int as answered,
             count(*) filter (where score is null)::int as skipped,
             count(*) filter (where score >= 9)::int as promoters,
             count(*) filter (where score between 7 and 8)::int as passives,
             count(*) filter (where score <= 6)::int as detractors,
             round(avg(score), 1) as average
        from r
    ), months as (
      select date_trunc('month', created_at at time zone v_tz) as mo,
             count(*) filter (where score is not null)::int as n,
             count(*) filter (where score >= 9)::int as p,
             count(*) filter (where score <= 6)::int as d
        from public.survey_responses
       where org_id = p_org and created_at > now() - interval '12 months'
       group by 1
    )
    select jsonb_build_object(
      'days', v_days,
      'answered', s.answered,
      'skipped', s.skipped,
      'promoters', s.promoters,
      'passives', s.passives,
      'detractors', s.detractors,
      'average', s.average,
      'nps', case when s.answered > 0 then round(100.0 * (s.promoters - s.detractors) / s.answered)::int end,
      'enabled', coalesce((select nps_enabled from public.engagement_settings where org_id = p_org), true),
      'by_month', coalesce((select jsonb_agg(jsonb_build_object(
                     'month', to_char(mo, 'YYYY-MM'), 'answered', n,
                     'nps', case when n > 0 then round(100.0 * (p - d) / n)::int end) order by mo) from months), '[]'::jsonb),
      'responses', coalesce((select jsonb_agg(x order by x.created_at desc) from (
                     select r.id, r.member_id, private.short_name(m.first_name, m.last_name) as name,
                            m.first_name || coalesce(' ' || nullif(m.last_name, ''), '') as full_name,
                            m.phone, r.score, r.comment, r.campaign, r.created_at
                       from r join public.members m on m.id = r.member_id
                      where r.score is not null
                      order by r.created_at desc limit 200) x), '[]'::jsonb)
    ) from s
  );
end $$;

create or replace function public.nps_set_enabled(p_org uuid, p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.engagement_can_manage(p_org) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  insert into public.engagement_settings (org_id, nps_enabled) values (p_org, p_enabled)
  on conflict (org_id) do update set nps_enabled = excluded.nps_enabled, updated_at = now();
end $$;

-- ---------------------------------------------------------------------
-- 2 · Evolution Check (evaluación física)
-- ---------------------------------------------------------------------
create table if not exists public.fitness_assessments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  member_id     uuid not null,
  assessed_by   uuid,                                        -- staff
  assessed_at   timestamptz not null default now(),
  sex           char(1) not null check (sex in ('F', 'M')),  -- solo para comparar con la tabla de referencia
  age_years     int not null check (age_years between 10 and 100),
  weight_kg     numeric(5, 2) check (weight_kg between 20 and 300),
  height_cm     numeric(5, 1) check (height_cm between 100 and 230),
  body_fat_pct  numeric(4, 1) check (body_fat_pct between 3 and 70),
  waist_cm      numeric(5, 1) check (waist_cm between 40 and 200),
  resting_hr    int check (resting_hr between 30 and 150),
  squats_1min   int check (squats_1min between 0 and 150),
  pushups       int check (pushups between 0 and 150),
  plank_s       int check (plank_s between 0 and 900),
  sit_reach_cm  numeric(4, 1) check (sit_reach_cm between -40 and 60),
  balance_s     int check (balance_s between 0 and 60),
  step_hr       int check (step_hr between 50 and 220),
  goal          text check (length(goal) <= 200),
  notes         text check (length(notes) <= 1000),
  created_at    timestamptz not null default now(),
  foreign key (member_id, org_id)   references public.members (id, org_id) on delete cascade,
  foreign key (assessed_by, org_id) references public.staff (id, org_id) on delete set null (assessed_by)
);
create index if not exists fitness_assessments_member on public.fitness_assessments (member_id, assessed_at desc);

alter table public.fitness_assessments enable row level security;
revoke all on public.fitness_assessments from anon, authenticated;
grant select, insert, update, delete on public.fitness_assessments to authenticated;
-- El socio (y el titular de su grupo) la ve; los profes del gimnasio la cargan y la ven.
create policy fitness_assessments_select on public.fitness_assessments for select to authenticated
  using (member_id in (select private.actable_member_ids()) or (select private.is_coach(org_id)));
create policy fitness_assessments_insert on public.fitness_assessments for insert to authenticated
  with check ((select private.is_coach(org_id)) and assessed_by = (select private.staff_id(org_id)));
create policy fitness_assessments_update on public.fitness_assessments for update to authenticated
  using ((select private.is_coach(org_id))) with check ((select private.is_coach(org_id)));
create policy fitness_assessments_delete on public.fitness_assessments for delete to authenticated
  using ((select private.is_coach(org_id)));

-- ---------------------------------------------------------------------
-- 3 · Balanza: mediciones cargadas por el profe o importadas
-- ---------------------------------------------------------------------
alter table public.body_metrics add column if not exists source text not null default 'app';
alter table public.body_metrics drop constraint if exists body_metrics_source_check;
alter table public.body_metrics add constraint body_metrics_source_check check (source in ('app', 'staff', 'scale_csv'));
alter table public.body_metrics add column if not exists recorded_by uuid default auth.uid();
create unique index if not exists body_metrics_import_uidx on public.body_metrics (member_id, measured_at) where source <> 'app';

-- El socio solo edita lo que cargó él; lo del profe/balanza lo edita el profe.
drop policy if exists body_metrics_member_write on public.body_metrics;
create policy body_metrics_member_write on public.body_metrics for all to authenticated
  using (member_id in (select private.actable_member_ids()) and source = 'app')
  with check (member_id in (select private.actable_member_ids()) and source = 'app');
drop policy if exists body_metrics_coach_write on public.body_metrics;
create policy body_metrics_coach_write on public.body_metrics for all to authenticated
  using ((select private.is_coach(org_id)) and source <> 'app')
  with check ((select private.is_coach(org_id)) and source <> 'app');

-- Importación del CSV de la balanza. Busca al socio por DNI (solo dígitos).
-- p_rows: [{"dni":"30111222","measured_at":"2026-11-02T10:30:00-03:00","weight_kg":80.1,
--           "body_fat_pct":22.3,"muscle_kg":35.2,"visceral_fat":8,"water_pct":55.1,"bmr_kcal":1700}]
create or replace function public.scale_import(p_org uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r          jsonb;
  v_member   uuid;
  v_dni      text;
  v_at       timestamptz;
  v_meas     jsonb;
  v_ok       int := 0;
  v_dup      int := 0;
  v_bad      int := 0;
  v_unmatched text[] := '{}';
  v_id       uuid;
begin
  if not private.is_coach(p_org) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then raise exception 'TOO_MANY_ROWS' using errcode = 'P0001'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      v_dni := regexp_replace(coalesce(r ->> 'dni', ''), '\D', '', 'g');
      v_at := (r ->> 'measured_at')::timestamptz;
      if v_dni = '' or v_at is null or v_at > now() + interval '1 day' then v_bad := v_bad + 1; continue; end if;
      -- Si dos fichas tienen el mismo DNI (con y sin puntos) no adivinamos: queda sin asignar
      select case when count(*) = 1 then min(m.id::text)::uuid end into v_member from public.members m
       where m.org_id = p_org and m.status <> 'archived'
         and regexp_replace(coalesce(m.document_id, ''), '\D', '', 'g') = v_dni;
      if v_member is null then
        if not v_dni = any (v_unmatched) and cardinality(v_unmatched) < 100 then v_unmatched := v_unmatched || v_dni; end if;
        continue;
      end if;
      v_meas := jsonb_strip_nulls(jsonb_build_object(
        'muscle_kg',    nullif(r ->> 'muscle_kg', '')::numeric,
        'visceral_fat', nullif(r ->> 'visceral_fat', '')::numeric,
        'water_pct',    nullif(r ->> 'water_pct', '')::numeric,
        'bmr_kcal',     nullif(r ->> 'bmr_kcal', '')::numeric));
      insert into public.body_metrics (org_id, member_id, measured_at, weight_kg, body_fat_pct, measurements, source)
      values (p_org, v_member, v_at, nullif(r ->> 'weight_kg', '')::numeric, nullif(r ->> 'body_fat_pct', '')::numeric, v_meas, 'scale_csv')
      on conflict (member_id, measured_at) where source <> 'app' do nothing
      returning id into v_id;
      if v_id is null then v_dup := v_dup + 1; else v_ok := v_ok + 1; end if;
      v_id := null;
    exception when others then
      v_bad := v_bad + 1;   -- fila con números inválidos: se saltea, no frena el resto
    end;
  end loop;
  return jsonb_build_object('imported', v_ok, 'duplicates', v_dup, 'invalid', v_bad, 'unmatched', to_jsonb(v_unmatched));
end $$;

-- ---------------------------------------------------------------------
-- 4 · Retos
-- ---------------------------------------------------------------------
alter table public.member_rewards drop constraint if exists member_rewards_kind_check;
alter table public.member_rewards add constraint member_rewards_kind_check
  check (kind in ('birthday', 'referral_new', 'referral_by', 'challenge'));

create table if not exists public.challenges (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  title         text not null check (length(btrim(title)) between 3 and 80),
  description   text check (length(description) <= 500),
  metric        text not null check (metric in ('visits', 'workouts', 'volume_kg', 'classes')),
  goal          numeric(12, 1) not null check (goal > 0 and goal <= 10000000),
  starts_on     date not null,
  ends_on       date not null,
  reward_days   int not null default 0 check (reward_days between 0 and 30),
  show_ranking  boolean not null default true,
  status        text not null default 'active' check (status in ('active', 'canceled', 'settled')),
  settled_at    timestamptz,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  unique (id, org_id),
  check (ends_on >= starts_on and ends_on - starts_on <= 92)
);
create index if not exists challenges_org on public.challenges (org_id, ends_on desc);

create table if not exists public.challenge_participants (
  challenge_id  uuid not null,
  org_id        uuid not null,
  member_id     uuid not null,
  joined_at     timestamptz not null default now(),
  final_progress numeric(14, 1),
  completed     boolean,
  reward_status text,                                    -- applied / pending / null
  primary key (challenge_id, member_id),
  foreign key (challenge_id, org_id) references public.challenges (id, org_id) on delete cascade,
  foreign key (member_id, org_id)    references public.members (id, org_id) on delete cascade
);
create index if not exists challenge_participants_member on public.challenge_participants (member_id);

alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;
revoke all on public.challenges, public.challenge_participants from anon, authenticated;
grant select on public.challenges, public.challenge_participants to authenticated;
create policy challenges_select on public.challenges for select to authenticated
  using (org_id in (select private.my_org_ids()));
create policy challenge_participants_select on public.challenge_participants for select to authenticated
  using (member_id in (select private.actable_member_ids()) or (select private.has_permission(org_id, 'members.write')));

-- Avance de un socio en un reto, con datos reales y en la hora del gimnasio
create or replace function private.challenge_progress(p_challenge uuid, p_member uuid) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare
  c      public.challenges;
  v_tz   text;
  v_from timestamptz;
  v_to   timestamptz;
  v      numeric;
begin
  select * into c from public.challenges where id = p_challenge;
  if not found then return 0; end if;
  select timezone into v_tz from public.organizations where id = c.org_id;
  v_from := private.org_midnight(c.org_id, c.starts_on);
  v_to := private.org_midnight(c.org_id, c.ends_on + 1);
  if c.metric = 'visits' then
    select count(distinct (ch.created_at at time zone v_tz)::date) into v from public.checkins ch
     where ch.member_id = p_member and ch.allowed and ch.created_at >= v_from and ch.created_at < v_to;
  elsif c.metric = 'workouts' then
    select count(*) into v from public.workout_logs w
     where w.member_id = p_member and w.performed_at >= v_from and w.performed_at < v_to;
  elsif c.metric = 'volume_kg' then
    select coalesce(sum(s.reps * s.weight_kg), 0) into v from public.set_logs s
      join public.workout_logs w on w.id = s.workout_log_id
     where w.member_id = p_member and w.performed_at >= v_from and w.performed_at < v_to;
  else
    select count(*) into v from public.bookings b
      join public.class_sessions cs on cs.id = b.session_id
     where b.member_id = p_member and b.status = 'checked_in' and cs.starts_at >= v_from and cs.starts_at < v_to;
  end if;
  return round(coalesce(v, 0), 1);
end $$;

-- Ranking de un reto (participantes ordenados por avance)
create or replace function private.challenge_board(p_challenge uuid) returns table (member_id uuid, name text, progress numeric, pos int)
language sql stable security definer set search_path = '' as $$
  select x.member_id, x.name, x.progress, (rank() over (order by x.progress desc))::int
    from (select p.member_id, private.short_name(m.first_name, m.last_name) as name,
                 coalesce(p.final_progress, private.challenge_progress(p.challenge_id, p.member_id)) as progress
            from public.challenge_participants p join public.members m on m.id = p.member_id
           where p.challenge_id = p_challenge) x
$$;

-- App del socio: retos vigentes, próximos y recién terminados
create or replace function public.member_challenges(p_member uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_today date;
begin
  if p_member not in (select private.actable_member_ids()) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select m.org_id, (now() at time zone o.timezone)::date into v_org, v_today
    from public.members m join public.organizations o on o.id = m.org_id where m.id = p_member;
  return coalesce((
    select jsonb_agg(x order by x.sort_key, x.ends_on) from (
      select c.id, c.title, c.description, c.metric, c.goal, c.starts_on, c.ends_on, c.reward_days, c.show_ranking, c.status,
             case when c.status = 'settled' or c.ends_on < v_today then 2 when c.starts_on > v_today then 1 else 0 end as sort_key,
             case when c.status = 'settled' or c.ends_on < v_today then 'ended' when c.starts_on > v_today then 'upcoming' else 'live' end as phase,
             (p.member_id is not null) as joined,
             case when p.member_id is not null then coalesce(p.final_progress, private.challenge_progress(c.id, p_member)) end as progress,
             p.completed, p.reward_status,
             (select count(*) from public.challenge_participants q where q.challenge_id = c.id)::int as participants,
             (select b.pos from private.challenge_board(c.id) b where b.member_id = p_member) as my_pos,
             case when c.show_ranking then (
               select jsonb_agg(jsonb_build_object('pos', b.pos, 'name', b.name, 'progress', b.progress, 'me', b.member_id = p_member) order by b.pos, b.name)
                 from (select * from private.challenge_board(c.id) order by pos, name limit 10) b) end as ranking
        from public.challenges c
        left join public.challenge_participants p on p.challenge_id = c.id and p.member_id = p_member
       where c.org_id = v_org and c.status <> 'canceled'
         and c.ends_on >= v_today - 14 and c.starts_on <= v_today + 21
    ) x), '[]'::jsonb);
end $$;

create or replace function public.challenge_join(p_challenge uuid, p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.challenges; m public.members; v_today date;
begin
  if p_member not in (select private.actable_member_ids()) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into m from public.members where id = p_member;
  select * into c from public.challenges where id = p_challenge and org_id = m.org_id;
  if not found then raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0001'; end if;
  select (now() at time zone timezone)::date into v_today from public.organizations where id = c.org_id;
  if c.status <> 'active' or c.ends_on < v_today then raise exception 'CHALLENGE_CLOSED' using errcode = 'P0001'; end if;
  if m.status <> 'active' then raise exception 'MEMBER_NOT_ACTIVE' using errcode = 'P0001'; end if;
  insert into public.challenge_participants (challenge_id, org_id, member_id) values (c.id, c.org_id, p_member)
  on conflict do nothing;
end $$;

create or replace function public.challenge_leave(p_challenge uuid, p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_member not in (select private.actable_member_ids()) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  delete from public.challenge_participants p using public.challenges c
   where p.challenge_id = p_challenge and p.member_id = p_member and c.id = p.challenge_id and c.status = 'active';
end $$;

-- Panel: lista de retos con anotados, completados y los 5 primeros
create or replace function public.challenge_admin_list(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_today date;
begin
  if not private.has_permission(p_org, 'members.write') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select (now() at time zone timezone)::date into v_today from public.organizations where id = p_org;
  return coalesce((
    select jsonb_agg(x order by x.ends_on desc) from (
      select c.id, c.title, c.description, c.metric, c.goal, c.starts_on, c.ends_on, c.reward_days, c.show_ranking, c.status,
             case when c.status = 'canceled' then 'canceled' when c.status = 'settled' then 'settled'
                  when c.ends_on < v_today then 'to_settle' when c.starts_on > v_today then 'upcoming' else 'live' end as phase,
             (select count(*) from public.challenge_participants p where p.challenge_id = c.id)::int as participants,
             (select count(*) from private.challenge_board(c.id) b where b.progress >= c.goal)::int as reached,
             (select jsonb_agg(jsonb_build_object('pos', b.pos, 'name', b.name, 'progress', b.progress) order by b.pos, b.name)
                from (select * from private.challenge_board(c.id) order by pos, name limit 5) b) as top
        from public.challenges c where c.org_id = p_org
       order by c.ends_on desc limit 50
    ) x), '[]'::jsonb);
end $$;

create or replace function public.challenge_save(
  p_org uuid, p_id uuid, p_title text, p_description text, p_metric text, p_goal numeric,
  p_starts_on date, p_ends_on date, p_reward_days int, p_show_ranking boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.engagement_can_manage(p_org) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.challenges (org_id, title, description, metric, goal, starts_on, ends_on, reward_days, show_ranking)
    values (p_org, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), p_metric, p_goal, p_starts_on, p_ends_on,
            coalesce(p_reward_days, 0), coalesce(p_show_ranking, true))
    returning id into v_id;
  else
    update public.challenges
       set title = btrim(p_title), description = nullif(btrim(coalesce(p_description, '')), ''), metric = p_metric, goal = p_goal,
           starts_on = p_starts_on, ends_on = p_ends_on, reward_days = coalesce(p_reward_days, 0),
           show_ranking = coalesce(p_show_ranking, true)
     where id = p_id and org_id = p_org and status = 'active'
    returning id into v_id;
    if v_id is null then raise exception 'CHALLENGE_CLOSED' using errcode = 'P0001'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.challenge_cancel(p_challenge uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select org_id into v_org from public.challenges where id = p_challenge;
  if v_org is null or not private.engagement_can_manage(v_org) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update public.challenges set status = 'canceled' where id = p_challenge and status = 'active';
end $$;

-- Cierra un reto terminado: guarda el avance final y premia a los que llegaron (una sola vez).
create or replace function private.challenge_settle_one(p_challenge uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare c public.challenges; p record; v_n int := 0; v_prog numeric; v_res text;
begin
  select * into c from public.challenges where id = p_challenge and status = 'active' for update;
  if not found then return 0; end if;
  for p in select * from public.challenge_participants where challenge_id = c.id for update loop
    v_prog := private.challenge_progress(c.id, p.member_id);
    v_res := null;
    if v_prog >= c.goal and c.reward_days > 0 then
      v_res := coalesce(private.engagement_grant(p.member_id, 'challenge', c.id::text, c.reward_days), 'applied');
    end if;
    update public.challenge_participants
       set final_progress = v_prog, completed = v_prog >= c.goal, reward_status = v_res
     where challenge_id = c.id and member_id = p.member_id;
    if v_prog >= c.goal then v_n := v_n + 1; end if;
  end loop;
  update public.challenges set status = 'settled', settled_at = now() where id = c.id;
  return v_n;
end $$;

-- Cron diario (servidor): cierra los retos que ya terminaron
create or replace function public.challenges_settle_due() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; v int := 0;
begin
  for r in select c.id from public.challenges c join public.organizations o on o.id = c.org_id
            where c.status = 'active' and c.ends_on < (now() at time zone o.timezone)::date loop
    perform private.challenge_settle_one(r.id);
    v := v + 1;
  end loop;
  return v;
end $$;

-- Panel: "Cerrar y premiar" (solo si ya terminó)
create or replace function public.challenge_settle(p_challenge uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare c public.challenges; v_today date;
begin
  select * into c from public.challenges where id = p_challenge;
  if not found or not private.engagement_can_manage(c.org_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select (now() at time zone timezone)::date into v_today from public.organizations where id = c.org_id;
  if c.ends_on >= v_today then raise exception 'CHALLENGE_NOT_ENDED' using errcode = 'P0001'; end if;
  return private.challenge_settle_one(p_challenge);
end $$;

-- Los premios por reto se ven junto a los demás días ganados
-- (member_engagement ya suma referidos; acá solo exponemos el total por reto en member_challenges)

-- ---------------------------------------------------------------------
-- 5 · Permisos de funciones
-- ---------------------------------------------------------------------
revoke execute on function private.is_coach(uuid), private.short_name(text, text), private.survey_pending(uuid),
  private.challenge_progress(uuid, uuid), private.challenge_board(uuid), private.challenge_settle_one(uuid)
  from public, anon;
revoke execute on function private.challenge_settle_one(uuid) from authenticated;
grant execute on function private.is_coach(uuid) to authenticated;   -- lo usan las políticas RLS

revoke execute on function public.member_survey(uuid), public.survey_answer(uuid, text, int, text),
  public.nps_report(uuid, int), public.nps_set_enabled(uuid, boolean),
  public.scale_import(uuid, jsonb),
  public.member_challenges(uuid), public.challenge_join(uuid, uuid), public.challenge_leave(uuid, uuid),
  public.challenge_admin_list(uuid),
  public.challenge_save(uuid, uuid, text, text, text, numeric, date, date, int, boolean),
  public.challenge_cancel(uuid), public.challenge_settle(uuid), public.challenges_settle_due()
  from public, anon;
grant execute on function public.member_survey(uuid), public.survey_answer(uuid, text, int, text),
  public.nps_report(uuid, int), public.nps_set_enabled(uuid, boolean),
  public.scale_import(uuid, jsonb),
  public.member_challenges(uuid), public.challenge_join(uuid, uuid), public.challenge_leave(uuid, uuid),
  public.challenge_admin_list(uuid),
  public.challenge_save(uuid, uuid, text, text, text, numeric, date, date, int, boolean),
  public.challenge_cancel(uuid), public.challenge_settle(uuid)
  to authenticated;
revoke execute on function public.challenges_settle_due() from authenticated;
grant execute on function public.challenges_settle_due() to service_role;

-- ---------------------------------------------------------------------
-- 6 · Agenda (pg_cron): cerrar retos vencidos todos los días 03:15 UTC
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $c$select cron.schedule('challenges-settle', '15 3 * * *', 'select public.challenges_settle_due()')$c$;
  end if;
end $$;
