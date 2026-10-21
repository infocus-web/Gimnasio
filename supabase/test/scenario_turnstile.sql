-- Pruebas de 0024 (QR en la tablet del molinete). Corre después de scenario_agent.sql.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
-- Datos: socio con plan de musculación al día, socio solo-clases, socio moroso
do $$
declare
  v_org uuid := (select id from public.organizations where slug = 'evolution');
  v_gym uuid; v_cls uuid; m1 uuid; m2 uuid; m3 uuid; b1 uuid; b2 uuid; b3 uuid; s1 uuid; s2 uuid; s3 uuid;
begin
  insert into public.membership_plans (org_id, name, kind, price_cents, currency, billing_interval, includes_open_gym)
    values (v_org, 'Musculación QR', 'recurring', 3000000, 'ARS', 'month', true) returning id into v_gym;
  insert into public.membership_plans (org_id, name, kind, price_cents, currency, billing_interval, includes_open_gym)
    values (v_org, 'Solo clases QR', 'recurring', 2000000, 'ARS', 'month', false) returning id into v_cls;
  insert into public.members (org_id, first_name, last_name) values (v_org, 'Qr', 'AlDia') returning id into m1;
  insert into public.members (org_id, first_name, last_name) values (v_org, 'Qr', 'Clases') returning id into m2;
  insert into public.members (org_id, first_name, last_name) values (v_org, 'Qr', 'Moroso') returning id into m3;
  insert into public.billing_accounts (org_id, payer_member_id) values (v_org, m1) returning id into b1;
  insert into public.billing_accounts (org_id, payer_member_id) values (v_org, m2) returning id into b2;
  insert into public.billing_accounts (org_id, payer_member_id, delinquent) values (v_org, m3, true) returning id into b3;
  update public.members set billing_account_id = b1 where id = m1;
  update public.members set billing_account_id = b2 where id = m2;
  update public.members set billing_account_id = b3 where id = m3;
  insert into public.memberships (org_id, plan_id, billing_account_id, current_period_start, current_period_end, provider, cancel_at_period_end)
    values (v_org, v_gym, b1, now() - interval '5 days', now() + interval '25 days', 'cash', true) returning id into s1;
  insert into public.memberships (org_id, plan_id, billing_account_id, current_period_start, current_period_end, provider, cancel_at_period_end)
    values (v_org, v_cls, b2, now() - interval '5 days', now() + interval '25 days', 'cash', true) returning id into s2;
  insert into public.memberships (org_id, plan_id, billing_account_id, current_period_start, current_period_end, provider, cancel_at_period_end)
    values (v_org, v_gym, b3, now() - interval '5 days', now() + interval '25 days', 'cash', true) returning id into s3;
  insert into public.membership_members (membership_id, member_id, org_id) values (s1, m1, v_org), (s2, m2, v_org), (s3, m3, v_org);
end $$;

create or replace function test.qr(p_last text) returns text language sql as $$
  select 'v1.' || m.id || '.' || st || '.' || private.qr_signature(m.id, st)
    from public.members m, lateral (select floor(extract(epoch from now()) / 30)::bigint as st) x
   where m.first_name = 'Qr' and m.last_name = p_last
$$;
select test.qr('AlDia') as qr1, test.qr('Clases') as qr2, test.qr('Moroso') as qr3 \gset

-- ---------- El dueño vincula una tablet al lector del intermediario ----------
set role authenticated;
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
select id as dev from public.access_devices where serial_number = 'MBTEST0001' \gset
select public.access_device_update(:'dev', '', true);
select public.access_device_kiosk_token(:'dev') as kiosk \gset
select public.access_device_agent_token(:'dev') as tok \gset
select test.expect_error($q$select kiosk_token_hash from public.access_devices$q$, 'permission denied');
select test.login('00000000-0000-0000-0000-00000000000d');
select test.expect_error(format($q$select public.access_device_kiosk_token(%L)$q$, :'dev'), 'FORBIDDEN');
select test.expect_error($q$select public.turnstile_scan('x', 'y')$q$, 'permission denied');

reset role;
set role service_role;
select test.check(public.turnstile_scan('mala', :'qr1') ->> 'status' = 'unauthorized', 'tablet con clave equivocada');
select test.check(public.turnstile_scan(:'kiosk', null) ->> 'status' = 'ok', 'latido de la tablet');
update public.access_devices set info = info || '{"agent_seen_at":"2020-01-01T00:00:00Z"}' where id = :'dev';
select test.check((public.turnstile_scan(:'kiosk', null) ->> 'opener_online')::boolean = false, 'molinete sin intermediario conectado');
select public.agent_call('MBTEST0001', :'tok', '5.5.5.5', 'hello') ->> 'status' as st \gset
select test.check((public.turnstile_scan(:'kiosk', null) ->> 'opener_online')::boolean, 'molinete con intermediario conectado');

-- QR inválido / vencido / de otro
select test.check(public.turnstile_scan(:'kiosk', 'hola') ->> 'reason' = 'QR_INVALID', 'texto que no es QR');
select test.check(public.turnstile_scan(:'kiosk', regexp_replace(:'qr1', '\.\d+\.', '.123.')) ->> 'reason' = 'QR_EXPIRED_OR_INVALID', 'QR vencido');

-- Socio al día: abre, registra y encola UNA apertura
select public.turnstile_scan(:'kiosk', :'qr1') as r1 \gset
select test.check((:'r1'::jsonb ->> 'allowed')::boolean and :'r1'::jsonb ->> 'first_name' = 'Qr', 'al día entra');
select test.check((select count(*) from public.access_commands where device_id = :'dev' and kind = 'unlock' and status = 'pending') = 1, 'una apertura encolada');
select test.check((select count(*) from public.checkins c join public.members m on m.id = c.member_id
                    where m.last_name = 'AlDia' and c.method = 'qr' and c.allowed) = 1, 'entrada registrada');
-- relectura inmediata del mismo QR: no abre otra vez
select test.check((public.turnstile_scan(:'kiosk', :'qr1') ->> 'duplicate')::boolean, 'relectura = duplicado');
select test.check((select count(*) from public.access_commands where device_id = :'dev' and kind = 'unlock') = 1, 'sin segunda apertura');

-- La cola normal no se lleva las aperturas; el canal rápido sí
select test.check(not exists (select 1 from jsonb_array_elements(public.agent_call('MBTEST0001', :'tok', '5.5.5.5', 'poll') -> 'commands') e
                               where e ->> 'cmd' like 'UNLOCK%'), 'la cola normal no trae aperturas');
select public.agent_call('MBTEST0001', :'tok', '5.5.5.5', 'unlocks') as u \gset
select test.check(jsonb_array_length(:'u'::jsonb -> 'commands') = 1 and :'u'::jsonb -> 'commands' -> 0 ->> 'cmd' = 'UNLOCK 1', 'canal rápido trae la apertura');
select test.check(jsonb_array_length(public.agent_call('MBTEST0001', :'tok', '5.5.5.5', 'unlocks') -> 'commands') = 0, 'no se repite');
select test.check(public.agent_call('MBTEST0001', 'mala', '5.5.5.5', 'unlocks') ->> 'status' = 'unauthorized', 'canal rápido pide clave');

-- La tablet pregunta si abrió: el intermediario confirma
select :'r1'::jsonb ->> 'unlock_id' as uid \gset
select test.check(public.turnstile_scan(:'kiosk', null, :'uid'::bigint) ->> 'unlock' = 'waiting', 'apertura en curso');
select public.agent_call('MBTEST0001', :'tok', '5.5.5.5', 'results',
         jsonb_build_object('results', jsonb_build_array(jsonb_build_object('id', :'uid'::bigint, 'ret', 0)))) as rr \gset
select test.check(public.turnstile_scan(:'kiosk', null, :'uid'::bigint) ->> 'unlock' = 'opened', 'apertura confirmada');

-- Pasar el QR a otro: el mismo socio no entra de nuevo dentro de 3 minutos
update public.access_commands set created_at = now() - interval '61 seconds' where device_id = :'dev' and kind = 'unlock';
select test.check(public.turnstile_scan(:'kiosk', :'qr1') ->> 'reason' = 'RECENT_ENTRY', 'anti pasar el QR');
update public.access_commands set created_at = now() - interval '4 minutes' where device_id = :'dev' and kind = 'unlock';
select public.turnstile_scan(:'kiosk', :'qr1') as r2 \gset
select test.check((:'r2'::jsonb ->> 'allowed')::boolean and :'r2'::jsonb ->> 'unlock_id' is not null, 'después de 3 minutos vuelve a entrar');

-- Una apertura vieja nunca se ejecuta, y como no abrió no cuenta como entrada
update public.access_commands set created_at = now() - interval '25 seconds' where device_id = :'dev' and kind = 'unlock' and status = 'pending';
select test.check(jsonb_array_length(public.agent_call('MBTEST0001', :'tok', '5.5.5.5', 'unlocks') -> 'commands') = 0, 'apertura vieja descartada');
select test.check(public.turnstile_scan(:'kiosk', null, (:'r2'::jsonb ->> 'unlock_id')::bigint) ->> 'unlock' = 'failed', 'la tablet se entera de que no abrió');
select test.check((public.turnstile_scan(:'kiosk', :'qr1') ->> 'allowed')::boolean
                  and (public.turnstile_scan(:'kiosk', :'qr1') ->> 'duplicate')::boolean, 'si no abrió puede volver a pasar el QR');

-- Intermediario caído: no registra ni encola nada (pasa por recepción)
update public.access_devices set info = info || '{"agent_seen_at":"2020-01-01T00:00:00Z"}' where id = :'dev';
select count(*) as n_before from public.checkins \gset
select test.check(public.turnstile_scan(:'kiosk', :'qr2') ->> 'reason' = 'TURNSTILE_OFFLINE', 'molinete caído avisa');
select test.check((select count(*) from public.checkins) = :n_before, 'molinete caído no registra');
select public.agent_call('MBTEST0001', :'tok', '5.5.5.5', 'hello') ->> 'status' as st \gset

-- Solo clases / moroso: no abren y queda registrado el rechazo una sola vez
select test.check(public.turnstile_scan(:'kiosk', :'qr2') ->> 'reason' = 'PLAN_WITHOUT_GYM', 'plan sin musculación');
select test.check(public.turnstile_scan(:'kiosk', :'qr3') ->> 'reason' = 'PAYMENT_PAST_DUE', 'moroso');
select public.turnstile_scan(:'kiosk', :'qr3') as r3 \gset
select test.check((select count(*) from public.checkins c join public.members m on m.id = c.member_id
                    where m.last_name = 'Moroso' and m.first_name = 'Qr' and not c.allowed) = 1, 'rechazo registrado una vez');
select test.check((select count(*) from public.access_commands c join public.members m on m.id = c.member_id
                    where c.device_id = :'dev' and c.kind = 'unlock' and m.last_name in ('Clases', 'Moroso')) = 0, 'rechazos no abren');

-- Tablet de un lector pausado: no abre
reset role;
set role authenticated;
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
select public.access_device_update(:'dev', '', false);
reset role;
set role service_role;
select test.check(not (public.turnstile_scan(:'kiosk', null) ->> 'opener_online')::boolean, 'pausado = molinete desconectado');

reset role;
select test.ok('molinete QR: tablet vinculada, regla de musculación, apertura única y rápida, anti pasar el QR, rechazos');
\echo 'MOLINETE QR: TODAS LAS PRUEBAS PASARON'
