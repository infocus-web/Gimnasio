-- Pruebas de 0025 (eliminar socio). Corre después de scenario_turnstile.sql.
\set ON_ERROR_STOP 1
set client_min_messages = warning;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select m.id as titular, m.billing_account_id as ba, m.org_id as org, m.user_id is null as sin_usuario
  from public.members m where first_name = 'Qr' and last_name = 'AlDia' \gset
insert into public.payments (org_id, billing_account_id, amount_cents, currency, provider, status, paid_at)
values (:'org', :'ba', 3000000, 'ARS', 'cash', 'succeeded', now());
insert into public.members (org_id, first_name, last_name, billing_account_id) values (:'org', 'Qr', 'Hijo', :'ba');
select id as hijo from public.members where first_name = 'Qr' and last_name = 'Hijo' \gset
select count(*) as checkins_titular from public.checkins where member_id = :'titular' \gset
select test.check(:checkins_titular > 0, 'el titular tiene entradas');

set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000d');
select test.expect_error(format($q$select public.member_delete(%L)$q$, :'titular'), 'FORBIDDEN');
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
select test.expect_error(format($q$select public.member_delete(%L)$q$, :'titular'), 'MEMBER_IS_PAYER');
select test.check((public.member_delete(:'hijo') ->> 'deleted')::boolean, 'se elimina el integrante');
select test.check((public.member_delete(:'titular') ->> 'deleted')::boolean, 'después, el titular');
select test.expect_error(format($q$select public.member_delete(%L)$q$, :'titular'), 'MEMBER_NOT_FOUND');

reset role;
select test.check(not exists (select 1 from public.members where id in (:'titular', :'hijo')), 'fichas borradas');
select test.check(not exists (select 1 from public.payments where billing_account_id = :'ba'), 'pagos borrados');
select test.check(not exists (select 1 from public.billing_accounts where id = :'ba'), 'cuenta borrada');
select test.check(not exists (select 1 from public.memberships where billing_account_id = :'ba'), 'plan borrado');
select test.check(not exists (select 1 from public.checkins where member_id = :'titular'), 'entradas borradas');
select test.check(not exists (select 1 from public.domain_events where member_id = :'titular'), 'eventos borrados');
select test.check(not exists (select 1 from public.access_commands where member_id = :'titular'), 'cola sin referencias');
select test.ok('eliminar socio: solo dueño/admin, grupo familiar protegido, borra todo lo suyo');
\echo 'ELIMINAR SOCIO: TODAS LAS PRUEBAS PASARON'

-- Abrir a mano
select id as dev from public.access_devices where serial_number = 'MBTEST0001' \gset
update public.access_devices set active = true, info = info || jsonb_build_object('agent_seen_at', now()) where id = :'dev';
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000d');
select test.expect_error(format($q$select public.access_device_open(%L)$q$, :'dev'), 'FORBIDDEN');
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
select public.access_device_open(:'dev') as uid \gset
reset role;
select test.check((select kind = 'unlock' and status = 'pending' and member_id is null from public.access_commands where id = :uid), 'apertura manual encolada');
update public.access_devices set info = info || '{"agent_seen_at":"2020-01-01T00:00:00Z"}' where id = :'dev';
set role authenticated;
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
select test.expect_error(format($q$select public.access_device_open(%L)$q$, :'dev'), 'TURNSTILE_OFFLINE');
reset role;
\echo 'APERTURA MANUAL: TODAS LAS PRUEBAS PASARON'
