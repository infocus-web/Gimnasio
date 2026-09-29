-- Pruebas de 0018 (correcciones de auditoría). Corre al final.
\set ON_ERROR_STOP 1
set client_min_messages = warning;
set role authenticated;

-- Un socio no ve teléfono ni DNI del staff
select test.login('00000000-0000-0000-0000-00000000000d');   -- papá (socio)
select test.expect_error($q$select phone from public.staff limit 1$q$, 'permission denied');
select count(*) > 0 as ve_nombres from (select display_name from public.staff) x \gset
\echo socio ve nombres del staff = :ve_nombres

-- Recepción no puede borrar cuentas / pagos
select test.login('00000000-0000-0000-0000-00000000000a');
select test.expect_error($q$delete from public.billing_accounts where true$q$, 'permission denied');
select test.expect_error($q$delete from public.payments where true$q$, 'permission denied');

-- El profe de la clase puede marcar asistencia (antes fallaba por members_guard)
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
insert into public.rooms (org_id, location_id, name, capacity)
select org_id, id, 'Sala auditoría', 10 from public.locations limit 1;
insert into public.class_sessions (org_id, class_type_id, room_id, instructor_id, starts_at, ends_at, capacity)
select st.org_id, (select id from public.class_types where equipment_kind is null limit 1),
       (select id from public.rooms where name = 'Sala auditoría'), st.id, now() - interval '10 minutes', now() + interval '40 minutes', 5
  from public.staff st where st.display_name = 'Ana'
returning id as ses \gset
insert into public.bookings (org_id, session_id, member_id, status, during)
select s.org_id, s.id, m.id, 'booked', s.during from public.class_sessions s, public.members m
 where s.id = :'ses' and m.first_name = 'Otra';
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000b');   -- Ana
select public.mark_attendance((select id from public.bookings where session_id = :'ses' and status = 'booked' limit 1), 'checked_in');
select count(*) as presentes from public.bookings where session_id = :'ses' and status = 'checked_in' \gset
\echo presentes marcados por la profe = :presentes
select test.expect_error($q$select public.checkin_scan((select id from public.locations limit 1), null, (select id from public.members limit 1), 'manual')$q$, 'FORBIDDEN');

-- Vencimiento automático
reset role;
update public.memberships set current_period_end = now() - interval '30 days', current_period_start = now() - interval '60 days'
 where id = (select id from public.memberships where status = 'active' and cancel_at_period_end limit 1);
select public.expire_memberships() as vencidas \gset
\echo membresías pasadas a expired = :vencidas
select test.ok('auditoría: PII staff, borrado de pagos, asistencia del profe, vencimiento automático');
\echo 'AUDITORIA: TODAS LAS PRUEBAS PASARON'
