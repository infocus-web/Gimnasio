-- Pruebas de 0029 (acceso, planes e invitados). Corre después de scenario_turnstile / member_delete.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);

insert into auth.users (id, email) values
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'socio.horario@test.com'),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'socio.invita@test.com'),
  ('bbbbbbbb-0000-0000-0000-0000000000b3', 'socio.sinplan@test.com')
on conflict do nothing;

-- Datos: plan mañana (Lun–Vie 7 a 14), plan libre; socios con cada uno
do $$
declare
  v_org uuid := (select id from public.organizations where slug = 'evolution');
  p_am uuid; p_free uuid; m1 uuid; m2 uuid; m3 uuid; b1 uuid; b2 uuid; s1 uuid; s2 uuid;
begin
  insert into public.membership_plans (org_id, name, kind, price_cents, currency, billing_interval, includes_open_gym, access_windows)
    values (v_org, 'Mañana AP', 'recurring', 2500000, 'ARS', 'month', true,
            '[{"days":[1,2,3,4,5],"from":"07:00","to":"14:00"}]') returning id into p_am;
  insert into public.membership_plans (org_id, name, kind, price_cents, currency, billing_interval, includes_open_gym)
    values (v_org, 'Libre AP', 'recurring', 3000000, 'ARS', 'month', true) returning id into p_free;
  insert into public.members (org_id, user_id, first_name, last_name, status)
    values (v_org, 'bbbbbbbb-0000-0000-0000-0000000000b1', 'Ap', 'Horario', 'active') returning id into m1;
  insert into public.members (org_id, user_id, first_name, last_name, status, document_id)
    values (v_org, 'bbbbbbbb-0000-0000-0000-0000000000b2', 'Ap', 'Invita', 'active', '30999111') returning id into m2;
  insert into public.members (org_id, user_id, first_name, last_name, status)
    values (v_org, 'bbbbbbbb-0000-0000-0000-0000000000b3', 'Ap', 'SinPlan', 'active') returning id into m3;
  insert into public.billing_accounts (org_id, payer_member_id) values (v_org, m1) returning id into b1;
  insert into public.billing_accounts (org_id, payer_member_id) values (v_org, m2) returning id into b2;
  update public.members set billing_account_id = b1 where id = m1;
  update public.members set billing_account_id = b2 where id = m2;
  insert into public.memberships (org_id, plan_id, billing_account_id, current_period_start, current_period_end, provider, cancel_at_period_end)
    values (v_org, p_am, b1, now() - interval '10 days', now() + interval '25 days', 'cash', true) returning id into s1;
  insert into public.memberships (org_id, plan_id, billing_account_id, current_period_start, current_period_end, provider, cancel_at_period_end)
    values (v_org, p_free, b2, now() - interval '10 days', now() + interval '25 days', 'cash', true) returning id into s2;
  insert into public.membership_members (membership_id, member_id, org_id) values (s1, m1, v_org), (s2, m2, v_org);
end $$;

select id as org from public.organizations where slug = 'evolution' \gset
select id as m1 from public.members where first_name = 'Ap' and last_name = 'Horario' \gset
select id as m2 from public.members where first_name = 'Ap' and last_name = 'Invita' \gset
select id as m3 from public.members where first_name = 'Ap' and last_name = 'SinPlan' \gset
select id as p_am from public.membership_plans where name = 'Mañana AP' \gset

-- ================= 1 · Horario por plan =================
-- Lunes de la semana que viene en hora del gimnasio
select ((date_trunc('week', now() at time zone 'America/Argentina/Buenos_Aires'))::date + 7) as mon \gset
create or replace function test.at_local(p_day date, p_time text) returns timestamptz language sql as $$
  select (p_day + p_time::time) at time zone 'America/Argentina/Buenos_Aires'
$$;
create or replace function test.qr_of(p_member uuid) returns text language sql as $$
  select 'v1.' || p_member || '.' || st || '.' || private.qr_signature(p_member, st)
    from (select floor(extract(epoch from now()) / 30)::bigint as st) x
$$;
select test.check(private.member_gym_access(:'m1', test.at_local(:'mon', '10:00')) is null, 'plan mañana: lunes 10 h entra');
select test.check(private.member_gym_access(:'m1', test.at_local(:'mon', '07:00')) is null, 'plan mañana: 7:00 justo entra');
select test.check(private.member_gym_access(:'m1', test.at_local(:'mon', '14:00')) = 'OUTSIDE_PLAN_HOURS', 'plan mañana: 14:00 ya no');
select test.check(private.member_gym_access(:'m1', test.at_local(:'mon', '06:59')) = 'OUTSIDE_PLAN_HOURS', 'plan mañana: 6:59 no');
select test.check(private.member_gym_access(:'m1', test.at_local((:'mon'::date + 5), '10:00')) = 'OUTSIDE_PLAN_HOURS', 'plan mañana: sábado no');
select test.check(private.member_gym_access(:'m1', test.at_local((:'mon'::date + 4), '13:59')) is null, 'plan mañana: viernes 13:59 sí');
-- Zona horaria: 16:00 UTC = 13:00 en Buenos Aires (entra); 18:00 UTC = 15:00 (no)
select test.check(private.member_gym_access(:'m1', (:'mon'::date + time '16:00') at time zone 'UTC') is null, 'zona horaria: 13 h local entra');
select test.check(private.member_gym_access(:'m1', (:'mon'::date + time '18:00') at time zone 'UTC') = 'OUTSIDE_PLAN_HOURS', 'zona horaria: 15 h local no');
select test.check(not private.member_gym_allowed(:'m1', test.at_local(:'mon', '20:00')), 'member_gym_allowed mira el horario');
select test.check(private.member_gym_access(:'m2', test.at_local((:'mon'::date + 6), '23:30')) is null, 'plan sin franja: domingo de noche entra');
select test.check(private.member_gym_access(:'m3', now()) = 'NO_ACTIVE_MEMBERSHIP', 'sin plan: motivo de siempre');
-- Franja que cruza la medianoche
select test.check(private.plan_window_ok('[{"days":[1],"from":"22:00","to":"02:00"}]', (:'mon'::date + time '23:00')), 'franja nocturna 23 h');
select test.check(not private.plan_window_ok('[{"days":[1],"from":"22:00","to":"02:00"}]', (:'mon'::date + time '12:00')), 'franja nocturna 12 h no');
select test.check(private.plan_window_ok('[{"days":[1,2,3,4,5,6,7],"from":"00:00","to":"24:00"}]', (:'mon'::date + time '23:59')), 'hasta 24:00');
-- Validación del formato
select test.expect_error(format($q$update public.membership_plans set access_windows = '[{"days":[8],"from":"07:00","to":"14:00"}]' where id = %L$q$, :'p_am'), 'access_windows_check');
select test.expect_error(format($q$update public.membership_plans set access_windows = '[{"days":[1],"from":"7","to":"14:00"}]' where id = %L$q$, :'p_am'), 'access_windows_check');

-- Molinete: vincular tablet y dejar el intermediario conectado
set role authenticated;
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
select id as dev from public.access_devices where serial_number = 'MBTEST0001' \gset
select public.access_device_update(:'dev', '', true);
select public.access_device_kiosk_token(:'dev') as kiosk \gset
select public.access_device_agent_token(:'dev') as tok \gset
reset role;
set role service_role;
select public.agent_call('MBTEST0001', :'tok', '5.5.5.5', 'hello') ->> 'status' as st \gset
select test.check((public.turnstile_scan(:'kiosk', null) ->> 'opener_online')::boolean, 'molinete conectado');
select test.check((public.turnstile_scan(:'kiosk', null) -> 'occupancy' ->> 'people') is not null, 'latido trae la concurrencia');

reset role;
-- Franja que NO incluye hoy (en hora del gimnasio): fuera de horario
update public.membership_plans
   set access_windows = jsonb_build_array(jsonb_build_object(
         'days', (select jsonb_agg(g) from generate_series(1, 7) g
                   where g <> extract(isodow from now() at time zone 'America/Argentina/Buenos_Aires')::int),
         'from', '00:00', 'to', '24:00'))
 where id = :'p_am';
select test.qr_of(:'m1') as q \gset
set role service_role;
select public.turnstile_scan(:'kiosk', :'q') as r \gset
select test.check(:'r'::jsonb ->> 'reason' = 'OUTSIDE_PLAN_HOURS' and not (:'r'::jsonb ->> 'allowed')::boolean, 'molinete: fuera de horario no abre');
select test.check(jsonb_typeof(:'r'::jsonb -> 'access_windows') = 'array', 'molinete: manda la franja para el mensaje');
select test.check((select count(*) from public.access_commands where member_id = :'m1' and kind = 'unlock') = 0, 'fuera de horario no encola apertura');
-- Recepción: solo avisa (deja entrar)
reset role;
select id as loc from public.locations where org_id = :'org' limit 1 \gset
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000a');
select public.checkin_scan(:'loc', null, :'m1', 'manual') as rc \gset
select test.check((:'rc'::jsonb ->> 'allowed')::boolean and :'rc'::jsonb -> 'warnings' ? 'OUTSIDE_PLAN_HOURS', 'recepción: entra con aviso de horario');
reset role;
select test.check((select reason from public.checkins where member_id = :'m1' and method = 'manual' order by id desc limit 1) = 'OUTSIDE_PLAN_HOURS', 'recepción: queda anotado el aviso');
-- Franja de todos los días: entra por el molinete
update public.membership_plans set access_windows = '[{"days":[1,2,3,4,5,6,7],"from":"00:00","to":"24:00"}]' where id = :'p_am';
delete from public.checkins where member_id = :'m1';   -- (anti-rebote de rechazos)
select test.qr_of(:'m1') as q \gset
set role service_role;
select test.check((public.turnstile_scan(:'kiosk', :'q') ->> 'allowed')::boolean, 'molinete: dentro del horario abre');

-- ================= 3 · Apto físico =================
reset role;
select test.check(private.member_gym_access(:'m2', now()) is null, 'apto: con la regla apagada no se exige');
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000a');
select test.expect_error(format($q$select public.access_settings_save(%L, 1, true, 75, 60)$q$, :'org'), 'FORBIDDEN');
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
select public.access_settings_save(:'org', 1, true, 75, 60) is not null as saved \gset
reset role;
select test.qr_of(:'m2') as q \gset
set role service_role;
select public.turnstile_scan(:'kiosk', :'q') as r \gset
select test.check(:'r'::jsonb ->> 'reason' = 'MEDICAL_CERT_REQUIRED', 'apto: sin apto no entra por el molinete');
reset role;
update public.members set medical_cert_path = 'x/y/apto.pdf', medical_cert_expires_on = current_date - 1 where id = :'m2';
select test.check(private.member_gym_access(:'m2', now()) = 'MEDICAL_CERT_REQUIRED', 'apto: vencido no entra');
update public.members set medical_cert_expires_on = current_date + 200 where id = :'m2';
select test.check(private.member_gym_access(:'m2', now()) is null, 'apto: vigente entra');
update public.members set medical_cert_path = null, medical_cert_expires_on = null where id = :'m2';
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000a');
select public.checkin_scan(:'loc', null, :'m2', 'manual') as rc \gset
select test.check((:'rc'::jsonb ->> 'allowed')::boolean and :'rc'::jsonb -> 'warnings' ? 'MEDICAL_CERT_REQUIRED', 'apto: recepción solo avisa');
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
select public.access_settings_save(:'org', 1, false, 75, 60) is not null as saved \gset
reset role;
select test.check(private.member_gym_access(:'m2', now()) is null, 'apto: regla apagada de nuevo');

-- ================= 2 · Pases =================
-- Recepción emite un pase por día (2 entradas, cobrado en efectivo)
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000d');
select test.expect_error(format($q$select public.day_pass_issue(%L, 'day', 'Nadie')$q$, :'org'), 'FORBIDDEN');
select test.login('00000000-0000-0000-0000-00000000000a');
select test.expect_error(format($q$select public.day_pass_issue(%L, 'day', 'Juan Pérez', null, null, null, 1, 1, 500000, null)$q$, :'org'), 'PAYMENT_METHOD_REQUIRED');
select public.day_pass_issue(:'org', 'day', 'Juan Pérez', '11 5555-1234', '28.444.555', null, 1, 2, 500000, 'cash') as pass \gset
select :'pass'::jsonb ->> 'qr' as pqr, :'pass'::jsonb ->> 'code' as pcode, :'pass'::jsonb ->> 'id' as pid \gset
select test.check(:'pqr' ~ '^p1\.[A-Z0-9]{10}\.[0-9a-f]{24}$', 'QR del pase con formato p1.<code>.<firma>');
select test.check((select holder_document = '28444555' and price_cents = 500000 and payment_method = 'cash' from public.day_passes where id = :'pid'), 'pase guarda DNI limpio, precio y medio');
reset role;

-- Página pública (sin login)
set role anon;
select test.check(public.day_pass_public('evolution', :'pcode') ->> 'qr' = :'pqr', 'página pública muestra el QR');
select test.check(public.day_pass_public('evolution', lower(:'pcode')) ->> 'status' = 'valid', 'código en minúscula también');
select test.check(public.day_pass_public('evolution', 'ZZZZZZZZZZ') is null, 'código inexistente');
select test.check(public.day_pass_public('otro-gym', :'pcode') is null, 'código de otro gimnasio');
select test.expect_error($q$select * from public.day_passes$q$, 'permission denied');
reset role;

set role service_role;
-- Firma inválida / formato
select test.check(public.turnstile_scan(:'kiosk', regexp_replace(:'pqr', '.{4}$', '0000')) ->> 'reason' = 'PASS_INVALID', 'pase con firma inválida');
select test.check(public.turnstile_scan(:'kiosk', 'p1.ABC') ->> 'reason' = 'QR_INVALID', 'pase mal formado');
-- Entra, descuenta una entrada, encola apertura
select public.turnstile_scan(:'kiosk', :'pqr') as r \gset
select test.check((:'r'::jsonb ->> 'allowed')::boolean and :'r'::jsonb ->> 'first_name' = 'Juan' and (:'r'::jsonb ->> 'entries_left')::int = 1, 'pase: entra y le queda 1');
select test.check((select entries_used from public.day_passes where id = :'pid') = 1, 'pase: entrada descontada');
select test.check((select count(*) from public.day_pass_entries where pass_id = :'pid') = 1, 'pase: entrada registrada');
select test.check((select kind = 'unlock' and status = 'pending' from public.access_commands where id = (:'r'::jsonb ->> 'unlock_id')::bigint), 'pase: apertura encolada');
select test.check((public.turnstile_scan(:'kiosk', :'pqr') ->> 'duplicate')::boolean, 'pase: relectura = duplicado');
select test.check((select entries_used from public.day_passes where id = :'pid') = 1, 'pase: relectura no descuenta');
-- Pasó 1 minuto: no puede volver a entrar enseguida
update public.day_pass_entries set created_at = now() - interval '70 seconds' where pass_id = :'pid';
select test.check(public.turnstile_scan(:'kiosk', :'pqr') ->> 'reason' = 'RECENT_ENTRY', 'pase: anti reingreso inmediato');
-- La apertura no se hizo: esa entrada no cuenta
update public.access_commands set status = 'superseded' where id = (:'r'::jsonb ->> 'unlock_id')::bigint;
select public.turnstile_scan(:'kiosk', :'pqr') as r2 \gset
select test.check((:'r2'::jsonb ->> 'allowed')::boolean and (:'r2'::jsonb ->> 'entries_left')::int = 1, 'pase: si no abrió, no descuenta');
-- Segunda entrada real y después se agotó
update public.day_pass_entries set created_at = now() - interval '4 minutes' where pass_id = :'pid';
select test.check((public.turnstile_scan(:'kiosk', :'pqr') ->> 'allowed')::boolean, 'pase: segunda entrada');
update public.day_pass_entries set created_at = now() - interval '4 minutes' where pass_id = :'pid';
select test.check(public.turnstile_scan(:'kiosk', :'pqr') ->> 'reason' = 'PASS_USED_UP', 'pase: sin entradas restantes');
reset role;
select test.check(public.day_pass_public('evolution', :'pcode') ->> 'status' = 'used' and public.day_pass_public('evolution', :'pcode') ->> 'qr' is null, 'página pública: usado, sin QR');

-- Vencido / todavía no válido / anulado
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000a');
select public.day_pass_issue(:'org', 'trial', 'Ana Prueba', null, null, null, 3, 5, null, null) as t \gset
select :'t'::jsonb ->> 'qr' as tqr, :'t'::jsonb ->> 'id' as tid \gset
reset role;
update public.day_passes set valid_until = now() - interval '1 minute', valid_from = now() - interval '2 days' where id = :'tid';
set role service_role;
select test.check(public.turnstile_scan(:'kiosk', :'tqr') ->> 'reason' = 'PASS_EXPIRED', 'pase vencido');
reset role;
update public.day_passes set valid_from = now() + interval '1 day', valid_until = now() + interval '2 days' where id = :'tid';
set role service_role;
select test.check(public.turnstile_scan(:'kiosk', :'tqr') ->> 'reason' = 'PASS_NOT_YET_VALID', 'pase todavía no válido');
reset role;
update public.day_passes set valid_from = now() - interval '1 hour' where id = :'tid';
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000a');
select public.day_pass_revoke(:'tid');
reset role;
set role service_role;
select test.check(public.turnstile_scan(:'kiosk', :'tqr') ->> 'reason' = 'PASS_REVOKED', 'pase anulado');
reset role;

-- Recepción también lee el QR del pase
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000a');
select public.day_pass_issue(:'org', 'day', 'Carla Día', null, null, null, 1, 1, null, null) as c \gset
select public.checkin_scan(:'loc', :'c'::jsonb ->> 'qr') as rc \gset
select test.check((:'rc'::jsonb ->> 'allowed')::boolean and :'rc'::jsonb -> 'member' ->> 'first_name' = 'Invitado: Carla Día', 'recepción: pase entra como invitado');
select test.check((public.checkin_scan(:'loc', :'c'::jsonb ->> 'qr') ->> 'duplicate')::boolean, 'recepción: relectura del pase = duplicado');
select test.check((select count(*) from public.day_pass_entries where pass_id = (:'c'::jsonb ->> 'id')::uuid) = 1, 'recepción: una sola entrada');
select test.check((select count(*) from public.day_pass_entries e join public.day_passes d on d.id = e.pass_id where d.holder_name = 'Carla Día') = 1, 'recepción ve las entradas de pases');
-- Pase de 1 entrada usado en el molinete: en recepción NO figura como "duplicado permitido"
select public.day_pass_issue(:'org', 'day', 'Dario Molinete', null, null, null, 1, 1, null, null) as dm \gset
reset role;
set role service_role;
select test.check((public.turnstile_scan(:'kiosk', :'dm'::jsonb ->> 'qr') ->> 'allowed')::boolean, 'pase 1 entrada: entra por el molinete');
reset role;
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000a');
select public.checkin_scan(:'loc', :'dm'::jsonb ->> 'qr') as rdm \gset
select test.check(not (:'rdm'::jsonb ->> 'allowed')::boolean and :'rdm'::jsonb ->> 'reason' = 'PASS_USED_UP'
                  and not (:'rdm'::jsonb ->> 'duplicate')::boolean, 'recepción: pase agotado en el molinete no pasa como duplicado');
select test.check((select entries_used from public.day_passes where id = (:'dm'::jsonb ->> 'id')::uuid) = 1, 'recepción: no suma otra entrada');

-- ---------- Invitado de un socio ----------
select test.login('bbbbbbbb-0000-0000-0000-0000000000b2');
select test.check((public.member_guest_quota(:'m2') ->> 'can_invite')::boolean and (public.member_guest_quota(:'m2') ->> 'quota')::int = 1, 'socio al día puede invitar (1 por mes)');
select test.expect_error(format($q$select public.member_guest_quota(%L)$q$, :'m1'), 'FORBIDDEN');
select test.expect_error(format($q$select public.member_issue_guest_pass(%L, 'Amigo', '123')$q$, :'m2'), 'DOCUMENT_REQUIRED');
select test.expect_error(format($q$select public.member_issue_guest_pass(%L, 'Socio', '30999111')$q$, :'m2'), 'GUEST_IS_MEMBER');
select public.member_issue_guest_pass(:'m2', 'Pedro Amigo', '35.666.777') as g \gset
select :'g'::jsonb ->> 'id' as gid \gset
select test.check((select kind = 'guest' and invited_by_member = :'m2' and max_entries = 1 from public.day_passes where id = :'gid'), 'pase de invitado creado');
select test.check((select count(*) from public.day_passes) = 1, 'el socio ve solo sus invitados');
select test.expect_error(format($q$select public.member_issue_guest_pass(%L, 'Otro Amigo', '36777888')$q$, :'m2'), 'GUEST_LIMIT_REACHED');
-- anula uno sin usar: recupera el cupo
select public.day_pass_revoke(:'gid');
select test.check((public.member_guest_quota(:'m2') ->> 'left')::int = 1, 'anular sin usar devuelve el cupo');
select public.member_issue_guest_pass(:'m2', 'Otro Amigo', '36777888') as g2 \gset
-- el socio no puede tocar la tabla directo
select test.expect_error(format($q$update public.day_passes set revoked_at = now() where id = %L$q$, :'gid'), 'permission denied');
-- un socio sin plan no puede invitar
select test.login('bbbbbbbb-0000-0000-0000-0000000000b3');
select test.check(public.member_guest_quota(:'m3') ->> 'reason' = 'PLAN_NOT_CURRENT', 'socio sin plan no puede invitar');
select test.expect_error(format($q$select public.member_issue_guest_pass(%L, 'X Y', '37888999')$q$, :'m3'), 'PLAN_NOT_CURRENT');
select test.check((select count(*) from public.day_passes) = 0, 'otro socio no ve pases ajenos');
select test.expect_error(format($q$select public.day_pass_revoke(%L)$q$, :'g2'::jsonb ->> 'id'), 'FORBIDDEN');
-- tope configurable: 2 por mes
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
select public.access_settings_save(:'org', 2, false, 75, 60) is not null as saved \gset
select test.login('bbbbbbbb-0000-0000-0000-0000000000b2');
select test.expect_error(format($q$select public.member_issue_guest_pass(%L, 'Re Invitado', '36777888')$q$, :'m2'), 'GUEST_ALREADY_INVITED');
select public.member_issue_guest_pass(:'m2', 'Tercer Amigo', '38999000') ->> 'code' as g3 \gset
select test.expect_error(format($q$select public.member_issue_guest_pass(%L, 'Cuarto Amigo', '39000111')$q$, :'m2'), 'GUEST_LIMIT_REACHED');
reset role;

-- ================= 4 · Concurrencia =================
set role authenticated;
select test.login('bbbbbbbb-0000-0000-0000-0000000000b2');
select public.gym_occupancy(:'org') as occ \gset
select test.check((:'occ'::jsonb ->> 'people')::int >= 3 and :'occ'::jsonb ->> 'level' in ('quiet', 'normal', 'full', 'closed'), 'concurrencia: socios + pases recientes');
select test.check(position('Juan' in :'occ') = 0 and position('Ap' in :'occ') = 0, 'concurrencia: sin nombres');
select test.login('00000000-0000-0000-0000-00000000000f');
select test.check(public.gym_occupancy(:'org') is not null, 'otra socia del gimnasio también la ve');
reset role;
set role anon;
select test.expect_error(format($q$select public.gym_occupancy(%L)$q$, :'org'), 'permission denied');
reset role;
-- Nivel según capacidad
select private.gym_occupancy_calc(:'org') ->> 'people' as n \gset
insert into public.access_settings (org_id, capacity) values (:'org', greatest(1, :'n'::int)) on conflict (org_id) do update set capacity = excluded.capacity;
select test.check(private.gym_occupancy_calc(:'org') ->> 'level' in ('full', 'closed') or :'n'::int = 0, 'capacidad chica = lleno');
update public.access_settings set capacity = 2000, avg_stay_minutes = 15 where org_id = :'org';
select test.check(private.gym_occupancy_calc(:'org') ->> 'level' in ('quiet', 'closed'), 'capacidad grande = tranquilo');
update public.checkins set created_at = now() - interval '20 minutes' where org_id = :'org' and created_at > now() - interval '15 minutes';
update public.day_pass_entries set created_at = now() - interval '20 minutes' where org_id = :'org';
select test.check((private.gym_occupancy_calc(:'org') ->> 'people')::int = 0, 'ventana de duración: los que entraron hace más se cuentan afuera');
update public.access_settings set capacity = 60, avg_stay_minutes = 75, guest_passes_per_month = 1 where org_id = :'org';

reset role;
select test.ok('acceso+: horario por plan (días, horas, zona), apto opcional, pases (firma, vigencia, entradas, anulado), invitados con tope, concurrencia');
\echo 'ACCESO+: TODAS LAS PRUEBAS PASARON'
