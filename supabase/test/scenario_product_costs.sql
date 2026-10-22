-- Pruebas de 0033 (costo y ganancia de productos: solo dueño/administrador). Corre después de scenario_payments_mp.sql.
\set ON_ERROR_STOP 1
set client_min_messages = warning;
select id as org from public.organizations where slug = 'evolution' \gset

-- ---------- Datos: un administrador (además del dueño) ----------
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'admin.costos@test.com') on conflict do nothing;
select test.login('aaaaaaaa-0000-0000-0000-000000000001');   -- lo da de alta el dueño
insert into public.staff (org_id, user_id, role, display_name)
values (:'org', '00000000-0000-0000-0000-0000000000a1', 'admin', 'Admin costos') on conflict do nothing;

set role authenticated;
select test.login('aaaaaaaa-0000-0000-0000-000000000001');   -- dueño
insert into public.products (org_id, name, price_cents) values (:'org', 'Agua costos', 150000) returning id as agua \gset
insert into public.products (org_id, name, price_cents) values (:'org', 'Barrita costos', 100000) returning id as barra \gset
insert into public.product_costs (product_id, org_id, cost_cents) values (:'agua', :'org', 80000);

-- ---------- Nadie más que dueño/admin ve o carga costos ----------
select test.login('00000000-0000-0000-0000-00000000000a');   -- recepción (tiene billing.read y billing.write)
select test.check((select count(*) from public.product_costs) = 0, 'recepción no ve costos');
select test.expect_error(format($q$insert into public.product_costs (product_id, org_id, cost_cents) values (%L, %L, 1)$q$, :'barra', :'org'), 'row-level security');
select test.expect_error(format($q$select * from public.product_profit_report(%L, current_date, current_date)$q$, :'org'), 'FORBIDDEN');
-- vende la barrita ANTES de que tenga costo, y 2 aguas (con costo)
select public.record_sale(:'org', format('[{"product_id":"%s","quantity":1}]', :'barra')::jsonb, 'cash') \g /dev/null
select public.record_sale(:'org', format('[{"product_id":"%s","quantity":2}]', :'agua')::jsonb, 'cash') ->> 'sale_id' as s_agua \gset
select test.check((select count(*) from public.sale_item_costs) = 0, 'recepción no ve el costo de lo vendido');

select test.login('00000000-0000-0000-0000-00000000000b');   -- profe
select test.check((select count(*) from public.product_costs) = 0, 'el profe no ve costos');
select test.expect_error(format($q$select * from public.product_profit_report(%L, current_date, current_date)$q$, :'org'), 'FORBIDDEN');
select test.login('00000000-0000-0000-0000-00000000000d');   -- socio
select test.check((select count(*) from public.product_costs) = 0, 'el socio no ve costos');

-- permiso suelto no alcanza: recepción con reports.read sigue sin ver
reset role;
insert into public.staff_permission_overrides (staff_id, permission, granted)
select id, 'reports.read', true from public.staff where org_id = :'org' and user_id = '00000000-0000-0000-0000-00000000000a';
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000a');
select test.expect_error(format($q$select * from public.product_profit_report(%L, current_date, current_date)$q$, :'org'), 'FORBIDDEN');
reset role;
delete from public.staff_permission_overrides where permission = 'reports.read'
   and staff_id in (select id from public.staff where org_id = :'org' and user_id = '00000000-0000-0000-0000-00000000000a');

-- ---------- El administrador sí; sin segundo factor, no ----------
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000a1', 'role', 'authenticated', 'aal', 'aal1')::text, false) \g /dev/null
select test.check((select count(*) from public.product_costs) = 0, 'admin sin segundo factor no ve costos');
select test.login('00000000-0000-0000-0000-0000000000a1');
select test.check((select cost_cents from public.product_costs where product_id = :'agua') = 80000, 'el admin ve el costo');
insert into public.product_costs (product_id, org_id, cost_cents) values (:'barra', :'org', 60000);

-- el costo de la venta quedó guardado al vender; subir el costo después no la cambia
update public.product_costs set cost_cents = 100000 where product_id = :'agua';
select test.check((select c.unit_cost_cents from public.sale_item_costs c join public.sale_items si on si.id = c.sale_item_id
                    where si.sale_id = :'s_agua') = 80000, 'la venta conserva el costo de ese momento');

-- 1 agua más con el costo nuevo, y una venta anulada que no cuenta
select test.login('00000000-0000-0000-0000-00000000000a');
select public.record_sale(:'org', format('[{"product_id":"%s","quantity":1}]', :'agua')::jsonb, 'cash') \g /dev/null
select public.record_sale(:'org', format('[{"product_id":"%s","quantity":5}]', :'agua')::jsonb, 'cash') ->> 'sale_id' as s_anul \gset
select public.void_sale(:'s_anul', 'error');

select test.login('00000000-0000-0000-0000-0000000000a1');
create temp table rep as select * from public.product_profit_report(:'org', current_date, current_date);
-- agua: 3 unidades · vendido 450.000 · costo 2×80.000 + 1×100.000 = 260.000 · ganancia 190.000
select test.check((select units = 3 and revenue_cents = 450000 and cost_cents = 260000 and profit_cents = 190000 and units_no_cost = 0
                     from rep where product_id = :'agua'), 'agua: unidades, venta, costo y ganancia (sin la anulada)');
-- barrita: vendida sin costo → no suma ganancia, queda aparte
select test.check((select units = 1 and revenue_cents = 100000 and cost_cents = 0 and profit_cents = 0
                          and units_no_cost = 1 and revenue_no_cost = 100000
                     from rep where product_id = :'barra'), 'barrita vendida sin costo queda aparte');
select test.expect_error(format($q$select * from public.product_profit_report(%L, current_date, current_date - 1)$q$, :'org'), 'INVALID_RANGE');

-- el dueño también ve el reporte
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
select test.check((select count(*) from public.product_profit_report(:'org', current_date, current_date)) >= 2, 'el dueño ve el reporte');
-- otro gimnasio no: el admin no ve costos ajenos (no hay filas de otra org en product_costs)
reset role;
select test.ok('costos y ganancias: solo dueño/admin, costo al vender, anuladas fuera, ventas sin costo aparte');
\echo 'COSTOS Y GANANCIAS: TODAS LAS PRUEBAS PASARON'
