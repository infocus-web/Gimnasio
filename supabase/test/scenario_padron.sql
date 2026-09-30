-- Pruebas de 0017 (padrón del equipo). Corre después de scenario_stage2.sql
\set ON_ERROR_STOP 1
set client_min_messages = warning;

grant usage on schema test to anon; grant execute on all functions in schema test to anon;
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
select public.submit_staff_request('evolution', 'Marta', 'Gómez', '30.123.456', '11 5555-1234', ' Marta@Test.com ', 'trainer', 'Doy funcional') as r1 \gset
select test.expect_error($q$select public.submit_staff_request('evolution', 'Marta', 'Gómez', '30123456', '1155551234', 'marta@test.com', 'trainer')$q$, 'ALREADY_PENDING');
select test.expect_error($q$select public.submit_staff_request('evolution', 'Ana', 'Staff', '20111222', '1155550000', 'profe.ana@test.com', 'trainer')$q$, 'ALREADY_STAFF');
\echo respuestas = :r1 · repetida y ya del equipo avisan
select test.expect_error($q$select public.submit_staff_request('evolution','X','Y','12','1155551234','x@test.com','trainer')$q$, 'INVALID_DOCUMENT');
select test.expect_error($q$select public.submit_staff_request('evolution','X','Y','30111222','1155551234','x@test.com','admin')$q$, 'INVALID_ROLE');
select test.expect_error($q$insert into public.staff_requests (org_id, first_name, last_name, document_id, phone, email, requested_role)
  select id, 'H', 'H', '30111222', '1', 'h@test.com', 'trainer' from public.organizations limit 1$q$, 'permission denied');
reset role;
do $$
begin
  if (select count(*) from public.staff_requests where email = 'marta@test.com' and status = 'pending' and document_id = '30123456') <> 1 then
    raise exception 'la solicitud no se guardó normalizada o se duplicó';
  end if;
  if exists (select 1 from public.staff_requests where email = 'profe.ana@test.com') then
    raise exception 'alguien del equipo generó una solicitud';
  end if;
end $$;

set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000a');   -- recepción: no ve solicitudes
select count(*) as ve_recepcion from public.staff_requests \gset
\echo solicitudes que ve recepción = :ve_recepcion
select test.login('aaaaaaaa-0000-0000-0000-000000000001');   -- owner
select count(*) as ve_owner from public.staff_requests \gset
\echo solicitudes que ve el dueño = :ve_owner
select test.ok('padrón: alta pública validada, sin duplicados, solo el dueño/admin las ve');
reset role;
\echo 'PADRON: TODAS LAS PRUEBAS PASARON'
