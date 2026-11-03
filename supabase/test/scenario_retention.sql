-- Pruebas de 0036 (encuestas NPS, Evolution Check, balanza, retos). Corre al final.
\set ON_ERROR_STOP 1
set client_min_messages = warning;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);

select id as org, timezone as tz from public.organizations where slug = 'evolution' \gset
select id as loc from public.locations where org_id = :'org' order by created_at limit 1 \gset
select id as papa from public.members where user_id = '00000000-0000-0000-0000-00000000000d' \gset
select id as hijo from public.members where first_name = 'Hijo' and org_id = :'org' \gset
select id as otra from public.members where user_id = '00000000-0000-0000-0000-00000000000f' \gset
select id as ana from public.staff where org_id = :'org' and display_name = 'Ana' \gset
select (now() at time zone :'tz')::date as today \gset

-- Papá y su hijo con plan vigente largo (otros escenarios pueden haberlo tocado)
update public.memberships set status = 'active', current_period_end = now() + interval '60 days', paused_until = null
 where id in (select membership_id from public.membership_members where member_id = :'papa');
update public.members set status = 'active' where id in (:'papa', :'hijo');

-- =====================================================================
-- 1 · Encuestas
-- =====================================================================
update public.members set created_at = now() - interval '40 days' where id = :'papa';
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000d');
select test.check(public.member_survey(:'papa') ->> 'campaign' = 'd30', 'a los 30 días le toca la encuesta de alta');
select test.check(public.member_survey(:'hijo') is null, 'nadie responde por el hijo (sin login propio)');
select test.expect_error(format('select public.survey_answer(%L, %L, 11)', :'papa', 'd30'), 'INVALID_SCORE');
select test.expect_error(format('select public.survey_answer(%L, %L, 9)', :'papa', 'q2020-1'), 'SURVEY_NOT_PENDING');
select public.survey_answer(:'papa', 'd30', 9, '  Muy buena atención  ');
select test.check(public.member_survey(:'papa') is null, 'respondida: no vuelve a aparecer');
select test.expect_error(format('select public.survey_answer(%L, %L, 3)', :'papa', 'd30'), 'SURVEY_NOT_PENDING');
select test.check((select comment from public.survey_responses where member_id = :'papa') = 'Muy buena atención', 'comentario prolijo');
select test.login('00000000-0000-0000-0000-00000000000f');
select test.expect_error(format('select public.survey_answer(%L, %L, 0)', :'papa', 'd30'), 'FORBIDDEN');
select test.check((select count(*) from public.survey_responses) = 0, 'otro socio no ve respuestas ajenas');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);

-- Trimestral: socio viejo, última respuesta hace 50 días
update public.members set created_at = now() - interval '400 days' where id = :'papa';
update public.survey_responses set created_at = now() - interval '50 days' where member_id = :'papa';
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000d');
select test.check(public.member_survey(:'papa') ->> 'campaign' like 'q____-_', 'socio viejo: encuesta del trimestre');
select public.survey_answer(:'papa', public.member_survey(:'papa') ->> 'campaign', null);   -- "ahora no"
select test.check(public.member_survey(:'papa') is null, '"ahora no" cuenta para el trimestre');
-- Panel
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
select public.nps_report(:'org', 365) as rep \gset
select test.check((:'rep'::jsonb ->> 'answered')::int = 1 and (:'rep'::jsonb ->> 'skipped')::int = 1
                  and (:'rep'::jsonb ->> 'nps')::int = 100, 'NPS: 1 promotor, el "ahora no" no cuenta');
select test.check(:'rep'::jsonb -> 'responses' -> 0 ->> 'name' = 'Papá G.', 'nombre corto en respuestas');
select public.nps_set_enabled(:'org', false);
select test.login('00000000-0000-0000-0000-00000000000b');   -- Ana (profe)
select test.expect_error(format('select public.nps_report(%L)', :'org'), 'FORBIDDEN');
select test.expect_error(format('select public.nps_set_enabled(%L, true)', :'org'), 'FORBIDDEN');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
update public.survey_responses set created_at = now() - interval '200 days' where member_id = :'papa';
delete from public.survey_responses where member_id = :'papa' and campaign <> 'd30';
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000d');
select test.check(public.member_survey(:'papa') is null, 'encuestas apagadas por el gimnasio');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
update public.engagement_settings set nps_enabled = true where org_id = :'org';
select test.ok('encuestas: alta 30 días, trimestral, "ahora no", solo el propio socio, NPS en el panel, apagado');

-- =====================================================================
-- 2 · Evolution Check
-- =====================================================================
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000b');   -- Ana
insert into public.fitness_assessments (org_id, member_id, assessed_by, sex, age_years, weight_kg, squats_1min, pushups)
values (:'org', :'papa', :'ana', 'M', 40, 82.5, 35, 20);
select test.expect_error(format($q$insert into public.fitness_assessments (org_id, member_id, assessed_by, sex, age_years)
  values (%L, %L, (select id from public.staff where display_name = 'Leo'), 'M', 40)$q$, :'org', :'papa'), 'row-level security');
select test.expect_error(format($q$insert into public.fitness_assessments (org_id, member_id, assessed_by, sex, age_years, pushups)
  values (%L, %L, %L, 'M', 40, 500)$q$, :'org', :'papa', :'ana'), 'check constraint');
select test.login('00000000-0000-0000-0000-00000000000c');   -- Leo: otro profe del gimnasio también evalúa
select test.check((select count(*) from public.fitness_assessments) = 1, 'otro profe del gimnasio la ve');
select test.login('00000000-0000-0000-0000-00000000000d');   -- Papá la ve, no la edita
select test.check((select count(*) from public.fitness_assessments where member_id = :'papa') = 1, 'el socio ve su evaluación');
update public.fitness_assessments set pushups = 99;
select test.check((select pushups from public.fitness_assessments where member_id = :'papa') = 20, 'el socio no puede cambiarla');
select test.expect_error(format($q$insert into public.fitness_assessments (org_id, member_id, assessed_by, sex, age_years)
  values (%L, %L, null, 'M', 40)$q$, :'org', :'papa'), 'row-level security');
select test.login('00000000-0000-0000-0000-00000000000f');   -- Otra no la ve
select test.check((select count(*) from public.fitness_assessments) = 0, 'otro socio no ve la evaluación');
select test.login('00000000-0000-0000-0000-00000000000a');   -- recepción no es profe
select test.check((select count(*) from public.fitness_assessments) = 0, 'recepción no ve evaluaciones');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select test.ok('Evolution Check: lo carga un profe con su firma, el socio solo la ve, ajenos afuera');

-- =====================================================================
-- 3 · Balanza
-- =====================================================================
update public.members set document_id = '27.555.444' where id = :'papa';
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000c');   -- Leo
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
update public.members set document_id = '27555444' where id = :'otra';
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000c');
select test.check(public.scale_import(:'org', jsonb_build_array(jsonb_build_object('dni', '27555444', 'measured_at', '2026-09-01T10:00:00-03:00', 'weight_kg', 60)))
                  -> 'unmatched' = '["27555444"]'::jsonb, 'DNI repetido en dos fichas: no adivina');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
update public.members set document_id = null where id = :'otra';
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000c');
select public.scale_import(:'org', jsonb_build_array(
  jsonb_build_object('dni', '27555444', 'measured_at', '2026-10-01T10:00:00-03:00', 'weight_kg', 81.2, 'body_fat_pct', 21.5, 'muscle_kg', 35.1, 'visceral_fat', 8),
  jsonb_build_object('dni', '27555444', 'measured_at', '2026-10-01T10:00:00-03:00', 'weight_kg', 81.2),
  jsonb_build_object('dni', '99999999', 'measured_at', '2026-10-01T10:00:00-03:00', 'weight_kg', 70),
  jsonb_build_object('dni', '27555444', 'measured_at', 'no-es-fecha', 'weight_kg', 70),
  jsonb_build_object('dni', '27555444', 'measured_at', '2026-10-02T10:00:00-03:00', 'weight_kg', 'mucho')
)) as imp \gset
select test.check((:'imp'::jsonb ->> 'imported')::int = 1 and (:'imp'::jsonb ->> 'duplicates')::int = 1
                  and (:'imp'::jsonb ->> 'invalid')::int = 2 and :'imp'::jsonb -> 'unmatched' = '["99999999"]'::jsonb,
                  'CSV: 1 importada, 1 repetida, 2 inválidas, 1 DNI sin socio');
insert into public.body_metrics (org_id, member_id, measured_at, weight_kg, source) values (:'org', :'papa', now() - interval '1 day', 81, 'staff');
select test.expect_error(format($q$insert into public.body_metrics (org_id, member_id, weight_kg, source) values (%L, %L, 80, 'app')$q$, :'org', :'papa'),
                         'row-level security');
select test.login('00000000-0000-0000-0000-00000000000d');   -- Papá
select test.check((select count(*) from public.body_metrics where member_id = :'papa' and source <> 'app') = 2, 'el socio ve las mediciones del profe');
select test.check((select measurements ->> 'muscle_kg' from public.body_metrics where source = 'scale_csv') = '35.1', 'masa muscular guardada');
delete from public.body_metrics where source <> 'app';
select test.check((select count(*) from public.body_metrics where member_id = :'papa' and source <> 'app') = 2, 'el socio no borra las del profe');
insert into public.body_metrics (org_id, member_id, weight_kg) values (:'org', :'papa', 80);
select test.expect_error(format($q$insert into public.body_metrics (org_id, member_id, weight_kg, source) values (%L, %L, 80, 'staff')$q$, :'org', :'papa'),
                         'row-level security');
select test.expect_error(format('select public.scale_import(%L, %L)', :'org', '[]'), 'FORBIDDEN');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select test.ok('balanza: importación por DNI sin duplicados, profe carga, socio ve pero no toca');

-- =====================================================================
-- 4 · Retos
-- =====================================================================
set role authenticated;
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
select public.challenge_save(:'org', null, 'Noviembre 12 visitas', 'Vení 12 días', 'visits', 2,
                             :'today'::date - 5, :'today'::date + 5, 3, true) as ch_visits \gset
select public.challenge_save(:'org', null, 'Kilos', null, 'volume_kg', 100000, :'today'::date - 5, :'today'::date + 5, 0, false) as ch_kg \gset
select test.expect_error(format($q$select public.challenge_save(%L, null, 'Largo', null, 'visits', 5, %L::date, %L::date + 200, 0, true)$q$,
                                :'org', :'today', :'today'), 'check constraint');
select test.login('00000000-0000-0000-0000-00000000000b');   -- Ana no administra retos
select test.expect_error(format($q$select public.challenge_save(%L, null, 'Profe', null, 'visits', 5, %L::date, %L::date, 0, true)$q$,
                                :'org', :'today', :'today'), 'FORBIDDEN');

select test.login('00000000-0000-0000-0000-00000000000d');   -- Papá se anota él y a su hijo
select public.challenge_join(:'ch_visits', :'papa');
select public.challenge_join(:'ch_visits', :'papa');          -- dos veces no duplica
select public.challenge_join(:'ch_visits', :'hijo');
select test.login('00000000-0000-0000-0000-00000000000f');   -- Otra no puede anotar a Papá
select test.expect_error(format('select public.challenge_join(%L, %L)', :'ch_visits', :'papa'), 'FORBIDDEN');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
-- Papá vino 2 días (3 entradas), el hijo 1 · una entrada vieja fuera del reto no cuenta
insert into public.checkins (org_id, location_id, member_id, method, allowed, created_at) values
  (:'org', :'loc', :'papa', 'manual', true, private.org_midnight(:'org', :'today'::date - 2) + interval '9 hours'),
  (:'org', :'loc', :'papa', 'manual', true, private.org_midnight(:'org', :'today'::date - 2) + interval '19 hours'),
  (:'org', :'loc', :'papa', 'manual', true, private.org_midnight(:'org', :'today'::date - 1) + interval '9 hours'),
  (:'org', :'loc', :'papa', 'manual', false, private.org_midnight(:'org', :'today'::date - 3) + interval '9 hours'),
  (:'org', :'loc', :'papa', 'manual', true, private.org_midnight(:'org', :'today'::date - 30) + interval '9 hours'),
  (:'org', :'loc', :'hijo', 'manual', true, private.org_midnight(:'org', :'today'::date - 1) + interval '9 hours');
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000d');
select public.member_challenges(:'papa') as mc \gset
select test.check((select (x ->> 'progress')::numeric from jsonb_array_elements(:'mc'::jsonb) x where x ->> 'id' = :'ch_visits') = 2,
                  'visitas: días distintos con entrada permitida dentro del reto');
select test.check((select (x ->> 'my_pos')::int from jsonb_array_elements(:'mc'::jsonb) x where x ->> 'id' = :'ch_visits') = 1, 'Papá primero');
select test.check((select jsonb_array_length(x -> 'ranking') from jsonb_array_elements(:'mc'::jsonb) x where x ->> 'id' = :'ch_visits') = 2, 'ranking con 2');
select test.check((select jsonb_typeof(x -> 'ranking') = 'null' and not (x ->> 'joined')::boolean from jsonb_array_elements(:'mc'::jsonb) x where x ->> 'id' = :'ch_kg'),
                  'reto sin ranking: no lo muestra');
select test.expect_error(format('select public.challenge_settle(%L)', :'ch_visits'), 'FORBIDDEN');
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
select test.expect_error(format('select public.challenge_settle(%L)', :'ch_visits'), 'CHALLENGE_NOT_ENDED');
select test.check((select (x ->> 'reached')::int from jsonb_array_elements(public.challenge_admin_list(:'org')) x where x ->> 'id' = :'ch_visits') = 1,
                  'panel: 1 llegó a la meta');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
-- Termina el reto → el cron lo cierra y premia
update public.challenges set starts_on = :'today'::date - 5, ends_on = :'today'::date - 1 where id = :'ch_visits';
select test.eng_end(:'papa') as papa_end0 \gset
select public.challenges_settle_due() as settled \gset
select test.check((select status from public.challenges where id = :'ch_visits') = 'settled', 'reto cerrado');
select test.check((select completed and reward_status = 'applied' from public.challenge_participants where challenge_id = :'ch_visits' and member_id = :'papa'),
                  'Papá cumplió y recibió el premio');
select test.check((select not completed and reward_status is null from public.challenge_participants where challenge_id = :'ch_visits' and member_id = :'hijo'),
                  'el hijo no llegó: sin premio');
select test.check(test.eng_end(:'papa') = :'papa_end0'::timestamptz + interval '3 days', 'premio: +3 días al plan');
select public.challenges_settle_due() as settled2 \gset
select test.check(test.eng_end(:'papa') = :'papa_end0'::timestamptz + interval '3 days', 'no se premia dos veces');
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000d');
select test.expect_error(format('select public.challenge_join(%L, %L)', :'ch_visits', :'papa'), 'CHALLENGE_CLOSED');
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
select public.challenge_cancel(:'ch_kg');
select test.login('00000000-0000-0000-0000-00000000000d');
select test.check(not exists (select 1 from jsonb_array_elements(public.member_challenges(:'papa')) x where x ->> 'id' = :'ch_kg'), 'reto cancelado no se ve');
reset role;
select test.ok('retos: alta solo admin, anotarse (familia sí, ajenos no), avance real, ranking opcional, cierre con premio una vez');
\echo 'RETENCION Y EVALUACIONES: TODAS LAS PRUEBAS PASARON'
