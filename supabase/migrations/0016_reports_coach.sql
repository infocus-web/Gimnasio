-- =====================================================================
-- Evolution Platform v2 · 0016 · Reportes y vista de profesores
--   · org_report(): métricas del negocio en una sola llamada (reports.read)
--   · mark_attendance(): el profe de la clase (o recepción) marca presente / ausente
--   · coach_client_overview: alumnos con última entrada, último entrenamiento y rutina
-- =====================================================================

create or replace function public.org_report(p_org uuid, p_months int default 12)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz    text;
  v_from  timestamptz;
  v_res   jsonb;
begin
  if not private.has_permission(p_org, 'reports.read') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select timezone into v_tz from public.organizations where id = p_org;
  p_months := least(greatest(coalesce(p_months, 12), 1), 36);
  v_from := date_trunc('month', now() at time zone v_tz) at time zone v_tz - make_interval(months => p_months - 1);

  with months as (
    select to_char(m, 'YYYY-MM') as month
      from generate_series(date_trunc('month', v_from at time zone v_tz), date_trunc('month', now() at time zone v_tz), interval '1 month') m
  ),
  revenue as (
    select to_char(date_trunc('month', paid_at at time zone v_tz), 'YYYY-MM') as month, sum(amount_cents) as cents, count(*) as n
      from public.payments
     where org_id = p_org and status = 'succeeded' and paid_at >= v_from
     group by 1
  ),
  signups as (
    select to_char(date_trunc('month', created_at at time zone v_tz), 'YYYY-MM') as month, count(*) as n
      from public.members where org_id = p_org and created_at >= v_from group by 1
  ),
  -- Bajas: cuentas cuya última membresía venció en ese mes y no se renovó (más de 7 días vencida)
  lapsed as (
    select to_char(date_trunc('month', last_end at time zone v_tz), 'YYYY-MM') as month, count(*) as n
      from (select billing_account_id, max(current_period_end) as last_end
              from public.memberships where org_id = p_org and status <> 'canceled' group by 1) x
     where last_end >= v_from and last_end < now() - interval '7 days'
     group by 1
  ),
  visits as (
    select to_char(date_trunc('month', created_at at time zone v_tz), 'YYYY-MM') as month, count(*) as n
      from public.checkins where org_id = p_org and allowed and created_at >= v_from group by 1
  )
  select jsonb_build_object(
    'months', (select jsonb_agg(jsonb_build_object(
                  'month', mo.month,
                  'revenue_cents', coalesce(r.cents, 0),
                  'payments', coalesce(r.n, 0),
                  'signups', coalesce(s.n, 0),
                  'lapsed', coalesce(l.n, 0),
                  'visits', coalesce(v.n, 0)) order by mo.month)
                 from months mo
                 left join revenue r on r.month = mo.month
                 left join signups s on s.month = mo.month
                 left join lapsed l on l.month = mo.month
                 left join visits v on v.month = mo.month)
  ) into v_res;

  v_res := v_res || jsonb_build_object(
    'active_members', (select count(*) from public.members where org_id = p_org and status = 'active'),
    'with_plan', (select count(distinct mm.member_id)
                    from public.membership_members mm join public.memberships ms on ms.id = mm.membership_id
                   where ms.org_id = p_org and ms.status in ('active', 'trialing') and ms.current_period_end >= now()),
    'overdue', (select count(*) from (select billing_account_id, max(current_period_end) e from public.memberships
                                        where org_id = p_org and status in ('active', 'past_due') group by 1) x where e < now()),
    'mrr_cents', (select coalesce(sum(case p.billing_interval
                                        when 'month' then p.price_cents / p.interval_count
                                        when 'week'  then p.price_cents * 52 / 12 / p.interval_count
                                        when 'year'  then p.price_cents / 12 / p.interval_count
                                        else 0 end), 0)
                    from public.memberships ms join public.membership_plans p on p.id = ms.plan_id
                   where ms.org_id = p_org and ms.status = 'active' and ms.current_period_end >= now() and p.kind = 'recurring'),
    'plans', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'members', n) order by n desc), '[]'::jsonb) from (
                select p.name, count(distinct mm.member_id) as n
                  from public.memberships ms
                  join public.membership_plans p on p.id = ms.plan_id
                  join public.membership_members mm on mm.membership_id = ms.id
                 where ms.org_id = p_org and ms.status = 'active' and ms.current_period_end >= now()
                 group by p.name) x),
    -- Entradas por día y hora (últimas 8 semanas)
    'heatmap', (select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'hour', hr, 'n', n)), '[]'::jsonb) from (
                  select extract(isodow from created_at at time zone v_tz)::int as dow,
                         extract(hour from created_at at time zone v_tz)::int as hr, count(*) as n
                    from public.checkins
                   where org_id = p_org and allowed and created_at >= now() - interval '8 weeks'
                   group by 1, 2) x),
    -- Ocupación de clases (últimas 8 semanas, clases ya dadas)
    'occupancy', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'color', color, 'sessions', sessions,
                                                               'avg_pct', avg_pct, 'attended_pct', attended_pct) order by avg_pct desc), '[]'::jsonb) from (
                    select ct.name, ct.color, count(distinct s.id) as sessions,
                           round(100.0 * avg(c.booked::numeric / s.capacity))::int as avg_pct,
                           round(100.0 * sum(c.attended) / nullif(sum(c.booked), 0))::int as attended_pct
                      from public.class_sessions s
                      join public.class_types ct on ct.id = s.class_type_id
                      cross join lateral (select count(*) filter (where b.status in ('booked', 'checked_in', 'no_show')) as booked,
                                                 count(*) filter (where b.status = 'checked_in') as attended
                                            from public.bookings b where b.session_id = s.id) c
                     where s.org_id = p_org and s.status <> 'canceled'
                       and s.starts_at < now() and s.starts_at >= now() - interval '8 weeks'
                     group by ct.name, ct.color) x),
    -- En riesgo: plan vigente y más de 10 días sin venir
    'at_risk', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'phone', phone,
                                                             'last_checkin_at', last_checkin_at, 'plan', plan) order by last_checkin_at nulls first), '[]'::jsonb) from (
                  select distinct on (m.id) m.id, trim(m.first_name || ' ' || m.last_name) as name, m.phone, m.last_checkin_at, p.name as plan
                    from public.members m
                    join public.membership_members mm on mm.member_id = m.id
                    join public.memberships ms on ms.id = mm.membership_id and ms.status = 'active' and ms.current_period_end >= now()
                    join public.membership_plans p on p.id = ms.plan_id
                   where m.org_id = p_org and m.status = 'active'
                     and coalesce(m.last_checkin_at, m.created_at) < now() - interval '10 days'
                   order by m.id
                   limit 50) x)
  );
  return v_res;
end $$;
revoke execute on function public.org_report(uuid, int) from public, anon;
grant execute on function public.org_report(uuid, int) to authenticated;

-- Asistencia: el profe de ESA clase o quien tenga bookings.manage
create or replace function public.mark_attendance(p_booking uuid, p_status public.booking_status) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_b public.bookings;
  v_s public.class_sessions;
begin
  if p_status not in ('booked', 'checked_in', 'no_show') then raise exception 'INVALID_STATUS'; end if;
  select * into v_b from public.bookings where id = p_booking for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  select * into v_s from public.class_sessions where id = v_b.session_id;
  if not (private.has_permission(v_b.org_id, 'bookings.manage')
          or v_s.instructor_id = private.staff_id(v_b.org_id)) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_b.status not in ('booked', 'checked_in', 'no_show') then raise exception 'BOOKING_NOT_CANCELABLE'; end if;
  if v_s.starts_at > now() + interval '30 minutes' then raise exception 'SESSION_NOT_STARTED'; end if;
  update public.bookings set status = p_status where id = p_booking;
  if p_status = 'checked_in' then
    update public.members set last_checkin_at = greatest(coalesce(last_checkin_at, v_s.starts_at), v_s.starts_at)
     where id = v_b.member_id;
  end if;
end $$;
revoke execute on function public.mark_attendance(uuid, public.booking_status) from public, anon;
grant execute on function public.mark_attendance(uuid, public.booking_status) to authenticated;

-- Alumnos de cada profe con su actividad (respeta RLS: el profe ve solo los suyos)
create or replace view public.coach_client_overview with (security_invoker = true) as
select m.id as member_id, m.org_id, trim(m.first_name || ' ' || m.last_name) as member_name, m.phone, m.medical_notes,
       m.last_checkin_at, m.photo_url,
       tc.trainer_id, st.display_name as trainer_name, tc.since,
       (select max(l.performed_at) from public.workout_logs l where l.member_id = m.id) as last_workout_at,
       (select count(*) from public.workout_logs l where l.member_id = m.id and l.performed_at >= now() - interval '30 days') as workouts_30d,
       (select p.name from public.program_assignments pa join public.workout_programs p on p.id = pa.program_id
         where pa.member_id = m.id and pa.status = 'active' order by pa.starts_on desc limit 1) as program_name
  from public.trainer_clients tc
  join public.members m on m.id = tc.member_id
  join public.staff st on st.id = tc.trainer_id;
grant select on public.coach_client_overview to authenticated;
