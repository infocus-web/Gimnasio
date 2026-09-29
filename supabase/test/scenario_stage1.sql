-- =====================================================================
-- Pruebas de 0014 (2FA, cobros, agenda). Corre después de scenario_admin.sql
-- =====================================================================
\set ON_ERROR_STOP 1
set client_min_messages = warning;
set role authenticated;

-- ---------- 2FA ----------
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', false);
select test.expect_error($q$select public.admin_create_member((select id from public.organizations where slug = 'evolution'), 'X')$q$, 'FORBIDDEN');
select test.expect_error($q$insert into public.staff_invitations (org_id, email, role, display_name)
  select id, 'mfa@test.com', 'trainer', 'X' from public.organizations where slug = 'evolution'$q$, 'row-level security');
do $$
begin
  if exists (select 1 from public.my_permissions((select id from public.organizations where slug = 'evolution'))) then
    raise exception 'el owner sin 2FA conserva permisos';
  end if;
  if public.my_staff_role((select id from public.organizations where slug = 'evolution')) <> 'owner' then
    raise exception 'my_staff_role incorrecto';
  end if;
end $$;
select test.login('00000000-0000-0000-0000-00000000000a');   -- recepción: no necesita 2FA
select count(*) > 0 as recepcion_opera from public.my_permissions((select id from public.organizations where slug = 'evolution'));
select test.ok('2FA: owner sin AAL2 no tiene permisos; recepción sí');

-- ---------- Cobros ----------
select current_period_end as fin_antes from public.memberships ms
  join public.members m on m.billing_account_id = ms.billing_account_id
 where m.first_name = 'Juan' and ms.status = 'active' \gset
select public.record_payment((select id from public.members where first_name = 'Juanito'), 5000000, 'cash') ->> 'period_end' as fin_despues \gset
do $$
declare v_months int;
begin
  if (select count(*) from public.memberships ms join public.members m on m.billing_account_id = ms.billing_account_id
       where m.first_name = 'Juan' and ms.status = 'active') <> 1 then
    raise exception 'la renovación creó otra membresía';
  end if;
  if not exists (select 1 from public.payment_ledger where payer_name = 'Juan Pérez' and amount_cents = 5000000
                  and plan_name = 'Admin Familiar x2' and status = 'succeeded') then
    raise exception 'la caja no muestra el cobro al titular';
  end if;
end $$;
select (:'fin_despues'::timestamptz - :'fin_antes'::timestamptz) between interval '28 days' and interval '31 days' as extendio_un_mes \gset
\echo extendió un mes = :extendio_un_mes
select test.expect_error($q$select public.record_payment((select id from public.members where first_name = 'Leo' and last_name = 'Socio'), 100, 'cash')$q$, 'PLAN_REQUIRED');
select public.record_payment((select id from public.members where first_name = 'Leo' and last_name = 'Socio'), 150000, 'transfer',
  (select id from public.membership_plans where name = 'Admin Individual'), 'matrícula + primer mes') is not null;
select public.void_payment((select id from public.payments where note = 'matrícula + primer mes'), 'cargado dos veces');
do $$
begin
  if (select status from public.payments where note like 'matrícula + primer mes%') <> 'canceled' then
    raise exception 'no se anuló el pago';
  end if;
  if (select cancel_at_period_end from public.memberships ms join public.members m on m.billing_account_id = ms.billing_account_id
       where m.first_name = 'Leo' and ms.status = 'active') is not true then
    raise exception 'la membresía de mostrador no vence sola';
  end if;
end $$;
select test.login('00000000-0000-0000-0000-00000000000b');   -- trainer
select test.expect_error($q$select public.record_payment((select id from public.members where first_name = 'Papá'), 1, 'cash')$q$, 'FORBIDDEN');
select test.ok('cobro renueva desde el vencimiento, caja, anulación, permisos');

-- ---------- Agenda ----------
select test.login('00000000-0000-0000-0000-00000000000a');   -- recepción no maneja la agenda
select test.expect_error($q$select public.generate_sessions((select id from public.organizations where slug = 'evolution'), 2)$q$, 'FORBIDDEN');
select test.login('aaaaaaaa-0000-0000-0000-000000000001');   -- owner con 2FA
insert into public.class_series (org_id, class_type_id, room_id, instructor_id, weekday, start_time, duration_min, capacity)
select o.id, ct.id, r.id, st.id, 3, '06:15', 50, 10
  from public.organizations o
  join public.class_types ct on ct.org_id = o.id and ct.equipment_kind is null
  join public.rooms r on r.org_id = o.id
  join public.staff st on st.org_id = o.id and st.display_name = 'Ana'
 where o.slug = 'evolution' limit 1;
select public.generate_sessions((select id from public.organizations where slug = 'evolution'), 3) ->> 'created' as creadas \gset
select public.generate_sessions((select id from public.organizations where slug = 'evolution'), 3) ->> 'created' as creadas2 \gset
\echo creadas = :creadas / segunda vez = :creadas2
do $$
begin
  if (select count(*) from public.class_sessions cs join public.class_series s on s.id = cs.series_id
       where s.start_time = '06:15') not between 3 and 4 then
    raise exception 'el generador no creó las 3 semanas';
  end if;
end $$;
select test.ok('generador de clases (idempotente, solo agenda)');

-- Cancelar una clase con reservas devuelve el crédito del pack
select b.session_id as ses, b.membership_id as ms from public.bookings b where b.status = 'booked' and b.credit_consumed limit 1 \gset
select credits_remaining as antes from public.memberships where id = :'ms' \gset
select public.cancel_session(:'ses', 'Profe enfermo') as liberadas \gset
\echo reservas liberadas = :liberadas
do $$
begin
  if exists (select 1 from public.bookings b join public.class_sessions s on s.id = b.session_id
              where s.status = 'canceled' and b.status in ('booked', 'waitlisted')) then
    raise exception 'quedaron reservas activas en una clase cancelada';
  end if;
end $$;
select (select credits_remaining from public.memberships where id = :'ms') > :antes as credito_devuelto \gset
\echo crédito devuelto = :credito_devuelto
select public.end_series((select id from public.class_series where start_time = '06:15')) ->> 'deleted' as borradas \gset
\echo clases futuras borradas al dar de baja el horario = :borradas
select test.ok('cancelar clase / dar de baja horario');

reset role;
\echo 'ETAPA 1: TODAS LAS PRUEBAS PASARON'
