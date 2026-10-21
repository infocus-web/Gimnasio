-- Pruebas de 0023 (intermediario en la PC del gimnasio). Corre después de scenario_access.sql.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function test.check(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALLO: %', p_label; end if;
end $$;
grant usage on schema test to service_role;
grant execute on function test.check(boolean, text) to authenticated, service_role;

-- ---------- El dueño registra el lector y genera la clave ----------
reset role;
set role authenticated;
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
select public.access_device_register((select id from public.organizations where slug = 'evolution'), 'MBTEST0001', 'Molinete MB360') as dev \gset
select public.access_device_agent_token(:'dev') as tok \gset
select test.check(length(:'tok') = 48, 'clave de 48 caracteres');
-- el panel no puede leer el hash de la clave
select test.expect_error($q$select agent_token_hash from public.access_devices$q$, 'permission denied');
select test.check((select count(*) from public.access_devices where id = :'dev') = 1, 'el panel sigue viendo el lector');

-- un socio no puede generar claves
select test.login('00000000-0000-0000-0000-00000000000d');
select test.expect_error(format($q$select public.access_device_agent_token(%L)$q$, :'dev'), 'FORBIDDEN');
-- ni llamar a la puerta del intermediario
select test.expect_error($q$select public.agent_call('MBTEST0001', 'x', '1.1.1.1', 'poll')$q$, 'permission denied');

-- ---------- Puerta del intermediario ----------
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
set role service_role;

select test.check(public.agent_call('MBTEST0001', 'mala', '1.1.1.1', 'hello') ->> 'status' = 'unauthorized', 'clave equivocada');
select test.check(public.agent_call('MBTEST0001', '', '1.1.1.1', 'hello') ->> 'status' = 'unauthorized', 'sin clave');
select test.check(public.agent_call('NOEXISTE01', :'tok', '1.1.1.1', 'hello') ->> 'status' = 'unauthorized', 'lector inexistente');
select test.check(public.agent_call('MBTEST0001', :'tok', '1.1.1.1', 'hello',
  '{"info":{"mode":"lectura","version":"1.0.0"}}') ->> 'status' = 'ok', 'saludo con la clave');
select test.check((select info -> 'agent' ->> 'mode' from public.access_devices where id = :'dev') = 'lectura', 'queda anotado el modo');

-- El lector conectado a la nube (ADMS) ya no se lleva la cola
select test.check(jsonb_array_length(public.adms_poll('MBTEST0001', '1.1.1.1')) = 0, 'ADMS no recibe comandos si hay intermediario');
select test.check((select count(*) from public.access_commands where device_id = :'dev' and status = 'pending') > 0, 'la cola sigue pendiente');

-- El intermediario sí, aunque cambie la IP pública del gimnasio
select public.agent_call('MBTEST0001', :'tok', '5.5.5.5', 'poll') as poll \gset
select test.check(:'poll'::jsonb ->> 'status' = 'ok' and jsonb_array_length(:'poll'::jsonb -> 'commands') > 0, 'el intermediario recibe la cola');
select test.check((select pending_ip is null from public.access_devices where id = :'dev'), 'cambio de IP no bloquea al intermediario');
select test.check(public.agent_call('MBTEST0001', :'tok', '5.5.5.5', 'results',
  jsonb_build_object('results', (select jsonb_agg(jsonb_build_object('id', id, 'ret', 0)) from public.access_commands
                                  where device_id = :'dev' and status = 'sent'))) ->> 'status' = 'ok', 'resultados');
select test.check((select count(*) from public.access_commands where device_id = :'dev' and status = 'sent') = 0, 'comandos confirmados');

-- Usuarios del sistema anterior: quedan como "no vinculados"; sus huellas NO se suben
select public.agent_call('MBTEST0001', :'tok', '5.5.5.5', 'push', jsonb_build_object('table', 'USERINFO', 'records',
  '[{"k":"user","pin":1776,"name":"DIEGO"}]'::jsonb)) as r1 \gset
select test.check((select not managed and member_id is null from public.access_device_users where device_id = :'dev' and pin = 1776),
  'usuario viejo queda sin vincular');
select access_pin as pin_al from public.members where first_name = 'Álvaro' \gset
select public.agent_call('MBTEST0001', :'tok', '5.5.5.5', 'push', jsonb_build_object('table', 'FP', 'records', jsonb_build_array(
  jsonb_build_object('k', 'bio', 'tbl', 'FP', 'pin', 1776, 'pin_key', 'PIN', 'key', '0', 'fields', E'FID=0\tSize=4\tValid=1\tTMP=AAAA'),
  jsonb_build_object('k', 'bio', 'tbl', 'FP', 'pin', :pin_al, 'pin_key', 'PIN', 'key', '3', 'fields', E'FID=3\tSize=4\tValid=1\tTMP=BBBB')))) as r2 \gset
select test.check(:'r2'::jsonb -> 'skipped_bio_pins' = '[1776]'::jsonb, 'huella de no-socio descartada');
select test.check(not exists (select 1 from public.access_templates where pin = 1776), 'no se guarda la huella del no-socio');
select test.check(exists (select 1 from public.access_templates where pin = :pin_al and tbl = 'FP' and tkey = '3'), 'huella del socio guardada');

-- Entrada marcada
select public.agent_call('MBTEST0001', :'tok', '5.5.5.5', 'push', jsonb_build_object('table', 'ATTLOG', 'records', jsonb_build_array(
  jsonb_build_object('k', 'att', 'pin', (select access_pin from public.members where first_name = 'Juan'),
                     't', to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD HH24:MI:SS'), 'v', 1)))) as r3 \gset
select test.check((:'r3'::jsonb ->> 'accepted')::int = 1, 'entrada registrada');
select test.check((select method::text from public.checkins where member_id = (select id from public.members where first_name = 'Juan')
                    order by created_at desc limit 1) = 'fingerprint', 'entrada por huella');

-- Pausado: no recibe comandos
reset role;
set role authenticated;
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
select public.access_device_update(:'dev', '', false);
reset role;
set role service_role;
select test.check(public.agent_call('MBTEST0001', :'tok', '5.5.5.5', 'poll') ->> 'status' = 'inactive', 'pausado');

-- Clave nueva invalida la anterior
reset role;
set role authenticated;
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
select public.access_device_agent_token(:'dev') as tok2 \gset
reset role;
set role service_role;
select test.check(public.agent_call('MBTEST0001', :'tok', '5.5.5.5', 'hello') ->> 'status' = 'unauthorized', 'clave vieja anulada');
select test.check(public.agent_call('MBTEST0001', :'tok2', '5.5.5.5', 'hello') ->> 'status' <> 'unauthorized', 'clave nueva funciona');

reset role;
select test.ok('intermediario: clave, cola exclusiva, sin bloqueo por IP, huellas solo de socios, entradas, pausa');
\echo 'INTERMEDIARIO: TODAS LAS PRUEBAS PASARON'
