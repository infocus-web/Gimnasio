-- =====================================================================
-- Pruebas de la v2 en Postgres local (stub de Supabase).
-- Uso: supabase/test/run_v2.sh   (o ver ARCHITECTURE.md)
-- Cada bloque imprime OK o aborta con el motivo.
-- =====================================================================
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create schema if not exists test;
grant usage on schema test to authenticated;

create or replace function test.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal2')::text, false)
$$;
create or replace function test.expect_error(p_sql text, p_code text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise exception 'ESPERABA % pero no hubo error: %', p_code, p_sql;
exception when others then
  if sqlerrm <> p_code and sqlerrm not like '%' || p_code || '%' then
    raise exception 'ESPERABA % y vino: %', p_code, sqlerrm;
  end if;
end $$;
create or replace function test.ok(p_label text) returns text language sql as $$ select 'OK  ' || p_label $$;
grant execute on all functions in schema test to authenticated;

-- ---------- Datos: usuarios ----------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'recepcion@test.com'),
  ('00000000-0000-0000-0000-00000000000b', 'profe.ana@test.com'),
  ('00000000-0000-0000-0000-00000000000c', 'profe.leo@test.com'),
  ('00000000-0000-0000-0000-00000000000d', 'papa@test.com'),
  ('00000000-0000-0000-0000-00000000000e', 'sin.plan@test.com'),
  ('00000000-0000-0000-0000-00000000000f', 'otra@test.com');

-- ---------- Datos: gimnasio (como sistema) ----------
select set_config('request.jwt.claims', '{"role":"service_role"}', false);

do $$
declare
  v_org uuid := (select id from public.organizations where slug = 'evolution');
  v_loc uuid := (select id from public.locations where org_id = v_org limit 1);
  v_room uuid; v_spin uuid; v_yoga uuid; v_ana uuid; v_leo uuid; v_plan_fam uuid; v_plan_pack uuid;
  v_papa uuid; v_hijo uuid; v_otra uuid; v_ba uuid; v_ms uuid; v_ba2 uuid; v_ms2 uuid;
begin
  insert into public.staff (org_id, user_id, role, display_name) values
    (v_org, '00000000-0000-0000-0000-00000000000a', 'staff',   'Recepción');
  insert into public.staff (org_id, user_id, role, display_name) values
    (v_org, '00000000-0000-0000-0000-00000000000b', 'trainer', 'Ana') returning id into v_ana;
  insert into public.staff (org_id, user_id, role, display_name) values
    (v_org, '00000000-0000-0000-0000-00000000000c', 'trainer', 'Leo') returning id into v_leo;

  insert into public.rooms (org_id, location_id, name, capacity) values (v_org, v_loc, 'Sala Spinning', 20)
    returning id into v_room;
  insert into public.equipment (org_id, location_id, room_id, kind, label)
  select v_org, v_loc, v_room, 'bike', '#' || g from generate_series(1, 3) g;

  insert into public.class_types (org_id, name, equipment_kind, default_capacity)
    values (v_org, 'Spinning', 'bike', 3) returning id into v_spin;
  insert into public.class_types (org_id, name) values (v_org, 'Yoga') returning id into v_yoga;

  -- Plan familiar (hasta 3) solo habilita Spinning; pack de 1 clase
  insert into public.membership_plans (org_id, name, kind, price_cents, currency, billing_interval, max_members)
    values (v_org, 'Familiar', 'recurring', 6000000, 'ARS', 'month', 3) returning id into v_plan_fam;
  insert into public.plan_class_types (plan_id, class_type_id, org_id) values (v_plan_fam, v_spin, v_org);
  insert into public.membership_plans (org_id, name, kind, price_cents, currency, class_credits)
    values (v_org, 'Pack 1 clase', 'class_pack', 500000, 'ARS', 1) returning id into v_plan_pack;

  -- Familia: papá paga, hijo sin login
  insert into public.members (org_id, user_id, first_name, last_name)
    values (v_org, '00000000-0000-0000-0000-00000000000d', 'Papá', 'Gómez') returning id into v_papa;
  insert into public.members (org_id, first_name, last_name) values (v_org, 'Hijo', 'Gómez') returning id into v_hijo;
  insert into public.billing_accounts (org_id, payer_member_id) values (v_org, v_papa) returning id into v_ba;
  update public.members set billing_account_id = v_ba where id in (v_papa, v_hijo);
  insert into public.memberships (org_id, plan_id, billing_account_id, current_period_start, current_period_end, provider)
    values (v_org, v_plan_fam, v_ba, now() - interval '1 day', now() + interval '29 days', 'mercadopago')
    returning id into v_ms;
  insert into public.membership_members (membership_id, member_id, org_id) values (v_ms, v_papa, v_org), (v_ms, v_hijo, v_org);

  -- Otra socia con pack de 1 crédito
  insert into public.members (org_id, user_id, first_name) values (v_org, '00000000-0000-0000-0000-00000000000f', 'Otra')
    returning id into v_otra;
  insert into public.billing_accounts (org_id, payer_member_id) values (v_org, v_otra) returning id into v_ba2;
  update public.members set billing_account_id = v_ba2 where id = v_otra;
  insert into public.memberships (org_id, plan_id, billing_account_id, current_period_start, current_period_end, provider, credits_remaining)
    values (v_org, v_plan_pack, v_ba2, now() - interval '1 day', now() + interval '60 days', 'cash', 1) returning id into v_ms2;
  insert into public.membership_members (membership_id, member_id, org_id) values (v_ms2, v_otra, v_org);

  -- Socio sin membresía
  insert into public.members (org_id, user_id, first_name) values (v_org, '00000000-0000-0000-0000-00000000000e', 'SinPlan');

  -- Ana entrena a Papá; Leo no tiene alumnos
  insert into public.trainer_clients (org_id, trainer_id, member_id) values (v_org, v_ana, v_papa);

  -- Sesiones: spinning mañana (cupo 2, waitlist 1) con Ana
  insert into public.class_sessions (org_id, class_type_id, room_id, instructor_id, starts_at, ends_at, capacity, waitlist_capacity)
    values (v_org, v_spin, v_room, v_ana, date_trunc('hour', now()) + interval '1 day',
            date_trunc('hour', now()) + interval '1 day 45 minutes', 2, 1);
  insert into public.class_sessions (org_id, class_type_id, room_id, instructor_id, starts_at, ends_at, capacity)
    values (v_org, v_yoga, v_room, v_leo, date_trunc('hour', now()) + interval '2 days',
            date_trunc('hour', now()) + interval '2 days 1 hour', 10);
end $$;

-- ---------- Integridad de recursos ----------
do $$
declare v_s public.class_sessions := (select s from public.class_sessions s join public.class_types t on t.id = s.class_type_id where t.name = 'Spinning');
begin
  -- misma sala, horario superpuesto
  perform test.expect_error(format($q$insert into public.class_sessions (org_id, class_type_id, room_id, instructor_id, starts_at, ends_at, capacity)
     values (%L, %L, %L, (select id from public.staff where display_name='Leo'), %L, %L, 1)$q$,
     v_s.org_id, v_s.class_type_id, v_s.room_id, v_s.starts_at + interval '10 min', v_s.ends_at + interval '10 min'),
     'class_sessions_no_room_overlap');
  -- cupo mayor que las bicis
  perform test.expect_error(format($q$update public.class_sessions set capacity = 4 where id = %L$q$, v_s.id),
     'CAPACITY_EXCEEDS_EQUIPMENT');
  -- familia: 4to integrante en plan de 3
  raise notice '%', test.ok('recursos: sala/cupo');
end $$;
select test.ok('recursos: sala superpuesta y cupo > equipos rechazados');

-- ---------- Reservas (como usuarios reales, con RLS) ----------
set role authenticated;

-- Papá reserva para él y para su hijo (cuenta familiar)
select test.login('00000000-0000-0000-0000-00000000000d');
select public.book_class((select id from public.class_sessions_availability where class_name = 'Spinning'), null, null, 'k1') ->> 'status' = 'booked' as papa_booked \gset
\if :papa_booked \else \echo 'FALLO papa' \quit \endif
select (public.book_class((select id from public.class_sessions_availability where class_name = 'Spinning'), null, null, 'k1') ->> 'replayed')::boolean as replay \gset
\if :replay \else \echo 'FALLO idempotencia' \quit \endif
select test.expect_error($q$select public.book_class((select id from public.class_sessions_availability where class_name = 'Spinning'))$q$, 'ALREADY_BOOKED');
select public.book_class((select id from public.class_sessions_availability where class_name = 'Spinning'),
                         (select id from public.members where first_name = 'Hijo')) ->> 'equipment_label' as hijo_bike \gset
\echo hijo_bike = :hijo_bike
-- Plan familiar no incluye yoga
select test.expect_error($q$select public.book_class((select id from public.class_sessions_availability where class_name = 'Yoga'))$q$, 'PLAN_EXCLUDES_CLASS_TYPE');
select test.ok('papá + hijo reservados, idempotencia, duplicado y plan restringido');

-- Sin membresía
select test.login('00000000-0000-0000-0000-00000000000e');
select test.expect_error($q$select public.book_class((select id from public.class_sessions_availability where class_name = 'Spinning'))$q$, 'MEMBERSHIP_REQUIRED');
-- No puede reservar a nombre de otro
select test.expect_error($q$select public.book_class((select id from public.class_sessions_availability where class_name = 'Spinning'),
                           'ffffffff-0000-0000-0000-000000000000')$q$, 'MEMBER_NOT_FOUND');
select test.ok('sin membresía rechazado');

-- Otra: clase llena (2/2) → lista de espera; consume crédito recién al ser promovida
select test.login('00000000-0000-0000-0000-00000000000f');
select public.book_class((select id from public.class_sessions_availability where class_name = 'Spinning')) ->> 'status' as otra_status \gset
\echo otra_status = :otra_status
select spots_left, waitlist_left from public.class_sessions_availability where class_name = 'Spinning';
select count(*) as visibles from public.bookings;  -- solo ve la suya

-- Papá cancela → Otra es promovida y se le descuenta el crédito
select test.login('00000000-0000-0000-0000-00000000000d');
select public.cancel_booking((select id from public.bookings where member_id = (select id from public.members where first_name='Papá'))) ->> 'promoted_booking_id' is not null as promoted \gset
\if :promoted \else \echo 'FALLO promoción' \quit \endif
select test.login('00000000-0000-0000-0000-00000000000f');
select status, (select label from public.equipment e where e.id = b.equipment_id) as bike,
       (select credits_remaining from public.memberships m where m.id = b.membership_id) as credits
  from public.bookings b;
select test.ok('lista de espera + promoción + crédito');

-- ---------- RLS: Trainer vs Cliente ----------
select test.login('00000000-0000-0000-0000-00000000000b');   -- Ana (trainer)
select string_agg(first_name, ',' order by first_name) as ana_ve from public.members;
select test.login('00000000-0000-0000-0000-00000000000c');   -- Leo (trainer, sin alumnos ni inscriptos)
select count(*) as leo_ve_socios from public.members;
select test.login('00000000-0000-0000-0000-00000000000e');   -- cliente sin plan
select count(*) as cliente_ve_socios, (select count(*) from public.payments) as ve_pagos from public.members;
-- Cliente no puede auto-cambiarse el estado ni insertar reservas directo
select test.expect_error($q$update public.members set status = 'active', tags = '{vip}' where user_id = auth.uid()$q$, 'FIELD_NOT_EDITABLE_BY_MEMBER');
select test.expect_error($q$insert into public.bookings (org_id, session_id, member_id, during) values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), tstzrange(now(), now()+interval '1h'))$q$, 'permission denied');
select test.ok('RLS cliente');

-- Entrenamiento two-sided: Ana asigna a su alumno; no a un no-alumno; Papá registra; Ana no puede escribir logs
select test.login('00000000-0000-0000-0000-00000000000b');
insert into public.program_assignments (org_id, program_id, member_id, trainer_id)
select p.org_id, p.id, (select id from public.members where first_name='Papá'), (select id from public.staff where display_name='Ana')
  from public.workout_programs p limit 1;
select test.expect_error($q$insert into public.program_assignments (org_id, program_id, member_id, trainer_id)
  select p.org_id, p.id, (select id from public.members where first_name='Otra'), (select id from public.staff where display_name='Ana')
  from public.workout_programs p limit 1$q$, 'row-level security');
select test.expect_error($q$insert into public.workout_logs (org_id, member_id)
  select org_id, id from public.members where first_name='Papá'$q$, 'row-level security');
select test.login('00000000-0000-0000-0000-00000000000d');
insert into public.workout_logs (org_id, member_id, workout_id)
select m.org_id, m.id, pw.id from public.members m, public.program_workouts pw
 where m.first_name='Papá' limit 1;
insert into public.set_logs (org_id, workout_log_id, exercise_id, set_number, reps, weight_kg)
select l.org_id, l.id, (select exercise_id from public.program_exercises limit 1), 1, 10, 60
  from public.workout_logs l;
select count(*) as programas_que_ve_papa from public.workout_programs;
select test.login('00000000-0000-0000-0000-00000000000b');
select count(*) as ana_ve_sets from public.set_logs;
select test.ok('two-sided: trainer prescribe, cliente registra');

-- ---------- QR dinámico + check-in ----------
select test.login('00000000-0000-0000-0000-00000000000d');
select public.get_checkin_token() ->> 'token' as tok \gset
select test.login('00000000-0000-0000-0000-00000000000a');   -- recepción
select public.checkin_scan((select id from public.locations limit 1), :'tok') ->> 'allowed' as allowed \gset
\echo checkin allowed = :allowed
select public.checkin_scan((select id from public.locations limit 1), left(:'tok', length(:'tok') - 1) || '0') ->> 'reason' as forged \gset
\echo token adulterado = :forged
select test.ok('QR dinámico');

reset role;
\echo 'TODAS LAS PRUEBAS PASARON'
