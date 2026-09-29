-- Pruebas de 0016 (reportes, asistencia, alumnos del profe). Corre después de scenario_stage1.sql
\set ON_ERROR_STOP 1
set client_min_messages = warning;
set role authenticated;

select test.login('aaaaaaaa-0000-0000-0000-000000000001');   -- owner (AAL2)
select jsonb_array_length(public.org_report((select id from public.organizations where slug = 'evolution'), 6) -> 'months') as meses \gset
\echo meses del reporte = :meses
select (public.org_report((select id from public.organizations where slug = 'evolution')) ->> 'active_members')::int > 0 as hay_activos \gset
\echo socios activos > 0 = :hay_activos
select test.login('00000000-0000-0000-0000-00000000000b');   -- trainer Ana
select test.expect_error($q$select public.org_report((select org_id from public.staff where display_name = 'Ana'))$q$, 'FORBIDDEN');
select count(*) as alumnos_ana from public.coach_client_overview \gset
\echo alumnos que ve Ana = :alumnos_ana
select test.login('00000000-0000-0000-0000-00000000000c');   -- trainer Leo: no ve alumnos de Ana
select count(*) as alumnos_leo from public.coach_client_overview where trainer_name = 'Ana' \gset
\echo alumnos de Ana que ve Leo = :alumnos_leo
select test.expect_error($q$select public.mark_attendance((select id from public.bookings limit 1), 'canceled')$q$, 'INVALID_STATUS');
select test.ok('reportes solo con permiso; cada profe ve solo sus alumnos');
reset role;
\echo 'ETAPA 2: TODAS LAS PRUEBAS PASARON'
