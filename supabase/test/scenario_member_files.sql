-- Pruebas de 0026 (foto y apto físico en almacenamiento privado)
\set ON_ERROR_STOP 1
set client_min_messages = warning;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select id as org from public.organizations where slug = 'evolution' \gset
insert into public.members (org_id, first_name, last_name) values (:'org', 'Archivo', 'Prueba') returning id as mem, access_pin as pin \gset
select test.check(:pin > 100000, 'número de socio asignado al inscribir');
select test.check(not (select public from storage.buckets where id = 'socios'), 'bucket privado');

set role authenticated;
select test.login('aaaaaaaa-0000-0000-0000-000000000001');   -- dueño
insert into storage.objects (bucket_id, name) values ('socios', :'org' || '/' || :'mem' || '/foto-1.jpg');
select test.check((select count(*) from storage.objects where bucket_id = 'socios') = 1, 'el dueño sube y ve la foto');
select test.expect_error(format($q$insert into storage.objects (bucket_id, name) values ('socios', %L)$q$,
  :'org' || '/' || gen_random_uuid() || '/x.jpg'), 'row-level security');
select test.expect_error($q$insert into storage.objects (bucket_id, name) values ('socios', 'basura/x.jpg')$q$, 'row-level security');

select test.login('00000000-0000-0000-0000-00000000000d');   -- otro socio
select test.check((select count(*) from storage.objects where bucket_id = 'socios') = 0, 'otro socio no ve la foto');
select test.expect_error(format($q$insert into storage.objects (bucket_id, name) values ('socios', %L)$q$,
  :'org' || '/' || :'mem' || '/foto-2.jpg'), 'row-level security');
reset role;
select test.ok('archivos del socio: bucket privado, solo staff de la org sube/ve, número de socio automático');
\echo 'ARCHIVOS DEL SOCIO: TODAS LAS PRUEBAS PASARON'

-- El socio no puede marcarse el apto ni cambiar su foto
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000d');
select test.expect_error($q$update public.members set medical_cert_expires_on = '2099-12-31' where user_id = '00000000-0000-0000-0000-00000000000d'$q$, 'FIELD_NOT_EDITABLE_BY_MEMBER');
select test.expect_error($q$update public.members set photo_url = 'https://x/y.jpg' where user_id = '00000000-0000-0000-0000-00000000000d'$q$, 'FIELD_NOT_EDITABLE_BY_MEMBER');
reset role;
\echo 'GUARDIA DE FOTO Y APTO: OK'
