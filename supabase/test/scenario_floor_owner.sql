-- Pruebas de 0031 (sala y tablero del dueño). Corre después del resto de los escenarios.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);

-- ---------- Otro gimnasio (para aislar el tablero y probar "máquina de otro gimnasio") ----------
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'duenio.d@test.com');
select test.login('00000000-0000-0000-0000-0000000000d1');
select (public.create_organization('Gym D', 'gym-d-test', 'Dueño D')).id as gymd \gset
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select id as evo from public.organizations where slug = 'evolution' \gset

-- ---------- Datos de entrenamiento (evolution) ----------
do $$
declare
  v_org  uuid := (select id from public.organizations where slug = 'evolution');
  v_ana  uuid := (select id from public.staff where org_id = v_org and display_name = 'Ana');
  v_papa uuid := (select id from public.members where user_id = '00000000-0000-0000-0000-00000000000d');
  v_otra uuid := (select id from public.members where user_id = '00000000-0000-0000-0000-00000000000f');
  e1 uuid; e2 uuid; v_prog uuid; w1 uuid; w2 uuid; v_as uuid; l1 uuid; l2 uuid; l3 uuid;
begin
  insert into public.exercises (org_id, name, muscle_group, video_url) values (v_org, 'Prensa D', 'Piernas', 'https://video.test/prensa') returning id into e1;
  insert into public.exercises (org_id, name, muscle_group) values (v_org, 'Remo D', 'Espalda') returning id into e2;
  insert into public.exercises (org_id, name) values ((select id from public.organizations where slug = 'gym-d-test'), 'Ejercicio ajeno D');
  insert into public.workout_programs (org_id, author_id, name) values (v_org, v_ana, 'Rutina máquina D') returning id into v_prog;
  insert into public.program_workouts (org_id, program_id, day_index, name) values (v_org, v_prog, 1, 'Piernas') returning id into w1;
  insert into public.program_workouts (org_id, program_id, day_index, name) values (v_org, v_prog, 2, 'Espalda') returning id into w2;
  insert into public.program_exercises (org_id, workout_id, exercise_id, position, target_sets, target_reps) values
    (v_org, w1, e1, 0, 4, '10-12'), (v_org, w2, e2, 0, 3, '8');
  update public.program_assignments set status = 'archived' where member_id = v_papa;
  insert into public.program_assignments (org_id, program_id, member_id, trainer_id) values (v_org, v_prog, v_papa, v_ana) returning id into v_as;
  -- Papá: hace 10 días 80 kg × 5 (mejor marca) · hace 3 días hizo el Día 1 con 60 × 10 y 70 × 8 (última carga)
  insert into public.workout_logs (org_id, member_id, performed_at) values (v_org, v_papa, now() - interval '10 days') returning id into l1;
  insert into public.set_logs (org_id, workout_log_id, exercise_id, set_number, reps, weight_kg) values (v_org, l1, e1, 1, 5, 80);
  insert into public.workout_logs (org_id, member_id, assignment_id, workout_id, performed_at)
    values (v_org, v_papa, v_as, w1, now() - interval '3 days') returning id into l2;
  insert into public.set_logs (org_id, workout_log_id, exercise_id, set_number, reps, weight_kg) values
    (v_org, l2, e1, 1, 10, 60), (v_org, l2, e1, 2, 8, 70);
  -- Otra socia levanta 200 kg: nunca le tiene que aparecer a Papá
  insert into public.workout_logs (org_id, member_id, performed_at) values (v_org, v_otra, now() - interval '1 day') returning id into l3;
  insert into public.set_logs (org_id, workout_log_id, exercise_id, set_number, reps, weight_kg) values (v_org, l3, e1, 1, 3, 200);
end $$;
select id as e1 from public.exercises where name = 'Prensa D' \gset
select id as e2 from public.exercises where name = 'Remo D' \gset
select id as e3 from public.exercises where name = 'Ejercicio ajeno D' \gset

-- =====================================================================
-- 1. Máquinas
-- =====================================================================
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000b');   -- Ana (profe)
select public.machine_save(:'evo', null, 'Prensa 45°', 'Piernas', null, true, array[:'e1', :'e2']::uuid[]) as mac \gset
select code as code from public.machines where id = :'mac' \gset
select test.check(:'code' ~ '^[a-z0-9]{6}$', 'código corto generado');
select test.check((select count(*) from public.machine_exercises where machine_id = :'mac') = 2, 'máquina con 2 ejercicios');
select test.expect_error(format($q$select public.machine_save(%L, null, 'X', null, null, true, array[%L]::uuid[])$q$, :'evo', :'e3'), 'EXERCISE_NOT_FOUND');
select test.expect_error(format($q$insert into public.machines (org_id, name, code) values (%L, 'X', 'abcdef')$q$, :'evo'), 'permission denied');
select test.login('00000000-0000-0000-0000-00000000000a');   -- recepción: no maneja la sala
select test.expect_error(format($q$select public.machine_save(%L, null, 'X')$q$, :'evo'), 'FORBIDDEN');
select test.login('00000000-0000-0000-0000-00000000000d');   -- socio: no ve la tabla
select test.check((select count(*) from public.machines) = 0, 'el socio no lee la tabla de máquinas');

-- Máquina del otro gimnasio
select test.login('00000000-0000-0000-0000-0000000000d1');
select public.machine_save(:'gymd', null, 'Máquina D', null, null, true, array[:'e3']::uuid[]) as macd \gset
select code as coded from public.machines where id = :'macd' \gset
select test.expect_error(format($q$select public.machine_save(%L, %L, 'Robada')$q$, :'gymd', :'mac'), 'MACHINE_NOT_FOUND');

-- Sin sesión: máquina y ejercicios, sin datos de nadie
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
set role anon;
select public.machine_view('evolution', :'code') as v \gset
select test.check(:'v'::jsonb ->> 'status' = 'ok' and :'v'::jsonb #>> '{machine,name}' = 'Prensa 45°', 'QR sin sesión: ve la máquina');
select test.check(jsonb_array_length(:'v'::jsonb -> 'exercises') = 2 and :'v'::jsonb #>> '{exercises,0,video_url}' = 'https://video.test/prensa', 'ejercicios con video');
select test.check(:'v'::jsonb -> 'member' = 'null'::jsonb and :'v'::jsonb #> '{exercises,0,last}' = 'null'::jsonb, 'sin sesión no hay datos de socio');
select test.check(public.machine_view('evolution', :'coded') ->> 'status' = 'not_found', 'máquina de otro gimnasio = no encontrada');
select test.check(public.machine_view('gym-d-test', :'code') ->> 'status' = 'not_found', 'código de evolution con otro gimnasio = no encontrada');
select test.check(public.machine_view('evolution', 'zzzzzz') ->> 'status' = 'not_found', 'código inexistente');
select test.expect_error($q$select * from public.machine_exercises$q$, 'permission denied');

-- Papá logueado: SU última carga, SU mejor marca, rutina de hoy
reset role;
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000d');
select public.machine_view('evolution', :'code') as v \gset
select test.check(:'v'::jsonb #>> '{member,first_name}' = 'Papá', 'socio identificado');
select test.check((:'v'::jsonb #>> '{exercises,0,last,sets,0,weight_kg}')::numeric = 60
                  and jsonb_array_length(:'v'::jsonb #> '{exercises,0,last,sets}') = 2, 'última carga = la de hace 3 días (60 y 70 kg)');
select test.check((:'v'::jsonb #>> '{exercises,0,best,weight_kg}')::numeric = 80, 'mejor marca propia = 80 kg (no los 200 de otra socia)');
select test.check(:'v'::jsonb #>> '{exercises,0,in_routine,day_name}' = 'Piernas'
                  and not (:'v'::jsonb #>> '{exercises,0,in_routine,is_today}')::boolean
                  and :'v'::jsonb #>> '{exercises,0,in_routine,target_reps}' = '10-12', 'prensa está en el Día 1 (ya lo hizo)');
select test.check((:'v'::jsonb #>> '{exercises,1,in_routine,is_today}')::boolean, 'remo está en el Día 2 = el de hoy');
select test.check(:'v'::jsonb #> '{exercises,1,last}' = 'null'::jsonb, 'remo nunca registrado');
select test.login('00000000-0000-0000-0000-00000000000f');   -- Otra: ve lo suyo
select test.check((public.machine_view('evolution', :'code') #>> '{exercises,0,best,weight_kg}')::numeric = 200, 'cada socio ve solo lo suyo');
select test.login('00000000-0000-0000-0000-0000000000d1');   -- dueño de otro gimnasio: no es socio acá
select test.check(public.machine_view('evolution', :'code') -> 'member' = 'null'::jsonb, 'staff de otro gimnasio no ve datos de socio');

-- =====================================================================
-- 2. Pantalla de TV
-- =====================================================================
select test.login('aaaaaaaa-0000-0000-0000-000000000001');   -- dueño de evolution
select public.floor_tv_link(:'evo') as tv1 \gset
select test.check((public.floor_tv_settings(:'evo') ->> 'linked')::boolean, 'TV vinculada');
select public.floor_tv_save(:'evo', true, 'Hoy cerramos 20 h');
select test.expect_error($q$select * from public.floor_settings$q$, 'permission denied');
select test.expect_error(format($q$select public.tv_feed(%L)$q$, :'tv1'), 'permission denied');
select test.login('00000000-0000-0000-0000-00000000000b');   -- profe sin training.manage_all: no vincula la TV
select test.expect_error(format($q$select public.floor_tv_link(%L)$q$, :'evo'), 'FORBIDDEN');

reset role;
select test.check((select tv_token_hash from public.floor_settings where org_id = :'evo') = encode(extensions.digest(:'tv1', 'sha256'), 'hex')
                  and (select tv_token_hash from public.floor_settings where org_id = :'evo') <> :'tv1', 'se guarda solo el hash de la clave');
-- entradas de este mes para el ranking (Papá 2 días, Otra 1 día) y un cumpleaños hoy
do $$
declare
  v_org uuid := (select id from public.organizations where slug = 'evolution');
  v_loc uuid := (select id from public.locations where org_id = v_org limit 1);
  v_tz  text := (select timezone from public.organizations where id = v_org);
  v_d1  timestamptz := (date_trunc('month', now() at time zone v_tz) + interval '10 hours') at time zone v_tz;
begin
  insert into public.members (org_id, first_name, last_name, birth_date) values
    (v_org, 'cumple', 'zeta', ((now() at time zone v_tz)::date - interval '30 years')::date);
  insert into public.checkins (org_id, location_id, member_id, method, allowed, created_at)
  select v_org, v_loc, m.id, 'manual', true, t
    from public.members m, unnest(array[v_d1, v_d1 + interval '1 hour', least(now(), v_d1 + interval '1 day')]) t
   where m.user_id = '00000000-0000-0000-0000-00000000000d';
  insert into public.checkins (org_id, location_id, member_id, method, allowed, created_at)
  select v_org, v_loc, m.id, 'manual', true, v_d1 from public.members m where m.user_id = '00000000-0000-0000-0000-00000000000f';
  insert into public.checkins (org_id, location_id, member_id, method, allowed, created_at)
  select v_org, v_loc, m.id, 'manual', true, now() - interval '20 minutes' from public.members m where m.user_id = '00000000-0000-0000-0000-00000000000f';
end $$;
set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select public.tv_feed(:'tv1') as f \gset
select test.check(:'f'::jsonb ->> 'status' = 'ok' and :'f'::jsonb ->> 'message' = 'Hoy cerramos 20 h', 'TV con su clave: ok + mensaje');
select test.check((:'f'::jsonb ->> 'occupancy')::int >= 1, 'concurrencia (entradas recientes)');
select test.check(to_regproc('private.gym_occupancy_calc') is null or :'f'::jsonb ->> 'occupancy_source' = 'gym_occupancy',
                  'usa la concurrencia del frente de accesos si existe');
select test.check(exists (select 1 from jsonb_array_elements(:'f'::jsonb -> 'ranking') r where r ->> 'name' = 'Papá G.'),
                  'ranking con nombre + inicial del apellido');
select test.check(not (:'f'::jsonb::text like '%Gómez%'), 'la TV no muestra apellidos completos');
select test.check(:'f'::jsonb -> 'birthdays' ? 'Cumple Z.', 'cumpleaños de hoy');
select test.check(public.tv_feed('mala') ->> 'status' = 'unauthorized', 'clave inválida');
reset role;
set role authenticated;
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
select public.floor_tv_save(:'evo', false, '');
select public.floor_tv_link(:'evo') as tv2 \gset
reset role;
set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select test.check(public.tv_feed(:'tv1') ->> 'status' = 'unauthorized', 'al vincular otra TV la clave vieja deja de andar');
select test.check(public.tv_feed(:'tv2') -> 'ranking' = '[]'::jsonb and public.tv_feed(:'tv2') -> 'message' = 'null'::jsonb,
                  'ranking desactivado y sin mensaje');

-- =====================================================================
-- 3. Rutinas con IA: límite diario y borrador validado
-- =====================================================================
reset role;
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000b');   -- Ana
select (public.ai_routine_reserve(:'evo') ->> 'ticket') as t1 \gset
select test.expect_error(format($q$select public.ai_routine_create_draft(%L, %s, '{"days":[{"name":"A","exercises":[{"exercise_id":"%s","sets":3,"reps":"10"}]}]}')$q$,
                                :'evo', :'t1', :'e3'), 'EXERCISE_NOT_FOUND');
select test.expect_error(format($q$select public.ai_routine_create_draft(%L, %s, '{"days":[{"name":"A","exercises":[{"exercise_id":"%s","sets":11,"reps":"10"}]}]}')$q$,
                                :'evo', :'t1', :'e1'), 'AI_INVALID_ROUTINE');
select public.ai_routine_create_draft(:'evo', :'t1'::bigint, format(
  '{"name":"Hipertrofia IA","goal":"Hipertrofia","level":"beginner","days":[{"name":"Tren inferior","exercises":[{"exercise_id":"%s","sets":4,"reps":"8-12","rest_seconds":90}]},{"name":"Tren superior","exercises":[{"exercise_id":"%s","sets":3,"reps":"10","rest_seconds":60}]}]}',
  :'e1', :'e2')::jsonb) as draft \gset
select test.check((select is_draft and ai_generated and level = 'beginner' from public.workout_programs where id = :'draft'), 'borrador creado y marcado');
select test.check((select count(*) from public.program_workouts where program_id = :'draft') = 2
                  and (select count(*) from public.program_exercises pe join public.program_workouts w on w.id = pe.workout_id where w.program_id = :'draft') = 2,
                  'borrador con 2 días y sus ejercicios');
select test.expect_error(format($q$select public.ai_routine_create_draft(%L, %s, '{"days":[]}')$q$, :'evo', :'t1'), 'AI_TICKET_INVALID');
select test.check((select count(*) from public.workout_programs where name = 'Rutina sugerida') = 0, 'los intentos fallidos no dejaron rutinas a medias');
do $$ begin for i in 2..20 loop perform public.ai_routine_reserve((select id from public.organizations where slug = 'evolution')); end loop; end $$;
select test.check((public.ai_routine_usage(:'evo') ->> 'remaining')::int = 0, 'usadas las 20 del día');
select test.expect_error(format($q$select public.ai_routine_reserve(%L)$q$, :'evo'), 'AI_DAILY_LIMIT');
reset role;
select max(id) as tlast from public.ai_usage_log \gset
set role authenticated;
-- ningún usuario puede "devolver" usos (ni ajenos ni propios): solo el servidor, cuando la IA falló
select test.login('00000000-0000-0000-0000-00000000000c');   -- Leo
select test.expect_error(format($q$select public.ai_routine_release(%L, %s)$q$, :'evo', :'tlast'), 'permission denied');
select test.login('00000000-0000-0000-0000-00000000000b');   -- Ana, dueña del ticket
select test.expect_error(format($q$select public.ai_routine_release(%L, %s)$q$, :'evo', :'tlast'), 'permission denied');
select test.expect_error(format($q$select public.ai_routine_reserve(%L)$q$, :'evo'), 'AI_DAILY_LIMIT');
-- aunque tenga permiso de ejecución, sin rol de servidor la función rechaza
reset role;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, false);
select test.expect_error(format($q$select public.ai_routine_release(%L, %s)$q$, :'evo', :'tlast'), 'FORBIDDEN');
-- el servidor no devuelve un ticket que ya generó borrador
set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select public.ai_routine_release(:'evo', :'t1'::bigint);
reset role;
select test.check((select status from public.ai_usage_log where id = :'t1') = 'ok', 'un uso con borrador no se puede devolver');
-- la IA falló → el servidor lo devuelve y no cuenta
set role service_role;
select public.ai_routine_release(:'evo', :'tlast');
reset role;
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000b');
select test.check((public.ai_routine_reserve(:'evo') ->> 'remaining')::int = 0, 'un intento fallido no consume el cupo');
select test.login('00000000-0000-0000-0000-00000000000a');   -- recepción
select test.expect_error(format($q$select public.ai_routine_reserve(%L)$q$, :'evo'), 'FORBIDDEN');
select test.expect_error($q$select * from public.ai_usage_log$q$, 'permission denied');

-- =====================================================================
-- 4. Tablero del negocio (gimnasio aislado, marzo 2025 vs. 29/1–28/2)
-- =====================================================================
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
do $$
declare
  v_org uuid := (select id from public.organizations where slug = 'gym-d-test');
  v_loc uuid := (select id from public.locations where org_id = v_org limit 1);
  v_own uuid := (select id from public.staff where org_id = v_org and role = 'owner');
  pa uuid; pb uuid; m1 uuid; m2 uuid; m3 uuid; m4 uuid; b1 uuid; b2 uuid; b3 uuid; b4 uuid;
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; i uuid; v_ct uuid; v_room uuid;
begin
  insert into public.membership_plans (org_id, name, price_cents, currency, billing_interval) values
    (v_org, 'Musculación', 3000000, 'ARS', 'month') returning id into pa;
  insert into public.membership_plans (org_id, name, price_cents, currency, billing_interval) values
    (v_org, 'Funcional', 2000000, 'ARS', 'month') returning id into pb;
  insert into public.members (org_id, first_name, last_name) values (v_org, 'Uno', 'D') returning id into m1;
  insert into public.members (org_id, first_name, last_name) values (v_org, 'Dos', 'D') returning id into m2;
  insert into public.members (org_id, first_name, last_name) values (v_org, 'Tres', 'D') returning id into m3;
  insert into public.members (org_id, first_name, last_name) values (v_org, 'Cuatro', 'D') returning id into m4;
  insert into public.billing_accounts (org_id, payer_member_id, provider) values (v_org, m1, 'cash') returning id into b1;
  insert into public.billing_accounts (org_id, payer_member_id, provider) values (v_org, m2, 'cash') returning id into b2;
  insert into public.billing_accounts (org_id, payer_member_id, provider) values (v_org, m3, 'cash') returning id into b3;
  insert into public.billing_accounts (org_id, payer_member_id, provider, delinquent) values (v_org, m4, 'cash', true) returning id into b4;
  update public.members set billing_account_id = b1 where id = m1;
  update public.members set billing_account_id = b2 where id = m2;
  update public.members set billing_account_id = b3 where id = m3;
  update public.members set billing_account_id = b4 where id = m4;
  -- Membresías (estado actual de cada cuenta)
  insert into public.memberships (org_id, plan_id, billing_account_id, current_period_start, current_period_end, provider, status)
    values (v_org, pa, b1, '2025-03-10 00:00-03', '2025-04-10 00:00-03', 'cash', 'active') returning id into s1;
  insert into public.memberships (org_id, plan_id, billing_account_id, current_period_start, current_period_end, provider, status)
    values (v_org, pb, b2, '2025-03-05 00:00-03', '2025-04-05 00:00-03', 'cash', 'active') returning id into s2;
  insert into public.memberships (org_id, plan_id, billing_account_id, current_period_start, current_period_end, provider, status)
    values (v_org, pa, b3, '2025-02-01 00:00-03', '2025-03-01 00:00-03', 'cash', 'expired') returning id into s3;
  insert into public.memberships (org_id, plan_id, billing_account_id, current_period_start, current_period_end, provider, status)
    values (v_org, pa, b4, '2025-04-02 00:00-03', '2025-05-02 00:00-03', 'cash', 'past_due') returning id into s4;
  insert into public.membership_members (membership_id, member_id, org_id) values (s1, m1, v_org), (s2, m2, v_org), (s3, m3, v_org), (s4, m4, v_org);

  -- Uno: pagó en febrero (período anterior) y renovó el 12/3
  insert into public.invoices (org_id, billing_account_id, membership_id, status, amount_due_cents, amount_paid_cents, currency, period_start, period_end, created_at)
    values (v_org, b1, s1, 'paid', 3000000, 3000000, 'ARS', '2025-02-10 00:00-03', '2025-03-10 00:00-03', '2025-02-10 12:00-03') returning id into i;
  insert into public.payments (org_id, billing_account_id, invoice_id, amount_cents, currency, provider, status, paid_at)
    values (v_org, b1, i, 3000000, 'ARS', 'cash', 'succeeded', '2025-02-10 12:00-03');
  insert into public.invoices (org_id, billing_account_id, membership_id, status, amount_due_cents, amount_paid_cents, currency, period_start, period_end, created_at)
    values (v_org, b1, s1, 'paid', 3000000, 3000000, 'ARS', '2025-03-10 00:00-03', '2025-04-10 00:00-03', '2025-03-12 12:00-03') returning id into i;
  insert into public.payments (org_id, billing_account_id, invoice_id, amount_cents, currency, provider, status, paid_at)
    values (v_org, b1, i, 3000000, 'ARS', 'transfer', 'succeeded', '2025-03-12 12:00-03');
  -- Uno: un cobro suelto sin plan en marzo
  insert into public.payments (org_id, billing_account_id, amount_cents, currency, provider, status, paid_at)
    values (v_org, b1, 500000, 'ARS', 'cash', 'succeeded', '2025-03-20 12:00-03');
  -- Dos: alta en marzo (primer pago) + un cobro anulado que no cuenta
  insert into public.invoices (org_id, billing_account_id, membership_id, status, amount_due_cents, amount_paid_cents, currency, period_start, period_end, created_at)
    values (v_org, b2, s2, 'paid', 2000000, 2000000, 'ARS', '2025-03-05 00:00-03', '2025-04-05 00:00-03', '2025-03-05 12:00-03') returning id into i;
  insert into public.payments (org_id, billing_account_id, invoice_id, amount_cents, currency, provider, status, paid_at)
    values (v_org, b2, i, 2000000, 'ARS', 'cash', 'succeeded', '2025-03-05 12:00-03');
  insert into public.payments (org_id, billing_account_id, amount_cents, currency, provider, status, paid_at)
    values (v_org, b2, 999, 'ARS', 'cash', 'canceled', '2025-03-06 12:00-03');
  -- Tres: pagó el 1/2, venció el 1/3 y no volvió (baja)
  insert into public.invoices (org_id, billing_account_id, membership_id, status, amount_due_cents, amount_paid_cents, currency, period_start, period_end, created_at)
    values (v_org, b3, s3, 'paid', 3000000, 3000000, 'ARS', '2025-02-01 00:00-03', '2025-03-01 00:00-03', '2025-02-01 12:00-03') returning id into i;
  insert into public.payments (org_id, billing_account_id, invoice_id, amount_cents, currency, provider, status, paid_at)
    values (v_org, b3, i, 3000000, 'ARS', 'cash', 'succeeded', '2025-02-01 12:00-03');
  -- Cuatro: debe una cuota
  insert into public.invoices (org_id, billing_account_id, membership_id, status, amount_due_cents, amount_paid_cents, currency, period_start, period_end)
    values (v_org, b4, s4, 'open', 1500000, 0, 'ARS', '2025-04-02 00:00-03', '2025-05-02 00:00-03');

  -- Entradas de marzo: Uno lun 3/3 10:15, lun 10/3 10:30, mié 5/3 18:00 · Dos mar 4/3 19:00 · un rechazo que no cuenta
  insert into public.checkins (org_id, location_id, member_id, method, allowed, created_at) values
    (v_org, v_loc, m1, 'manual', true, '2025-03-03 10:15-03'),
    (v_org, v_loc, m1, 'manual', true, '2025-03-10 10:30-03'),
    (v_org, v_loc, m1, 'manual', true, '2025-03-05 18:00-03'),
    (v_org, v_loc, m2, 'manual', true, '2025-03-04 19:00-03'),
    (v_org, v_loc, m3, 'manual', false, '2025-03-04 19:05-03'),
    (v_org, v_loc, m3, 'manual', true, '2025-02-20 09:00-03');
  -- Una clase el lunes 3/3 a las 10
  insert into public.class_types (org_id, name) values (v_org, 'Funcional D') returning id into v_ct;
  insert into public.rooms (org_id, location_id, name, capacity) values (v_org, v_loc, 'Sala D', 20) returning id into v_room;
  insert into public.class_sessions (org_id, class_type_id, room_id, instructor_id, starts_at, ends_at, capacity, status)
    values (v_org, v_ct, v_room, v_own, '2025-03-03 10:00-03', '2025-03-03 11:00-03', 10, 'completed');
end $$;

set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000a');   -- recepción de evolution: nada de otro gimnasio
select test.expect_error(format($q$select public.business_dashboard(%L, '2025-03-01', '2025-03-31')$q$, :'gymd'), 'FORBIDDEN');
select test.login('00000000-0000-0000-0000-0000000000d1');
select test.expect_error(format($q$select public.business_dashboard(%L, '2025-03-31', '2025-03-01')$q$, :'gymd'), 'INVALID_PERIOD');
select public.business_dashboard(:'gymd', '2025-03-01', '2025-03-31') as bd \gset
select test.check((:'bd'::jsonb #>> '{current,revenue_cents}')::bigint = 5500000, 'ingresos de marzo = $ 55.000 (sin el anulado)');
select test.check((:'bd'::jsonb #>> '{current,payments}')::int = 3, '3 cobros');
select test.check((:'bd'::jsonb #>> '{current,ticket_cents}')::bigint = 1833333, 'ticket promedio');
select test.check((:'bd'::jsonb #>> '{previous,revenue_cents}')::bigint = 6000000 and (:'bd'::jsonb #>> '{previous,payments}')::int = 2,
                  'período anterior (29/1–28/2) = $ 60.000');
select test.check(:'bd'::jsonb #>> '{period,prev_from}' = '2025-01-29' and :'bd'::jsonb #>> '{period,prev_to}' = '2025-02-28', 'fechas del período anterior');
select test.check((public.business_dashboard(:'gymd', '2025-03-01', '2025-03-31', '2025-02-01', '2025-02-05') #>> '{previous,revenue_cents}')::bigint = 3000000,
                  'período anterior a elección (1 al 5 de febrero)');
select test.check((:'bd'::jsonb #>> '{current,new_members}')::int = 1 and (:'bd'::jsonb #>> '{previous,new_members}')::int = 2, 'altas: 1 (antes 2)');
select test.check((:'bd'::jsonb #>> '{current,lapsed}')::int = 1, 'bajas: 1 (venció y no renovó en 10 días)');
select test.check((:'bd'::jsonb #>> '{current,renewal_due}')::int = 2 and (:'bd'::jsonb #>> '{current,renewed}')::int = 1
                  and (:'bd'::jsonb #>> '{current,renewal_pct}')::int = 50, 'renovación 1 de 2 = 50 %');
select test.check((:'bd'::jsonb #>> '{current,active_members}')::int = 2, 'socios activos al 31/3 = 2');
select test.check((:'bd'::jsonb #>> '{current,entries}')::int = 4 and (:'bd'::jsonb #>> '{current,unique_visitors}')::int = 2, 'entradas 4 de 2 socios');
select test.check((:'bd'::jsonb #>> '{previous,entries}')::int = 1, 'entradas del período anterior');
select test.check(:'bd'::jsonb -> 'by_plan' = '[{"name":"Musculación","cents":3000000,"payments":1},{"name":"Funcional","cents":2000000,"payments":1},{"name":"Otros cobros","cents":500000,"payments":1}]'::jsonb,
                  'ingreso por plan');
select test.check((:'bd'::jsonb #>> '{debt,accounts}')::int = 1 and (:'bd'::jsonb #>> '{debt,open_cents}')::bigint = 1500000
                  and :'bd'::jsonb #>> '{debt,list,0,name}' = 'Cuatro D', 'deuda: 1 cuenta, $ 15.000');
select test.check(:'bd'::jsonb -> 'heatmap' = '[{"dow":1,"hour":10,"n":2},{"dow":2,"hour":19,"n":1},{"dow":3,"hour":18,"n":1}]'::jsonb, 'mapa de calor día × hora');
select test.check(:'bd'::jsonb -> 'class_slots' = '[{"dow":1,"hour":10,"classes":1,"instructors":1}]'::jsonb, 'clases por franja');

reset role;
select test.ok('sala y dueño: máquinas con QR, datos solo del socio, TV con clave (hash, rota), límite de IA, tablero con montos exactos');
\echo 'FLOOR_OWNER: TODAS LAS PRUEBAS PASARON'
