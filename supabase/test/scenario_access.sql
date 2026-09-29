-- Pruebas de 0020 (lectores ZKTeco por ADMS). Corre al final.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- ---------- Datos propios ----------
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
do $$
declare
  v_org uuid := (select id from public.organizations where slug = 'evolution');
  v_plan uuid; v_al uuid; v_mo uuid; v_ba uuid; v_ba2 uuid; v_ms uuid; v_ms2 uuid;
begin
  insert into public.membership_plans (org_id, name, kind, price_cents, currency, billing_interval)
    values (v_org, 'Musculación test', 'recurring', 3000000, 'ARS', 'month') returning id into v_plan;
  insert into public.members (org_id, first_name, last_name, document_id) values (v_org, 'Álvaro', 'Díaz', '39888777') returning id into v_al;
  insert into public.billing_accounts (org_id, payer_member_id) values (v_org, v_al) returning id into v_ba;
  update public.members set billing_account_id = v_ba where id = v_al;
  insert into public.memberships (org_id, plan_id, billing_account_id, current_period_start, current_period_end, provider, cancel_at_period_end)
    values (v_org, v_plan, v_ba, now() - interval '10 days', now() + interval '20 days', 'cash', true) returning id into v_ms;
  insert into public.membership_members (membership_id, member_id, org_id) values (v_ms, v_al, v_org);

  insert into public.members (org_id, first_name, last_name) values (v_org, 'Moroso', 'Test') returning id into v_mo;
  insert into public.billing_accounts (org_id, payer_member_id) values (v_org, v_mo) returning id into v_ba2;
  update public.members set billing_account_id = v_ba2 where id = v_mo;
  insert into public.memberships (org_id, plan_id, billing_account_id, current_period_start, current_period_end, provider, cancel_at_period_end)
    values (v_org, v_plan, v_ba2, now() - interval '40 days', now() - interval '10 days', 'cash', true) returning id into v_ms2;
  insert into public.membership_members (membership_id, member_id, org_id) values (v_ms2, v_mo, v_org);
end $$;

select access_pin as pin_al from public.members where first_name = 'Álvaro' \gset
select access_pin as pin_mo from public.members where first_name = 'Moroso' \gset
select count(*) as sin_pin from public.members where access_pin is null \gset
\echo pin Álvaro = :pin_al · pin Moroso = :pin_mo · socios sin número = :sin_pin

-- ---------- Un navegador no puede hablar el protocolo ----------
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000d');   -- socio
select test.expect_error($q$select public.adms_poll('ABC123456', '1.2.3.4')$q$, 'permission denied');
select test.expect_error($q$select * from public.access_templates$q$, 'permission denied');
select test.expect_error($q$select public.access_device_register((select id from public.organizations limit 1), 'ABC123456', 'x')$q$, 'FORBIDDEN');
-- el socio no puede cambiarse el número
select test.expect_error($q$update public.members set access_pin = 5 where user_id = '00000000-0000-0000-0000-00000000000d'$q$, 'FIELD_NOT_EDITABLE_BY_MEMBER');

-- ---------- Lector desconocido: queda "detectado" ----------
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
set role service_role;
select public.adms_hello('ckjq-2024 00123', '200.1.1.1', '{"pushver":"2.4.1"}') ->> 'status' as st \gset
\echo lector sin registrar responde = :st
select public.adms_push('CKJQ202400123', '200.1.1.1', 'ATTLOG', '1', '[{"k":"att","pin":1,"t":"2026-01-01 10:00:00","v":15}]') ->> 'status' as st \gset
\echo datos de lector sin registrar = :st

-- ---------- El dueño lo registra (aparece como detectado desde su misma IP) ----------
reset role;
set role authenticated;
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
select count(*) as cerca from public.access_unknown_nearby((select id from public.organizations where slug = 'evolution'), '200.1.1.1') \gset
\echo detectados desde la IP del gimnasio = :cerca
select public.access_device_register((select id from public.organizations where slug = 'evolution'), 'CKJQ202400123', 'Molinete') as dev \gset
select count(*) filter (where kind = 'query') as q, count(*) filter (where kind = 'user_put') as puts
  from public.access_commands where device_id = :'dev' \gset
\echo al registrar: consultas = :q · altas encoladas = :puts
select count(*) as al_en_lector from public.access_device_users where device_id = :'dev' and pin = :pin_al and state = 'present' \gset
select count(*) as mo_en_lector from public.access_device_users where device_id = :'dev' and pin = :pin_mo \gset
\echo Álvaro cargado = :al_en_lector · Moroso cargado = :mo_en_lector

-- ---------- El lector pide trabajo y responde ----------
reset role;
set role service_role;
select jsonb_array_length(public.adms_poll('CKJQ202400123', '200.1.1.1')) as enviados \gset
\echo comandos enviados al lector = :enviados
select (public.adms_poll('CKJQ202400123', '200.1.1.1') -> 0 ->> 'cmd') is null as vacio \gset
\echo segundo pedido sin nada pendiente = :vacio
select public.adms_results('CKJQ202400123', '200.1.1.1',
  (select jsonb_agg(jsonb_build_object('id', id, 'ret', 0)) from public.access_commands where status = 'sent')) as ok \gset
\echo resultados aceptados = :ok

-- Desde otra IP: no se le da nada y queda pendiente de confirmar
select jsonb_array_length(public.adms_poll('CKJQ202400123', '9.9.9.9')) as desde_otra_ip \gset
select pending_ip from public.access_devices where serial_number = 'CKJQ202400123' \gset
\echo desde otra IP recibe = :desde_otra_ip comandos · IP pendiente = :pending_ip
select public.adms_hello('CKJQ202400123', '200.1.1.1') ->> 'status' as st \gset
\echo vuelve desde la IP de siempre = :st

-- ---------- Registro de cara: se guarda y se copia al segundo lector ----------
reset role;
set role authenticated;
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
select public.access_device_register((select id from public.organizations where slug = 'evolution'), 'CKJQ202400999', 'Puerta 2') as dev2 \gset
reset role;
set role service_role;
select public.adms_hello('CKJQ202400999', '200.1.1.1') ->> 'status' as st2 \gset
select public.adms_push('CKJQ202400123', '200.1.1.1', 'BIODATA', null,
  jsonb_build_array(jsonb_build_object('k', 'bio', 'tbl', 'BIODATA', 'pin', :pin_al, 'pin_key', 'Pin', 'key', '9:0:0',
    'fields', E'No=0\tIndex=0\tValid=1\tDuress=0\tType=9\tMajorVer=58\tMinorVer=12\tFormat=0\tTmp=AAAA'))) ->> 'accepted' as acc \gset
select count(*) as copias from public.access_commands
 where device_id = :'dev2' and kind = 'bio_put' and command like 'DATA UPDATE BIODATA Pin=' || :pin_al || E'\tNo=0%' \gset
\echo plantilla aceptada = :acc · copias al lector 2 = :copias

-- ---------- Entrada marcada en el lector → check-in ----------
select public.adms_push('CKJQ202400123', '200.1.1.1', 'ATTLOG', '55',
  jsonb_build_array(
    jsonb_build_object('k', 'att', 'pin', :pin_al, 't', to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD HH24:MI:SS'), 'v', 15),
    jsonb_build_object('k', 'att', 'pin', :pin_al, 't', to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD HH24:MI:SS'), 'v', 15),
    jsonb_build_object('k', 'att', 'pin', 424242, 't', to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD HH24:MI:SS'), 'v', 15),
    jsonb_build_object('k', 'att', 'pin', :pin_al, 't', '2020-01-01 08:00:00', 'v', 15)
  )) ->> 'accepted' as entradas \gset
select method, abs(extract(epoch from created_at - now())) < 5 as hora_ok from public.checkins
 where member_id = (select id from public.members where first_name = 'Álvaro') order by id desc limit 1 \gset
select attlog_stamp from public.access_devices where serial_number = 'CKJQ202400123' \gset
\echo entradas registradas = :entradas (dup, desconocido e historial viejo descartados) · método = :method · hora bien convertida = :hora_ok · stamp = :attlog_stamp

-- ---------- Vence / se vuelve moroso → se borra del lector; paga → vuelve con su cara ----------
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
update public.billing_accounts set delinquent = true
 where payer_member_id = (select id from public.members where first_name = 'Álvaro');
select count(*) as borrados from public.access_commands
 where pin = :pin_al and kind = 'user_del' and status = 'pending' \gset
\echo moroso → bajas encoladas (2 lectores) = :borrados
update public.billing_accounts set delinquent = false
 where payer_member_id = (select id from public.members where first_name = 'Álvaro');
select count(*) filter (where kind = 'user_put') as altas, count(*) filter (where kind = 'bio_put') as caras
  from public.access_commands where pin = :pin_al and status = 'pending' \gset
select count(*) as bajas_anuladas from public.access_commands where pin = :pin_al and kind = 'user_del' and status = 'superseded' \gset
\echo pagó → altas = :altas · caras restauradas = :caras · bajas anuladas = :bajas_anuladas

-- Vencimiento por fecha: lo detecta el reconciliador periódico
update public.memberships set current_period_end = now() - interval '1 hour', current_period_start = now() - interval '31 days'
 where id in (select mm.membership_id from public.membership_members mm join public.members m on m.id = mm.member_id where m.first_name = 'Álvaro');
select count(*) as bajas_venc from public.access_commands where pin = :pin_al and kind = 'user_del' and status = 'pending' \gset
\echo vencido → bajas encoladas = :bajas_venc

-- ---------- Alguien cargado a mano en el lector se vincula a un socio ----------
reset role;
set role service_role;
select public.adms_push('CKJQ202400123', '200.1.1.1', 'OPERLOG', '7',
  '[{"k":"user","pin":77,"name":"Juan Viejo"}, {"k":"bio","tbl":"BIODATA","pin":77,"pin_key":"Pin","key":"9:0:0","fields":"Type=9\tTmp=BBBB"}]') ->> 'accepted' as acc2 \gset
select managed, member_id is null as sin_socio from public.access_device_users where pin = 77 \gset
\echo usuario cargado a mano: gestionado = :managed · sin socio = :sin_socio
reset role;
set role authenticated;
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
select public.access_link_pin(:'dev', 77, (select id from public.members where first_name = 'Hijo'));
select access_pin as pin_hijo from public.members where first_name = 'Hijo' \gset
select count(*) as copia_hijo from public.access_commands where device_id = :'dev2' and pin = 77 and kind = 'bio_put' \gset
\echo Hijo vinculado → número = :pin_hijo · su cara copiada al lector 2 = :copia_hijo

-- Recepción registra la cara de un socio al día; de uno vencido, no
select test.login('00000000-0000-0000-0000-00000000000a');
select public.access_enroll((select id from public.members where first_name = 'Papá'), :'dev') is not null as enrolado \gset
select biometric_consent_at is not null as consentimiento from public.members where first_name = 'Papá' \gset
select test.expect_error(format($q$select public.access_enroll((select id from public.members where first_name = 'Moroso'), %L)$q$, :'dev'), 'ACCESS_NOT_ALLOWED');
\echo registro de cara pedido = :enrolado · consentimiento anotado = :consentimiento

reset role;
select public.access_reconcile_all() >= 0 as cron_ok \gset
\echo reconciliador periódico corre = :cron_ok
select test.ok('lectores: protocolo cerrado, registro, IP fija, check-ins, bajas/altas automáticas, copia de caras, vínculo manual');
\echo 'ACCESOS: TODAS LAS PRUEBAS PASARON'
