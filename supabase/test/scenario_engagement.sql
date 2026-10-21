-- Pruebas de 0028 (comunicación y retención). Corre después de los otros escenarios.
\set ON_ERROR_STOP 1
set client_min_messages = warning;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);

select id as org, timezone as tz from public.organizations where slug = 'evolution' \gset
select id as loc from public.locations where org_id = :'org' order by created_at limit 1 \gset
select (now() at time zone :'tz')::date as today \gset

insert into public.membership_plans (org_id, name, kind, price_cents, currency, billing_interval, includes_open_gym)
values (:'org', 'Eng Musculación', 'recurring', 3000000, 'ARS', 'month', true) returning id as plan \gset

insert into auth.users (id, email) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'eng.referente@test.com'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'eng.titular@test.com'),
  ('eeeeeeee-0000-0000-0000-000000000003', 'eng.logros@test.com');

-- Socio con email y (opcional) plan vigente hasta p_end
create or replace function test.eng_member(p_first text, p_email text, p_end timestamptz, p_user uuid default null,
                                           p_status public.member_status default 'active')
returns uuid language plpgsql as $$
declare v_org uuid := (select id from public.organizations where slug = 'evolution');
        v_plan uuid := (select id from public.membership_plans where name = 'Eng Musculación' and org_id = v_org);
        m uuid; b uuid; s uuid;
begin
  insert into public.members (org_id, user_id, first_name, last_name, email, status)
  values (v_org, p_user, p_first, 'Eng', p_email, p_status) returning id into m;
  if p_end is not null then
    insert into public.billing_accounts (org_id, payer_member_id) values (v_org, m) returning id into b;
    update public.members set billing_account_id = b where id = m;
    insert into public.memberships (org_id, plan_id, billing_account_id, current_period_start, current_period_end, provider, cancel_at_period_end)
    values (v_org, v_plan, b, now() - interval '20 days', p_end, 'cash', true) returning id into s;
    insert into public.membership_members (membership_id, member_id, org_id) values (s, m, v_org);
  end if;
  return m;
end $$;
create or replace function test.eng_end(p_member uuid) returns timestamptz language sql as $$
  select ms.current_period_end from public.membership_members mm join public.memberships ms on ms.id = mm.membership_id
   where mm.member_id = p_member order by ms.current_period_end desc limit 1 $$;
create or replace function test.eng_msgs(p_member uuid, p_kind text) returns int language sql as $$
  select count(*)::int from public.message_outbox where member_id = p_member and template_key = p_kind $$;
grant execute on all functions in schema test to authenticated, service_role;

-- ---------- Avisos: todos apagados por defecto ----------
select test.check((select count(*) from public.engagement_notices where org_id = :'org') = 6, 'seis avisos sembrados');
select test.check(not exists (select 1 from public.engagement_notices where org_id = :'org' and enabled), 'apagados por defecto');
select test.eng_member('Apagado', 'apagado@test.com', null) as m_off \gset
select public.engagement_generate(null) as g0 \gset
select test.check(test.eng_msgs(:'m_off', 'welcome') = 0, 'aviso apagado no se encola');

update public.engagement_notices set enabled = true where org_id = :'org';
update public.engagement_settings set birthday_gift_days = 2 where org_id = :'org';

-- ---------- Datos ----------
select test.eng_member('Vence3', 'v3@test.com', private.org_midnight(:'org', :'today'::date + 3) + interval '10 hours') as m_v3 \gset
select test.eng_member('VenceHoy', 'v0@test.com', private.org_midnight(:'org', :'today'::date) + interval '23 hours 59 minutes') as m_v0 \gset
select test.eng_member('SinMail', null, private.org_midnight(:'org', :'today'::date + 3) + interval '10 hours') as m_nomail \gset
select test.eng_member('Inact7', 'i7@test.com', now() + interval '20 days') as m_i7 \gset
select test.eng_member('Inact14', 'i14@test.com', now() + interval '20 days') as m_i14 \gset
select test.eng_member('Cumple', 'cumple@test.com', now() + interval '10 days') as m_bday \gset
select test.eng_member('CumpleSinPlan', 'cumple2@test.com', null) as m_bday2 \gset
select test.eng_member('Lead', 'lead@test.com', null, null, 'lead') as m_lead \gset
update public.members set created_at = now() - interval '30 days' where id in (:'m_i7', :'m_i14', :'m_bday', :'m_bday2');
update public.memberships set current_period_start = now() - interval '30 days'
 where id in (select membership_id from public.membership_members where member_id in (:'m_i7', :'m_i14'));
update public.members set birth_date = (:'today'::date - interval '30 years')::date where id in (:'m_bday', :'m_bday2');
insert into public.checkins (org_id, location_id, member_id, method, allowed, created_at) values
  (:'org', :'loc', :'m_i7',  'manual', true, now() - interval '8 days'),
  (:'org', :'loc', :'m_i14', 'manual', true, now() - interval '15 days');
select test.eng_end(:'m_bday') as bday_end0 \gset

-- ---------- Generación ----------
select public.engagement_generate(null) as g1 \gset
select test.check(test.eng_msgs(:'m_v3', 'expiry_3d') = 1 and test.eng_msgs(:'m_v3', 'expiry_today') = 0, 'vence en 3 días');
select test.check(test.eng_msgs(:'m_v0', 'expiry_today') = 1 and test.eng_msgs(:'m_v0', 'expiry_3d') = 0, 'vence hoy');
select test.check(not exists (select 1 from public.message_outbox where member_id = :'m_nomail'), 'sin email no se encola');
select test.check(test.eng_msgs(:'m_i7', 'inactive_7') = 1 and test.eng_msgs(:'m_i7', 'inactive_14') = 0, 'te extrañamos 7 días');
select test.check(test.eng_msgs(:'m_i14', 'inactive_14') = 1 and test.eng_msgs(:'m_i14', 'inactive_7') = 0, 'te extrañamos 14 días (sin el de 7)');
select test.check((select body from public.message_outbox where member_id = :'m_i7' and template_key = 'inactive_7') like 'Hace 8 días que no te vemos por %',
  'variables {dias} y {gimnasio} reemplazadas');
select test.check((select subject from public.message_outbox where member_id = :'m_i7' and template_key = 'inactive_7') = '¡Te extrañamos, Inact7!', 'asunto con {nombre}');
select test.check(test.eng_msgs(:'m_v3', 'welcome') = 1 and test.eng_msgs(:'m_i7', 'welcome') = 0 and test.eng_msgs(:'m_lead', 'welcome') = 0,
  'bienvenida solo a socios nuevos activos');
select test.check(test.eng_end(:'m_bday') = :'bday_end0'::timestamptz + interval '2 days', 'cumpleaños suma los días de regalo');
select test.check(test.eng_msgs(:'m_bday', 'birthday') = 1, 'email de cumpleaños');
select test.check((select body from public.message_outbox where member_id = :'m_bday' and template_key = 'birthday')
                  like '%(+2)%' || to_char((:'bday_end0'::timestamptz + interval '2 days') at time zone :'tz', 'DD/MM/YYYY') || '%',
  'cumpleaños informa el nuevo vencimiento');
select test.check(test.eng_msgs(:'m_bday2', 'birthday') = 0 and not exists (select 1 from public.member_rewards where member_id = :'m_bday2'),
  'cumpleaños sin plan vigente: sin regalo');
select test.check((select status from public.message_outbox where member_id = :'m_v3' and template_key = 'expiry_3d') = 'queued'
                  and (select channel from public.message_outbox where member_id = :'m_v3' and template_key = 'expiry_3d') = 'email', 'queda pendiente por email');

-- Segunda corrida el mismo día: nada se repite y el regalo no se suma otra vez
select count(*) as n_before from public.message_outbox \gset
select public.engagement_generate(null) as g2 \gset
select test.check((select count(*) from public.message_outbox) = :n_before, 'dedupe: segunda corrida no encola nada');
select test.check(test.eng_end(:'m_bday') = :'bday_end0'::timestamptz + interval '2 days', 'cumpleaños: regalo una sola vez por año');

-- Entrada rechazada no corta la racha; volver a entrar sí (y a los 7 días de nuevo avisa)
insert into public.checkins (org_id, location_id, member_id, method, allowed, created_at)
values (:'org', :'loc', :'m_i14', 'manual', false, now());
select public.engagement_generate(array['inactive_7', 'inactive_14']) as g3 \gset
select test.check(test.eng_msgs(:'m_i14', 'inactive_14') = 1 and test.eng_msgs(:'m_i14', 'inactive_7') = 0, 'entrada rechazada no reinicia la racha');
insert into public.checkins (org_id, location_id, member_id, method, allowed, created_at)
values (:'org', :'loc', :'m_i7', 'manual', true, now() - interval '7 days 1 hour');
select public.engagement_generate(array['inactive_7']) as g4 \gset
select test.check(test.eng_msgs(:'m_i7', 'inactive_7') = 2, 'nueva racha = nuevo aviso');
select public.engagement_generate(array['inactive_7']) as g5 \gset
select test.check(test.eng_msgs(:'m_i7', 'inactive_7') = 2, 'misma racha no repite');
select test.ok('avisos: vence 3 días/hoy, te extrañamos 7/14 por racha, cumpleaños con regalo anual, bienvenida, dedupe');

-- ---------- Envío: lock, marcar, permisos ----------
set role service_role;
select public.message_outbox_claim(500) as batch \gset
select test.check(jsonb_array_length(:'batch'::jsonb) >= 8, 'toma el lote pendiente');
select test.check(jsonb_array_length(public.message_outbox_claim(500)) = 0, 'lock: una segunda ejecución no toma los mismos');
select (:'batch'::jsonb -> 0 ->> 'id')::bigint as id1, (:'batch'::jsonb -> 1 ->> 'id')::bigint as id2, (:'batch'::jsonb -> 2 ->> 'id')::bigint as id3 \gset
select public.message_outbox_mark(:id1, true, null, false, 're_123');
select public.message_outbox_mark(:id2, false, 'Resend 500', true);
select public.message_outbox_mark(:id3, false, 'Email inválido', false);
reset role;
select test.check((select status from public.message_outbox where id = :id1) = 'sent'
                  and (select sent_at from public.message_outbox where id = :id1) is not null, 'marcado enviado');
select test.check((select status from public.message_outbox where id = :id2) = 'queued'
                  and (select locked_at from public.message_outbox where id = :id2) is null, 'error temporal vuelve a la cola');
select test.check((select status || error from public.message_outbox where id = :id3) = 'failedEmail inválido', 'fallido con el error');
select public.message_outbox_mark(:id1, false, 'x', false);
select test.check((select status from public.message_outbox where id = :id1) = 'sent', 'un enviado no se pisa');
-- Lo que quedó más de 3 días esperando ya no se manda
update public.message_outbox set created_at = now() - interval '4 days', locked_at = null where id = :id2;
set role service_role;
select public.message_outbox_claim(500) as batch2 \gset
reset role;
select test.check((select status from public.message_outbox where id = :id2) = 'failed', 'pendiente viejo se descarta');
reset role;
update public.message_outbox set locked_at = null where status = 'queued';

set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000a');   -- recepción
select test.expect_error($q$select public.message_outbox_claim(10)$q$, 'permission denied');
select test.expect_error($q$select public.engagement_generate(null)$q$, 'permission denied');
select test.expect_error($q$select public.engagement_freeze_tick()$q$, 'permission denied');
select test.expect_error(format($q$insert into public.message_outbox (org_id, member_id, channel, email, subject, body, status)
  values (%L, %L, 'email', 'x@x.com', 'x', 'x', 'queued')$q$, :'org', :'m_v3'), 'row-level security');
reset role;
select test.ok('envío: lote con lock, enviado/fallido/reintento, viejos descartados, solo el servidor');

-- ---------- Panel: permisos ----------
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000a');   -- recepción: members.write, sin automations.manage
select public.engagement_admin_get(:'org') as adm \gset
select test.check(not (:'adm'::jsonb ->> 'can_manage')::boolean and jsonb_array_length(:'adm'::jsonb -> 'notices') = 6, 'recepción ve el panel');
select test.expect_error(format($q$select public.engagement_save_notice(%L, 'welcome', false, 'x', 'y')$q$, :'org'), 'FORBIDDEN');
select test.expect_error(format($q$select public.engagement_save_rules(%L, 1, 15, 15)$q$, :'org'), 'FORBIDDEN');
select test.check(jsonb_array_length(public.engagement_history(:'org', 'failed', 100)) >= 1, 'historial filtrado');
select test.check(jsonb_array_length(public.engagement_history(:'org', 'pending', 100)) >= 1, 'historial pendientes');
select test.login('00000000-0000-0000-0000-00000000000b');   -- profe
select test.expect_error(format($q$select public.engagement_admin_get(%L)$q$, :'org'), 'FORBIDDEN');
select test.expect_error(format($q$select public.engagement_at_risk(%L)$q$, :'org'), 'FORBIDDEN');
select test.check((select count(*) from public.engagement_notices) = 0, 'profe no ve la configuración');
select test.login('aaaaaaaa-0000-0000-0000-000000000001');   -- dueño
select public.engagement_save_notice(:'org', 'welcome', true, '¡Hola {nombre}!', 'Bienvenido a {gimnasio}');
select test.expect_error(format($q$select public.engagement_save_notice(%L, 'welcome', true, '', 'x')$q$, :'org'), 'NOTICE_SUBJECT_INVALID');
select test.expect_error(format($q$select public.engagement_save_notice(%L, 'otro', true, 'x', 'x')$q$, :'org'), 'NOTICE_NOT_FOUND');
select test.expect_error(format($q$select public.engagement_save_rules(%L, 8, 15, 15)$q$, :'org'), 'RULES_OUT_OF_RANGE');
select public.engagement_save_rules(:'org', 2, 15, 15);
select test.check((select subject from public.engagement_notices where org_id = :'org' and kind = 'welcome') = '¡Hola {nombre}!', 'el dueño edita el texto');
select test.expect_error(format($q$update public.engagement_notices set enabled = false where org_id = %L$q$, :'org'), 'permission denied');
reset role;

-- Otro gimnasio: configuración propia y sin acceso cruzado
insert into public.organizations (slug, name) values ('otro-gym-eng', 'Otro Gym') returning id as org2 \gset
select test.check((select count(*) from public.engagement_notices where org_id = :'org2') = 6
                  and exists (select 1 from public.engagement_settings where org_id = :'org2'), 'gimnasio nuevo con avisos sembrados');
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000a');
select test.expect_error(format($q$select public.engagement_admin_get(%L)$q$, :'org2'), 'FORBIDDEN');
select test.check((select count(*) from public.engagement_notices where org_id = :'org2') = 0, 'no ve la config de otro gimnasio');
reset role;
select test.ok('panel: recepción ve, solo dueño/automatizaciones edita, profe y otros gimnasios afuera');

-- ---------- En riesgo de abandonar ----------
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select test.eng_member('Bajon', 'bajon@test.com', now() + interval '20 days') as m_drop \gset
update public.members set created_at = now() - interval '60 days' where id = :'m_drop';
insert into public.checkins (org_id, location_id, member_id, method, allowed, created_at)
select :'org', :'loc', :'m_drop', 'manual', true, now() - make_interval(days => d) from unnest(array[3, 16, 19, 22, 26, 30, 35]) d;
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000a');
select public.engagement_at_risk(:'org', 300) as risk \gset
select test.check(exists (select 1 from jsonb_array_elements(:'risk'::jsonb) e where e ->> 'member_id' = :'m_i14' and e ->> 'reason' = 'away'
                          and (e ->> 'days_away')::int = 15), 'en riesgo: 15 días sin venir');
select test.check(exists (select 1 from jsonb_array_elements(:'risk'::jsonb) e where e ->> 'member_id' = :'m_drop' and e ->> 'reason' = 'dropped'),
  'en riesgo: bajó la frecuencia');
select test.check(not exists (select 1 from jsonb_array_elements(:'risk'::jsonb) e where e ->> 'member_id' = :'m_v3'), 'socio nuevo no figura');
select public.engagement_mark_contacted(:'m_i14');
select test.check(not exists (select 1 from jsonb_array_elements(public.engagement_at_risk(:'org', 300)) e where e ->> 'member_id' = :'m_i14'),
  'contactado sale de la lista');
reset role;
update public.engagement_contacts set contacted_at = now() - interval '15 days' where member_id = :'m_i14';
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000a');
select test.check(exists (select 1 from jsonb_array_elements(public.engagement_at_risk(:'org', 300)) e where e ->> 'member_id' = :'m_i14'),
  'a los 14 días vuelve a la lista');
select test.login('00000000-0000-0000-0000-00000000000b');
select test.expect_error(format($q$select public.engagement_mark_contacted(%L)$q$, :'m_i14'), 'FORBIDDEN');
reset role;
select test.ok('en riesgo: ausencia, caída de frecuencia, contactado 14 días');

-- ---------- Referidos ----------
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select test.eng_member('Referente', 'ref@test.com', now() + interval '20 days', 'eeeeeeee-0000-0000-0000-000000000001') as m_ref \gset
select test.eng_member('Nuevo', 'nuevo@test.com', null) as m_new \gset
select test.eng_member('Viejo', 'viejo@test.com', null) as m_old \gset
update public.members set created_at = now() - interval '90 days' where id = :'m_old';
select test.eng_end(:'m_ref') as ref_end0 \gset

set role authenticated;
select test.login('eeeeeeee-0000-0000-0000-000000000001');
select public.member_engagement(:'m_ref') ->> 'referral' as refj \gset
select :'refj'::jsonb ->> 'code' as code \gset
select test.check(:'code' ~ '^REFERENT[0-9]{4}$', 'código personal: ' || :'code');
select test.check(public.member_engagement(:'m_ref') -> 'referral' ->> 'code' = :'code', 'el código no cambia');
select test.expect_error(format($q$select public.referral_apply(%L, %L)$q$, :'m_new', :'code'), 'FORBIDDEN');
select test.expect_error(format($q$select public.member_engagement(%L)$q$, :'m_new'), 'FORBIDDEN');
select test.login('00000000-0000-0000-0000-00000000000a');   -- recepción registra el referido
select test.expect_error(format($q$select public.referral_apply(%L, 'NOEXISTE1')$q$, :'m_new'), 'REFERRAL_CODE_NOT_FOUND');
select test.expect_error(format($q$select public.referral_apply(%L, %L)$q$, :'m_ref', :'code'), 'REFERRAL_SELF');
select test.expect_error(format($q$select public.referral_apply(%L, %L)$q$, :'m_old', :'code'), 'REFERRAL_NOT_NEW');
select test.check(not (public.referral_apply(:'m_new', 'https://evolutiongym.fitness/evolution/padron?ref=' || lower(:'code')) ->> 'rewarded')::boolean,
  'referido registrado (acepta el link y minúsculas)');
select test.expect_error(format($q$select public.referral_apply(%L, %L)$q$, :'m_new', :'code'), 'REFERRAL_ALREADY');
select test.check(test.eng_end(:'m_ref') = :'ref_end0'::timestamptz, 'sin pago todavía no hay premio');
-- Primer pago del nuevo → los dos suman 15 días
select public.record_payment(:'m_new', 3000000, 'cash', :'plan', null, true) as pay1 \gset
select test.check(test.eng_end(:'m_new') = (:'pay1'::jsonb ->> 'period_end')::timestamptz + interval '15 days', 'nuevo: plan + 15 días');
select test.check(test.eng_end(:'m_ref') = :'ref_end0'::timestamptz + interval '15 days', 'referente: + 15 días');
select test.eng_end(:'m_new') as new_end1 \gset
-- Segundo pago: no se acredita de nuevo
select public.record_payment(:'m_new', 3000000, 'cash', :'plan', null, true) as pay2 \gset
select test.check(test.eng_end(:'m_ref') = :'ref_end0'::timestamptz + interval '15 days', 'referente: una sola vez');
select test.check(test.eng_end(:'m_new') = (:'new_end1'::timestamptz + interval '1 month'), 'nuevo: el segundo pago solo renueva');
reset role;
select test.check((select count(*) from public.member_rewards r join public.referrals f on f.id::text = r.ref_key
                    where f.referred_member_id = :'m_new' and r.status = 'applied') = 2, 'dos premios aplicados');
select test.check((select status from public.referrals where referred_member_id = :'m_new') = 'rewarded', 'referido acreditado');
set role authenticated;
select test.login('eeeeeeee-0000-0000-0000-000000000001');
select public.member_engagement(:'m_ref') -> 'referral' as refj2 \gset
select test.check((:'refj2'::jsonb ->> 'days_earned')::int = 15 and jsonb_array_length(:'refj2'::jsonb -> 'list') = 1
                  and :'refj2'::jsonb -> 'list' -> 0 ->> 'name' = 'Nuevo E.', 'el socio ve sus referidos y días ganados');
select test.check((select count(*) from public.referrals) = 1, 'el socio ve solo sus referidos');
reset role;

-- Referente sin plan vigente: el premio queda pendiente hasta que pague
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select test.eng_member('SinPlanRef', 'sinplan.ref@test.com', null) as m_ref2 \gset
select test.eng_member('Nuevo2', 'nuevo2@test.com', null) as m_new2 \gset
select private.referral_code_for(:'m_ref2') as code2 \gset
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000a');
select public.record_payment(:'m_new2', 3000000, 'cash', :'plan', null, true) as pay3 \gset
select test.check((public.referral_apply(:'m_new2', :'code2') ->> 'rewarded')::boolean, 'si ya había pagado se acredita al registrarlo');
select test.check(test.eng_end(:'m_new2') = (:'pay3'::jsonb ->> 'period_end')::timestamptz + interval '15 days', 'nuevo2: + 15 días');
reset role;
select test.check((select status from public.member_rewards where member_id = :'m_ref2' and kind = 'referral_by') = 'pending', 'referente sin plan: pendiente');
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000a');
select public.record_payment(:'m_ref2', 3000000, 'cash', :'plan', null, true) as pay4 \gset
select test.check(test.eng_end(:'m_ref2') = private.org_midnight(:'org') + interval '1 month' + interval '15 days', 'pendiente aplicado al pagar');
reset role;
select test.check((select status from public.member_rewards where member_id = :'m_ref2' and kind = 'referral_by') = 'applied', 'premio aplicado');
select test.ok('referidos: código personal, registro por recepción, premio a los dos una sola vez al primer pago, pendiente si no tiene plan');

-- ---------- Congelamiento por vacaciones ----------
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select test.eng_member('Titular', 'titular@test.com', now() + interval '30 days', 'eeeeeeee-0000-0000-0000-000000000002') as m_pay \gset
select test.eng_member('HijoTitular', null, null) as m_kid \gset
update public.members set billing_account_id = (select billing_account_id from public.members where id = :'m_pay') where id = :'m_kid';
insert into public.membership_plans (org_id, name, kind, price_cents, currency, billing_interval, includes_open_gym, max_members)
values (:'org', 'Eng Familiar', 'recurring', 5000000, 'ARS', 'month', true, 3) returning id as plan_fam \gset
update public.memberships set plan_id = :'plan_fam'
 where id = (select membership_id from public.membership_members where member_id = :'m_pay');
insert into public.membership_members (membership_id, member_id, org_id)
select mm.membership_id, :'m_kid', :'org' from public.membership_members mm where mm.member_id = :'m_pay';
select mm.membership_id as ms_pay from public.membership_members mm where mm.member_id = :'m_pay' \gset
select test.eng_end(:'m_pay') as pay_end0 \gset

set role authenticated;
select test.login('eeeeeeee-0000-0000-0000-000000000001');   -- otro socio
select test.expect_error(format($q$select public.member_freeze_create(%L, %L, 7)$q$, :'m_pay', :'today'), 'FORBIDDEN');
select test.login('eeeeeeee-0000-0000-0000-000000000002');   -- titular
select test.check((public.member_engagement(:'m_kid') -> 'freeze' ->> 'can_request')::boolean, 'el titular puede congelar (también desde un hijo)');
select test.expect_error(format($q$select public.member_freeze_create(%L, %L, 5)$q$, :'m_pay', :'today'), 'FREEZE_MIN_DAYS');
select test.expect_error(format($q$select public.member_freeze_create(%L, %L, 7)$q$, :'m_pay', (:'today'::date - 1)), 'FREEZE_BAD_START');
select test.expect_error(format($q$select public.member_freeze_create(%L, %L, 7)$q$, :'m_pay', (:'today'::date + 45)), 'FREEZE_AFTER_PERIOD_END');
select public.member_freeze_create(:'m_pay', :'today'::date + 10, 8) as fz1 \gset
select test.check(test.eng_end(:'m_pay') = :'pay_end0'::timestamptz + interval '8 days', 'congelar extiende el vencimiento');
select test.check((select status from public.memberships where id = :'ms_pay') = 'active', 'futuro: sigue activo hasta la fecha');
select test.expect_error(format($q$select public.member_freeze_create(%L, %L, 7)$q$, :'m_pay', (:'today'::date + 12)), 'FREEZE_OVERLAP');
select test.expect_error(format($q$select public.member_freeze_create(%L, %L, 8)$q$, :'m_pay', (:'today'::date + 20)), 'FREEZE_LIMIT');
select public.member_freeze_create(:'m_pay', :'today', 7) as fz2 \gset
select test.check((select status from public.memberships where id = :'ms_pay') = 'paused'
                  and (select paused_until from public.memberships where id = :'ms_pay') = private.org_midnight(:'org', :'today'::date + 7),
  'desde hoy: plan pausado hasta la fecha');
select test.check(test.eng_end(:'m_pay') = :'pay_end0'::timestamptz + interval '15 days', 'vencimiento + 15 días');
select test.check((public.member_engagement(:'m_pay') -> 'freeze' ->> 'remaining')::int = 0, 'le quedan 0 días este año');
select test.expect_error(format($q$select public.member_freeze_cancel(%L)$q$, :'fz2'::jsonb ->> 'id'), 'FREEZE_NOT_CANCELABLE');
select public.member_freeze_cancel((:'fz1'::jsonb ->> 'id')::uuid);
select test.check(test.eng_end(:'m_pay') = :'pay_end0'::timestamptz + interval '7 days', 'cancelar un futuro devuelve el vencimiento');
select test.check((public.member_engagement(:'m_pay') -> 'freeze' ->> 'remaining')::int = 8, 'y devuelve los días del año');
select test.expect_error($q$insert into public.membership_freezes (org_id, membership_id, billing_account_id, starts_on, days)
  select org_id, membership_id, billing_account_id, starts_on, 1 from public.membership_freezes limit 1$q$, 'permission denied');
reset role;
-- El molinete lo trata como bloqueado mientras dura
select test.check(not private.member_gym_allowed(:'m_pay'), 'congelado: el molinete no abre');
-- Termina la pausa (simulamos que pasaron los 7 días)
update public.membership_freezes set starts_on = starts_on - 7 where id = (:'fz2'::jsonb ->> 'id')::uuid;
select public.engagement_freeze_tick() as t1 \gset
select test.check((select status from public.memberships where id = :'ms_pay') = 'active'
                  and (select paused_until from public.memberships where id = :'ms_pay') is null, 'al terminar vuelve a activo');
select test.check(private.member_gym_allowed(:'m_pay'), 'y el molinete abre');
select test.check((select status from public.membership_freezes where id = (:'fz2'::jsonb ->> 'id')::uuid) = 'done', 'congelamiento terminado');
-- Uno programado arranca solo cuando llega la fecha
set role authenticated;
select test.login('eeeeeeee-0000-0000-0000-000000000002');
select public.member_freeze_create(:'m_pay', :'today'::date + 5, 8) as fz3 \gset
reset role;
select public.engagement_freeze_tick() as t2 \gset
select test.check((select status from public.memberships where id = :'ms_pay') = 'active', 'antes de la fecha no se pausa');
update public.membership_freezes set starts_on = :'today' where id = (:'fz3'::jsonb ->> 'id')::uuid;
select public.engagement_freeze_tick() as t3 \gset
select test.check((select status from public.memberships where id = :'ms_pay') = 'paused', 'llegada la fecha se pausa solo');
select test.check(not private.member_gym_allowed(:'m_kid'), 'el hijo de la cuenta también queda congelado');
select test.ok('congelamiento: solo titular, mínimo 7, tope anual, sin superposición, extiende/devuelve vencimiento, pausa y reactiva');

-- ---------- Logros ----------
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select test.eng_member('Logros', 'logros@test.com', now() + interval '30 days', 'eeeeeeee-0000-0000-0000-000000000003') as m_ach \gset
insert into public.checkins (org_id, location_id, member_id, method, allowed, created_at)
select :'org', :'loc', :'m_ach', 'manual', true, private.org_midnight(:'org', :'today'::date - d) + interval '7 hours'
  from unnest(array[1, 8, 15]) d;
insert into public.checkins (org_id, location_id, member_id, method, allowed, created_at)   -- mismo día: cuenta una
values (:'org', :'loc', :'m_ach', 'manual', true, private.org_midnight(:'org', :'today'::date - 1) + interval '10 hours'),
       (:'org', :'loc', :'m_ach', 'manual', false, private.org_midnight(:'org', :'today'::date - 40) + interval '10 hours');
set role authenticated;
select test.login('eeeeeeee-0000-0000-0000-000000000003');
select public.member_achievements(:'m_ach') as ach \gset
select test.check((:'ach'::jsonb ->> 'total')::int = 3, 'total de días con entrada (rechazos no cuentan)');
select test.check((:'ach'::jsonb ->> 'early')::int = 3, 'madrugador: antes de las 8');
select test.check((:'ach'::jsonb ->> 'week_streak')::int = 3 and (:'ach'::jsonb ->> 'best_week_streak')::int = 3, 'racha de 3 semanas');
select test.login('eeeeeeee-0000-0000-0000-000000000001');
select test.expect_error(format($q$select public.member_achievements(%L)$q$, :'m_ach'), 'FORBIDDEN');
select test.login('00000000-0000-0000-0000-00000000000a');
select test.check((public.member_achievements(:'m_ach') ->> 'total')::int = 3, 'recepción también puede verlos');
reset role;
select test.ok('logros: entradas reales por día, madrugador, racha semanal, solo el socio/familia y staff');
\echo 'ENGAGEMENT: TODAS LAS PRUEBAS PASARON'
