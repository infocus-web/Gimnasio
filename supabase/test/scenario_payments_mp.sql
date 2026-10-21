-- Pruebas de 0030 (pagos online con Mercado Pago, venta en mostrador, cierre de caja)
\set ON_ERROR_STOP 1
set client_min_messages = warning;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select id as org from public.organizations where slug = 'evolution' \gset

insert into auth.users (id, email) values ('cccccccc-0000-0000-0000-0000000000c1', 'mp.socio@test.com') on conflict do nothing;
insert into public.membership_plans (org_id, name, kind, price_cents, currency, billing_interval, includes_open_gym, max_members)
  values (:'org', 'Mensual MP', 'recurring', 3000000, 'ARS', 'month', true, 2) returning id as plan \gset
insert into public.membership_plans (org_id, name, kind, price_cents, currency, billing_interval, is_public)
  values (:'org', 'Plan privado MP', 'recurring', 1000000, 'ARS', 'month', false) returning id as priv \gset
insert into public.members (org_id, user_id, first_name, last_name, email, phone)
  values (:'org', 'cccccccc-0000-0000-0000-0000000000c1', 'Mp', 'Socio', 'mp.socio@test.com', '1155550000') returning id as mem \gset
insert into public.members (org_id, first_name, last_name) values (:'org', 'Mp', 'Hijo') returning id as kid \gset
insert into public.billing_accounts (org_id, payer_member_id) values (:'org', :'mem') returning id as ba \gset
update public.members set billing_account_id = :'ba' where id in (:'mem', :'kid');
insert into public.memberships (org_id, plan_id, billing_account_id, current_period_start, current_period_end, provider, cancel_at_period_end)
  values (:'org', :'plan', :'ba', now() - interval '20 days', now() + interval '10 days', 'cash', true) returning id as ms \gset
insert into public.membership_members (membership_id, member_id, org_id) values (:'ms', :'mem', :'org'), (:'ms', :'kid', :'org');
select current_period_end as end0 from public.memberships where id = :'ms' \gset

-- ---------- El socio crea su intención de pago ----------
set role authenticated;
select test.login('cccccccc-0000-0000-0000-0000000000c1');
select public.payment_intent_create(:'mem') as i1 \gset
select (:'i1'::jsonb ->> 'intent_id') as intent1 \gset
select test.check((:'i1'::jsonb ->> 'amount_cents')::bigint = 3000000 and :'i1'::jsonb ->> 'plan_name' = 'Mensual MP', 'intención con el plan vigente y su precio');
select public.payment_intent_set_preference(:'intent1', 'pref-1', 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-1');
select test.check((select count(*) from public.payment_intents where id = :'intent1' and source = 'member_app') = 1, 'el socio ve su intención');
select test.expect_error(format($q$select public.payment_intent_create(%L, %L)$q$, :'mem', :'priv'), 'PLAN_NOT_FOUND');
select public.member_payment_options(:'mem') as opts \gset
select test.check((:'opts'::jsonb ->> 'is_payer')::boolean and :'opts'::jsonb -> 'current' ->> 'name' = 'Mensual MP', 'opciones: titular con su plan');
select test.check(not exists (select 1 from jsonb_array_elements(:'opts'::jsonb -> 'plans') e where e ->> 'name' = 'Plan privado MP'), 'opciones: sin planes privados ajenos');
select test.expect_error(format($q$select public.member_payment_options(%L)$q$, :'kid'), 'FORBIDDEN');
select test.expect_error(format($q$select public.payment_intent_create(%L)$q$, :'kid'), 'FORBIDDEN');
select test.expect_error(format($q$select public.payment_intent_set_preference(%L, 'x', 'http://malo')$q$, :'intent1'), 'INVALID_URL');
-- el socio no puede liquidar su propio pago
select test.expect_error(format($q$select public.payment_intent_settle(%L, '999', 'approved', 'accredited', 3000000)$q$, :'intent1'), 'permission denied');
select test.expect_error(format($q$select private.record_payment_core(%L, 1, 'cash', null, null, false)$q$, :'mem'), 'permission denied');

-- otro socio no puede pagar por él ni ver su intención
select test.login('00000000-0000-0000-0000-00000000000d');
select test.expect_error(format($q$select public.payment_intent_create(%L)$q$, :'mem'), 'FORBIDDEN');
select test.check((select count(*) from public.payment_intents where id = :'intent1') = 0, 'otro socio no ve la intención');
-- el profe no
select test.login('00000000-0000-0000-0000-00000000000b');
select test.expect_error(format($q$select public.payment_intent_create(%L)$q$, :'mem'), 'FORBIDDEN');
-- recepción sí (link por WhatsApp), aunque opere desde la ficha del hijo: se cobra al titular
select test.login('00000000-0000-0000-0000-00000000000a');
select public.payment_intent_create(:'kid') as i2 \gset
select test.check(:'i2'::jsonb ->> 'payer_id' = :'mem', 'el link de pago va a la cuenta del titular');
select test.check((select source from public.payment_intents where id = (:'i2'::jsonb ->> 'intent_id')::uuid) = 'admin_link', 'origen: link del panel');
reset role;
select test.ok('intenciones de pago: socio titular, recepción y permisos');

-- ---------- Webhook: pago aprobado dos veces = un cobro y una renovación ----------
set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false) \g /dev/null
select public.payment_intent_settle(:'intent1', '111', 'approved', 'accredited', 3000000) as s1 \gset
select test.check(:'s1'::jsonb ->> 'status' = 'approved' and not (:'s1'::jsonb ->> 'duplicate')::boolean, 'primer aviso: aprobado');
select public.payment_intent_settle(:'intent1', '111', 'approved', 'accredited', 3000000) as s2 \gset
select test.check((:'s2'::jsonb ->> 'duplicate')::boolean, 'segundo aviso: duplicado');
reset role;
select test.check((select count(*) from public.payments where provider = 'mercadopago' and provider_payment_id = '111') = 1, 'un solo pago registrado');
select test.check((select current_period_end from public.memberships where id = :'ms') = :'end0'::timestamptz + interval '1 month', 'una sola renovación (desde el vencimiento)');
select test.check((select status from public.memberships where id = :'ms') = 'active', 'plan activo');
select test.check((select recorded_by is null and status = 'succeeded' from public.payments where provider_payment_id = '111'), 'pago online sin cajero');
select test.check((select status = 'approved' and payment_id is not null from public.payment_intents where id = :'intent1'), 'intención aprobada');
-- otro pago aprobado para el mismo link: no renueva de nuevo, queda a revisar
set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false) \g /dev/null
select test.check(public.payment_intent_settle(:'intent1', '112', 'approved', 'accredited', 3000000) ->> 'status' = 'review', 'segundo pago del mismo link: a revisar');
-- un aviso viejo "pendiente" no pisa el aprobado
select test.check((public.payment_intent_settle(:'intent1', '111', 'in_process', 'pending', 3000000) ->> 'status') = 'approved', 'estado viejo no pisa el aprobado');
reset role;
select test.check((select current_period_end from public.memberships where id = :'ms') = :'end0'::timestamptz + interval '1 month', 'sigue una sola renovación');

-- ---------- Rechazado: no renueva, evento payment.failed, no queda moroso ----------
set role authenticated;
select test.login('cccccccc-0000-0000-0000-0000000000c1');
select public.payment_intent_create(:'mem') ->> 'intent_id' as intent3 \gset
reset role;
set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false) \g /dev/null
select test.check(public.payment_intent_settle(:'intent3', '200', 'rejected', 'cc_rejected_insufficient_amount', 3000000) ->> 'status' = 'rejected', 'rechazado');
select test.check(public.payment_intent_settle(:'intent3', '200', 'rejected', 'cc_rejected_insufficient_amount', 3000000) ->> 'status' = 'rejected', 'rechazado repetido');
reset role;
select test.check((select current_period_end from public.memberships where id = :'ms') = :'end0'::timestamptz + interval '1 month', 'rechazado no renueva');
select test.check((select count(*) from public.domain_events where type = 'payment.failed' and payload ->> 'intent_id' = :'intent3') = 1, 'un evento payment.failed');
select test.check(not (select delinquent from public.billing_accounts where id = :'ba'), 'un intento rechazado no marca moroso');
select test.check((select count(*) from public.payments where provider_payment_id = '200') = 0, 'sin pago por el rechazo');
-- Monto menor al esperado: a revisar, sin renovar
set role authenticated;
select test.login('cccccccc-0000-0000-0000-0000000000c1');
select public.payment_intent_create(:'mem') ->> 'intent_id' as intent4 \gset
reset role;
set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false) \g /dev/null
select test.check(public.payment_intent_settle(:'intent4', '300', 'approved', 'accredited', 100) ->> 'reason' = 'AMOUNT_MISMATCH', 'monto distinto: a revisar');
reset role;
select test.check((select count(*) from public.payments where provider_payment_id = '300') = 0, 'monto distinto no registra cobro');
-- Devolución
set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false) \g /dev/null
select public.payment_intent_settle(:'intent1', '111', 'refunded', 'refunded', 3000000) as rf1 \gset
reset role;
select test.check((select status from public.payments where provider_payment_id = '111') = 'refunded', 'devolución marca el pago');
select test.check(:'rf1'::jsonb ->> 'action' = 'period_rolled_back', 'devolución: se deshace la renovación');
select test.check((select current_period_end from public.memberships where id = :'ms') = :'end0'::timestamptz, 'devolución: vuelve al vencimiento anterior');
select test.check((select status from public.memberships where id = :'ms') = 'active' and not (select delinquent from public.billing_accounts where id = :'ba'),
                  'devolución deshecha: sigue activo con su vencimiento y sin deuda');
select test.check((select status = 'refunded' and result -> 'refund' ->> 'action' = 'period_rolled_back' from public.payment_intents where id = :'intent1'),
                  'intención devuelta con explicación');
select test.check((select count(*) from public.domain_events where type = 'payment.refunded' and payload ->> 'intent_id' = :'intent1'
                     and payload ->> 'action' = 'period_rolled_back') = 1, 'evento payment.refunded');
-- aviso repetido de la devolución: no descuenta dos veces
set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false) \g /dev/null
select public.payment_intent_settle(:'intent1', '111', 'refunded', 'refunded', 3000000) \g /dev/null
reset role;
select test.check((select current_period_end from public.memberships where id = :'ms') = :'end0'::timestamptz, 'devolución repetida no descuenta de nuevo');

-- Contracargo de un pago cuando después hubo otro cobro: no se puede deshacer seguro → cuenta morosa
set role authenticated;
select test.login('cccccccc-0000-0000-0000-0000000000c1');
select public.payment_intent_create(:'mem') ->> 'intent_id' as intent5 \gset
reset role;
set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false) \g /dev/null
select public.payment_intent_settle(:'intent5', '600', 'approved', 'accredited', 3000000) \g /dev/null
reset role;
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000a');   -- recepción cobra otro mes en efectivo
select public.record_payment(:'mem', 3000000, 'cash', null, 'otro mes', true) \g /dev/null
reset role;
select current_period_end as end2 from public.memberships where id = :'ms' \gset
set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false) \g /dev/null
select test.check(public.payment_intent_settle(:'intent5', '600', 'charged_back', 'reimbursed', 3000000) ->> 'action' = 'account_blocked',
                  'contracargo con cambios posteriores: cuenta bloqueada');
reset role;
select test.check((select delinquent from public.billing_accounts where id = :'ba'), 'cuenta morosa');
select test.check(not private.member_gym_allowed(:'mem'), 'el molinete no lo deja pasar');
select test.check((select current_period_end from public.memberships where id = :'ms') = :'end2'::timestamptz, 'no toca el vencimiento si no es seguro');
select test.check((select result -> 'refund' ->> 'mp_status' = 'charged_back' from public.payment_intents where id = :'intent5'), 'contracargo registrado');
update public.billing_accounts set delinquent = false where id = :'ba';
select test.ok('webhook MP: idempotente, rechazos, montos y devoluciones');

-- ---------- Congelamiento activo + renovación: sigue congelado ----------
insert into public.members (org_id, first_name, last_name) values (:'org', 'Fz', 'Socio') returning id as fz \gset
insert into public.billing_accounts (org_id, payer_member_id) values (:'org', :'fz') returning id as fzba \gset
update public.members set billing_account_id = :'fzba' where id = :'fz';
insert into public.memberships (org_id, plan_id, billing_account_id, status, current_period_start, current_period_end, paused_until, provider, cancel_at_period_end)
  values (:'org', :'plan', :'fzba', 'paused', now() - interval '20 days', now() + interval '20 days', now() + interval '8 days', 'cash', true)
  returning id as fzms, paused_until as fzpu, current_period_end as fzend \gset
insert into public.membership_members (membership_id, member_id, org_id) values (:'fzms', :'fz', :'org');
insert into public.membership_freezes (org_id, membership_id, billing_account_id, member_id, starts_on, days, status, prev_status)
  values (:'org', :'fzms', :'fzba', :'fz', current_date - 2, 10, 'active', 'active') returning id as frz \gset
-- cobro manual en recepción
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000a');
select public.record_payment(:'fz', 3000000, 'cash', null, null, true) \g /dev/null
reset role;
select test.check((select status = 'paused' and paused_until = :'fzpu'::timestamptz and current_period_end = :'fzend'::timestamptz + interval '1 month'
                     from public.memberships where id = :'fzms'), 'cobro manual durante el congelamiento: sigue pausado y extiende');
select test.check(not private.member_gym_allowed(:'fz'), 'congelado: el molinete no lo deja pasar aunque pagó');
-- pago online (record_payment_core)
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000a');
select public.payment_intent_create(:'fz') ->> 'intent_id' as fzi \gset
reset role;
set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false) \g /dev/null
select public.payment_intent_settle(:'fzi', '700', 'approved', 'accredited', 3000000) \g /dev/null
reset role;
select test.check((select status = 'paused' and paused_until = :'fzpu'::timestamptz and current_period_end = :'fzend'::timestamptz + interval '2 months'
                     from public.memberships where id = :'fzms'), 'pago online durante el congelamiento: sigue pausado y extiende');
-- termina el congelamiento: vuelve a activo con todo el período pago
update public.membership_freezes set starts_on = current_date - 12 where id = :'frz';
select set_config('request.jwt.claims', '{"role":"service_role"}', false) \g /dev/null
select public.engagement_freeze_tick() \g /dev/null
select test.check((select status = 'active' and paused_until is null and current_period_end = :'fzend'::timestamptz + interval '2 months'
                     from public.memberships where id = :'fzms'), 'fin del congelamiento: activo y conserva lo pagado');
select test.ok('congelamiento + renovación: el pago no corta la pausa ni pierde días');

-- ---------- Productos y ventas ----------
set role authenticated;
select test.login('aaaaaaaa-0000-0000-0000-000000000001');   -- dueño
insert into public.products (org_id, name, price_cents, stock) values (:'org', 'Agua 500ml', 150000, 3) returning id as agua \gset
insert into public.products (org_id, name, price_cents) values (:'org', 'Toalla alquiler', 50000) returning id as toalla \gset
select test.login('00000000-0000-0000-0000-00000000000b');   -- profe: no ve ni vende
select test.check((select count(*) from public.products where org_id = :'org') = 0, 'el profe no ve productos');
select test.expect_error(format($q$insert into public.products (org_id, name, price_cents) values (%L, 'X', 1)$q$, :'org'), 'row-level security');
select test.expect_error(format($q$select public.record_sale(%L, '[{"product_id":"%s","quantity":1}]', 'cash')$q$, :'org', :'agua'), 'FORBIDDEN');
select test.login('00000000-0000-0000-0000-00000000000d');   -- socio
select test.check((select count(*) from public.products) = 0, 'el socio no ve productos');

select test.login('00000000-0000-0000-0000-00000000000a');   -- recepción
-- cierra lo que cobró en escenarios anteriores: el turno de esta prueba arranca limpio
select public.cash_close_shift(:'org', 0, 'cierre previo a la prueba') \g /dev/null
select public.record_sale(:'org', format('[{"product_id":"%s","quantity":2},{"product_id":"%s","quantity":1}]', :'agua', :'toalla')::jsonb, 'cash', :'mem') as sale1 \gset
select test.check((:'sale1'::jsonb ->> 'total_cents')::bigint = 350000, 'total de la venta');
select test.check((select stock from public.products where id = :'agua') = 1, 'descuenta stock');
select test.expect_error(format($q$select public.record_sale(%L, '[{"product_id":"%s","quantity":2}]', 'cash')$q$, :'org', :'agua'), 'OUT_OF_STOCK');
select test.check((select stock from public.products where id = :'agua') = 1, 'sin stock negativo');
select test.check((select count(*) from public.sales where org_id = :'org') = 1, 'la venta fallida no quedó');
select test.expect_error(format($q$select public.record_sale(%L, '[]', 'cash')$q$, :'org'), 'EMPTY_SALE');
select test.expect_error(format($q$select public.record_sale(%L, '[{"product_id":"%s","quantity":0}]', 'cash')$q$, :'org', :'toalla'), 'INVALID_QUANTITY');
select public.record_sale(:'org', format('[{"product_id":"%s","quantity":4}]', :'toalla')::jsonb, 'transfer') ->> 'sale_id' as sale2 \gset
select test.check((select items_summary from public.sale_ledger where id = :'sale2') = '4× Toalla alquiler', 'resumen de la venta en caja');
-- anular devuelve stock
select public.record_sale(:'org', format('[{"product_id":"%s","quantity":1}]', :'agua')::jsonb, 'cash') ->> 'sale_id' as sale3 \gset
select test.check((select stock from public.products where id = :'agua') = 0, 'stock en cero');
select public.void_sale(:'sale3', 'error');
select test.check((select stock from public.products where id = :'agua') = 1, 'anular devuelve stock');
select test.expect_error(format($q$select public.void_sale(%L, 'otra vez')$q$, :'sale3'), 'SALE_NOT_VOIDABLE');
reset role;
select test.ok('venta en mostrador: stock, permisos, anulación');

-- ---------- Cierre de caja por turno ----------
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000a');   -- recepción cobra una cuota en efectivo
select public.record_payment(:'mem', 2000000, 'cash', null, null, false);
select public.record_payment(:'mem', 500000, 'card_terminal', null, null, false);
select test.login('aaaaaaaa-0000-0000-0000-000000000001');   -- el dueño cobra otra: no va al turno de recepción
select public.record_payment(:'mem', 999900, 'cash', null, null, false);

select test.login('00000000-0000-0000-0000-00000000000a');
select public.cash_shift_summary(:'org') as sum1 \gset
select test.check((:'sum1'::jsonb -> 'totals' -> 'cash' ->> 'total')::bigint = 2000000 + 350000, 'efectivo: cuota + venta (sin lo del dueño ni la anulada)');
select test.check((:'sum1'::jsonb -> 'totals' -> 'cash' ->> 'sales')::bigint = 350000, 'efectivo: ventas separadas');
select test.check((:'sum1'::jsonb -> 'totals' -> 'transfer' ->> 'total')::bigint = 200000, 'transferencia: venta');
select test.check((:'sum1'::jsonb -> 'totals' -> 'card_terminal' ->> 'total')::bigint = 500000, 'tarjeta: cuota');
select test.check(:'sum1'::jsonb -> 'totals' -> 'mercadopago' is null, 'los pagos online no son de nadie');
select public.cash_close_shift(:'org', 2340000, 'faltan 100', (:'sum1'::jsonb ->> 'to')::timestamptz) as c1 \gset
select test.check((:'c1'::jsonb ->> 'difference_cents')::bigint = -10000, 'diferencia contado vs esperado');
select test.check((:'c1'::jsonb ->> 'total_cents')::bigint = 2350000 + 200000 + 500000, 'total del turno');
select test.check(public.cash_shift_summary(:'org') -> 'totals' = '{}'::jsonb, 'después del cierre arranca de cero');
select test.expect_error(format($q$select public.cash_close_shift(%L, -1)$q$, :'org'), 'INVALID_AMOUNT');
select test.check((select count(*) from public.cash_closures where org_id = :'org') = 2, 'recepción ve sus cierres');

select test.login('aaaaaaaa-0000-0000-0000-000000000001');
select test.check((select expected_cash_cents from public.cash_closures where org_id = :'org' and staff_name = 'Recepción' and note = 'faltan 100') = 2350000, 'el dueño ve el historial');
select test.check((public.cash_shift_summary(:'org') -> 'totals' -> 'cash' ->> 'total')::bigint = 999900, 'turno del dueño separado');
select test.login('00000000-0000-0000-0000-00000000000b');
select test.check((select count(*) from public.cash_closures) = 0, 'el profe no ve cierres');
select test.expect_error(format($q$select public.cash_shift_summary(%L)$q$, :'org'), 'FORBIDDEN');
select test.login('cccccccc-0000-0000-0000-0000000000c1');
select test.check((select count(*) from public.cash_closures) = 0 and (select count(*) from public.sales) = 0, 'el socio no ve caja ni ventas');
select test.expect_error($q$insert into public.cash_closures (org_id, staff_user_id, period_from, period_to, counted_cash_cents, difference_cents)
  values ((select id from public.organizations limit 1), auth.uid(), now(), now(), 0, 0)$q$, 'permission denied');
reset role;
select test.ok('cierre de caja: por persona y medio de pago, diferencia, permisos');

-- ---------- Pase de un día comprado en la web ----------
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false) \g /dev/null
select test.check(not (public.public_day_pass_offer('evolution') ->> 'enabled')::boolean, 'pase online apagado por defecto');
select test.expect_error($q$select public.payment_intent_create_day_pass('evolution', 'Turista', 'turista@test.com')$q$, 'DAY_PASS_NOT_FOR_SALE');
reset role;
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000b');   -- el profe no configura
select test.expect_error(format($q$insert into public.online_sale_settings (org_id, day_pass_enabled, day_pass_price_cents) values (%L, true, 500000)$q$, :'org'), 'row-level security');
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.online_sale_settings (org_id, day_pass_enabled, day_pass_price_cents, day_pass_days, day_pass_entries)
  values (:'org', true, 500000, 1, 1);
reset role;
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false) \g /dev/null
select test.check((public.public_day_pass_offer('evolution') ->> 'price_cents')::bigint = 500000, 'oferta pública con precio');
select test.expect_error($q$select public.payment_intent_create_day_pass('evolution', 'Turista', 'no-es-mail')$q$, 'EMAIL_INVALID');
select public.payment_intent_create_day_pass('evolution', 'Turista Prueba', 'Turista@Test.com', '11 5555-1111', '30.123.456') ->> 'intent_id' as dp \gset
select test.expect_error($q$select count(*) from public.payment_intents$q$, 'permission denied');
reset role;
set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false) \g /dev/null
select public.payment_intent_settle(:'dp', '500', 'approved', 'accredited', 500000) as dps \gset
select test.check(:'dps'::jsonb -> 'result' ->> 'code' ~ '^[A-Z0-9]{6,12}$', 'pase emitido con código');
select test.check((public.payment_intent_settle(:'dp', '500', 'approved', 'accredited', 500000) ->> 'duplicate')::boolean, 'segundo aviso no emite otro pase');
reset role;
select test.check((select count(*) from public.day_passes where holder_email = 'turista@test.com') = 1, 'un solo pase');
select test.check((select price_cents = 500000 and payment_method = 'mercadopago' and holder_document = '30123456'
                     from public.day_passes where holder_email = 'turista@test.com'), 'pase con precio, medio y DNI');
select test.check((select day_pass_id is not null from public.payment_intents where id = :'dp'), 'intención vinculada al pase');
-- Devolución del pase: queda anulado
set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false) \g /dev/null
select test.check(public.payment_intent_settle(:'dp', '500', 'refunded', 'refunded', 500000) ->> 'action' = 'pass_revoked', 'devolución del pase');
reset role;
select test.check((select d.revoked_at is not null from public.day_passes d join public.payment_intents i on i.day_pass_id = d.id where i.id = :'dp'),
                  'pase devuelto queda anulado');
select test.check((select status = 'refunded' and result -> 'refund' ->> 'action' = 'pass_revoked' from public.payment_intents where id = :'dp'),
                  'intención del pase devuelta');
-- Tope por gimnasio: 30 compras web abiertas en 10 minutos (aunque cambien el email)
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false) \g /dev/null
do $$ begin
  for i in 1..30 loop
    perform public.payment_intent_create_day_pass('evolution', 'Comprador ' || i, 'comprador' || i || '@test.com');
  end loop;
end $$;
select test.expect_error($q$select public.payment_intent_create_day_pass('evolution', 'Uno Más', 'unomas@test.com')$q$, 'DAY_PASS_BUSY');
reset role;
update public.payment_intents set created_at = now() - interval '11 minutes' where source = 'public' and buyer_email like 'comprador%@test.com';
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false) \g /dev/null
select test.check(public.payment_intent_create_day_pass('evolution', 'Uno Más', 'unomas@test.com') ->> 'intent_id' is not null,
                  'pasados 10 minutos se puede comprar de nuevo');
reset role;
delete from public.payment_intents where source = 'public' and (buyer_email like 'comprador%@test.com' or buyer_email = 'unomas@test.com');
select test.ok('pase de un día online: oferta, compra, emisión única, devolución anula, tope por gimnasio');
\echo 'PAGOS Y CAJA: TODAS LAS PRUEBAS PASARON'
