-- =====================================================================
-- Pruebas de 0040 (panel del profe). Corre al final (después de los otros escenarios).
-- =====================================================================
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- ---------- Datos propios (como superusuario) ----------
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
do $$
declare
  v_org  uuid := (select id from public.organizations where slug = 'evolution');
  v_loc  uuid := (select id from public.locations where org_id = (select id from public.organizations where slug = 'evolution') limit 1);
  v_plan uuid;
  v_ba   uuid;
  v_m    uuid;
  v_m2   uuid;
  v_ms   uuid;
begin
  insert into public.class_types (org_id, name, default_capacity) values (v_org, 'ProfeTest', 10);
  insert into public.rooms (org_id, location_id, name, capacity) values (v_org, v_loc, 'Sala Profe', 10);
  insert into public.rooms (org_id, location_id, name, capacity) values (v_org, v_loc, 'Sala Chica', 2);
  insert into public.membership_plans (org_id, name, kind, price_cents, currency, billing_interval)
    values (v_org, 'Libre Profe', 'recurring', 100, 'ARS', 'month') returning id into v_plan;

  insert into public.members (org_id, first_name, last_name, email, phone)
    values (v_org, 'Rocío', 'Profesito', 'rocio@test.com', '11 5555-1234') returning id into v_m;
  insert into public.billing_accounts (org_id, payer_member_id) values (v_org, v_m) returning id into v_ba;
  update public.members set billing_account_id = v_ba where id = v_m;
  insert into public.memberships (org_id, plan_id, billing_account_id, current_period_start, current_period_end, provider)
    values (v_org, v_plan, v_ba, now() - interval '1 day', now() + interval '90 days', 'cash') returning id into v_ms;
  insert into public.membership_members (membership_id, member_id, org_id) values (v_ms, v_m, v_org);

  insert into public.members (org_id, first_name, last_name, email)
    values (v_org, 'Tomás', 'Profesito', 'tomas@test.com') returning id into v_m2;
  insert into public.billing_accounts (org_id, payer_member_id) values (v_org, v_m2) returning id into v_ba;
  update public.members set billing_account_id = v_ba where id = v_m2;
  insert into public.memberships (org_id, plan_id, billing_account_id, current_period_start, current_period_end, provider)
    values (v_org, v_plan, v_ba, now() - interval '1 day', now() + interval '90 days', 'cash') returning id into v_ms;
  insert into public.membership_members (membership_id, member_id, org_id) values (v_ms, v_m2, v_org);
end $$;
select id as rocio from public.members where first_name = 'Rocío' \gset
select set_config('t.rocio', :'rocio', false) is not null as _;
select id as tomas from public.members where first_name = 'Tomás' \gset
select set_config('t.tomas', :'tomas', false) is not null as _;
set role authenticated;

-- ---------- Permisos ----------
select test.login('00000000-0000-0000-0000-00000000000b');   -- Ana (profe)
reset role;
do $$
begin
  if array(select public.my_permissions((select id from public.organizations where slug = 'evolution'))) <> array['schedule.own'] then
    raise exception 'la profe debería tener solo schedule.own';
  end if;
end $$;
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000a');   -- recepción no maneja horarios
select test.expect_error($q$select public.create_series((select id from public.organizations where slug = 'evolution'),
  (select id from public.class_types where name = 'ProfeTest'), (select id from public.rooms where name = 'Sala Profe'), 5, '07:00', 60, 5)$q$, 'FORBIDDEN');
select test.ok('permisos: la profe tiene schedule.own, recepción no');

-- ---------- Grilla propia ----------
select test.login('00000000-0000-0000-0000-00000000000b');
select test.expect_error($q$select public.create_series((select id from public.organizations where slug = 'evolution'),
  (select id from public.class_types where name = 'ProfeTest'), (select id from public.rooms where name = 'Sala Chica'), 5, '07:00', 60, 5)$q$, 'CAPACITY_EXCEEDS_ROOM');
select test.expect_error($q$select public.create_series((select id from public.organizations where slug = 'evolution'),
  (select id from public.class_types where name = 'ProfeTest'), (select id from public.rooms where name = 'Sala Profe'), 5, '07:00', 60, 5,
  null, (select id from public.staff where display_name = 'Leo'))$q$, 'FORBIDDEN');   -- no puede cargarle horarios a otro profe
select (public.create_series((select id from public.organizations where slug = 'evolution'),
  (select id from public.class_types where name = 'ProfeTest'), (select id from public.rooms where name = 'Sala Profe'), 5, '07:00', 60, 5)
  ->> 'created')::int as creadas \gset
select set_config('t.creadas', :'creadas', false) is not null as _;
\echo clases creadas por la profe = :creadas
select test.expect_error($q$select public.create_series((select id from public.organizations where slug = 'evolution'),
  (select id from public.class_types where name = 'ProfeTest'), (select id from public.rooms where name = 'Sala Chica'), 5, '07:30', 30, 2)$q$, 'INSTRUCTOR_BUSY');
reset role;
do $$
begin
  if (select count(*) from public.class_sessions cs join public.class_types t on t.id = cs.class_type_id
       where t.name = 'ProfeTest' and cs.instructor_id = (select id from public.staff where display_name = 'Ana')) < 4 then
    raise exception 'no se generaron las clases del horario de la profe';
  end if;
end $$;
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000c');   -- Leo no toca lo de Ana
select test.expect_error($q$select public.update_series((select s.id from public.class_series s join public.class_types t on t.id = s.class_type_id where t.name = 'ProfeTest'),
  5, '09:00', 60, 5, (select id from public.rooms where name = 'Sala Profe'))$q$, 'FORBIDDEN');
select test.expect_error($q$select public.cancel_session((select cs.id from public.class_sessions cs join public.class_types t on t.id = cs.class_type_id where t.name = 'ProfeTest' order by starts_at limit 1))$q$, 'FORBIDDEN');
select test.ok('grilla: la profe crea su horario, valida sala y choques, otro profe no lo toca');

-- ---------- Anotar socios en su clase ----------
select test.login('00000000-0000-0000-0000-00000000000b');
select id as s1 from public.class_sessions cs where class_type_id = (select id from public.class_types where name = 'ProfeTest') order by starts_at limit 1 \gset
select set_config('t.s1', :'s1', false) is not null as _;
select id as s2 from public.class_sessions cs where class_type_id = (select id from public.class_types where name = 'ProfeTest') order by starts_at offset 1 limit 1 \gset
select set_config('t.s2', :'s2', false) is not null as _;
select count(*) as encontrados from public.class_member_search(:'s1', 'profesito') \gset
select set_config('t.encontrados', :'encontrados', false) is not null as _;
\echo búsqueda "profesito" = :encontrados
select public.book_class(:'s1', :'rocio') ->> 'status' as st \gset
select set_config('t.st', :'st', false) is not null as _;
\echo reserva hecha por la profe = :st
select public.book_class(:'s2', :'rocio') ->> 'status' as st2 \gset
select set_config('t.st2', :'st2', false) is not null as _;
select public.book_class(:'s2', :'tomas') is not null as ok_t \gset
select set_config('t.ok_t', :'ok_t', false) is not null as _;
reset role;
do $$
begin
  if (select source from public.bookings b join public.members m on m.id = b.member_id
       where m.first_name = 'Rocío' order by b.created_at limit 1) <> 'trainer' then
    raise exception 'la reserva de la profe no quedó con origen trainer';
  end if;
end $$;
set role authenticated;
select test.expect_error(format($q$select public.book_class((select id from public.class_sessions where instructor_id = (select id from public.staff where display_name = 'Leo') and status = 'scheduled' and starts_at > now() limit 1),
  %L)$q$, :'rocio'), 'FORBIDDEN');
select test.login('00000000-0000-0000-0000-00000000000c');
select test.expect_error($q$select * from public.class_member_search((select cs.id from public.class_sessions cs join public.class_types t on t.id = cs.class_type_id where t.name = 'ProfeTest' order by starts_at limit 1), 'profesito')$q$, 'FORBIDDEN');
select test.ok('anotar: busca y anota en sus clases (origen trainer), no en las de otro profe');

-- ---------- Control de socios ----------
select test.login('00000000-0000-0000-0000-00000000000b');
select count(*) as mios from public.trainer_members((select id from public.organizations where slug = 'evolution')) where member_name like '%Profesito' \gset
select set_config('t.mios', :'mios', false) is not null as _;
select test.login('00000000-0000-0000-0000-00000000000c');
select count(*) as de_leo from public.trainer_members((select id from public.organizations where slug = 'evolution')) where member_name like '%Profesito' \gset
select set_config('t.de_leo', :'de_leo', false) is not null as _;
\echo socios de la profe = :mios / que ve Leo = :de_leo
reset role;
do $$ begin if current_setting('t.mios')::int <> 2 or current_setting('t.de_leo')::int <> 0 then raise exception 'control de socios incorrecto'; end if; end $$;
set role authenticated;
select test.ok('control de socios: la profe ve a quienes vienen a sus clases, otro profe no');

-- ---------- Editar una clase ----------
select test.login('00000000-0000-0000-0000-00000000000b');
select starts_at as s1_antes from public.class_sessions where id = :'s1' \gset
select set_config('t.s1_antes', :'s1_antes', false) is not null as _;
select test.expect_error(format($q$select public.update_session(%L, null, null, 0)$q$, :'s1'), 'INVALID_CAPACITY');
select test.expect_error(format($q$select public.update_session(%L, null, null, 1)$q$, :'s2'), 'CAPACITY_BELOW_BOOKED');
select test.expect_error(format($q$select public.update_session(%L, now() - interval '1 hour')$q$, :'s1'), 'INVALID_START');
select public.update_session(:'s1', :'s1_antes'::timestamptz + interval '1 day 2 hours', 45, 8) as r1 \gset
select set_config('t.r1', :'r1', false) is not null as _;
\echo mover clase = :r1
reset role;
do $$
declare v public.class_sessions := (select s from public.class_sessions s where id = current_setting('t.s1')::uuid);
begin
  if v.series_slot <> current_setting('t.s1_antes')::timestamptz then raise exception 'no guardó el lugar original de la grilla'; end if;
  if v.ends_at - v.starts_at <> interval '45 minutes' or v.capacity <> 8 then raise exception 'no cambió duración/cupo'; end if;
  if exists (select 1 from public.bookings where session_id = v.id and during <> v.during) then raise exception 'la reserva no acompañó el cambio'; end if;
  if not exists (select 1 from public.message_outbox o join public.members m on m.id = o.member_id
                  where m.first_name = 'Rocío' and o.template_key = 'session_moved' and o.channel = 'email') then
    raise exception 'no se avisó el cambio por email';
  end if;
end $$;
set role authenticated;
select public.generate_sessions((select id from public.organizations where slug = 'evolution'), 4) is not null as regen \gset
select set_config('t.regen', :'regen', false) is not null as _;
reset role;
do $$
begin
  if exists (select 1 from public.class_sessions where starts_at = current_setting('t.s1_antes')::timestamptz::timestamptz
              and class_type_id = (select id from public.class_types where name = 'ProfeTest')) then
    raise exception 'el generador volvió a crear la clase movida en su horario original';
  end if;
end $$;
set role authenticated;
select test.ok('editar clase: mueve con sus reservas, avisa por email y la grilla no la duplica');

-- ---------- Cambiar día/hora del horario fijo ----------
select starts_at as s2_antes from public.class_sessions where id = :'s2' \gset
select set_config('t.s2_antes', :'s2_antes', false) is not null as _;
select public.update_series((select s.id from public.class_series s join public.class_types t on t.id = s.class_type_id where t.name = 'ProfeTest'),
  4, '08:00', 60, 6, (select id from public.rooms where name = 'Sala Profe')) as r2 \gset
select set_config('t.r2', :'r2', false) is not null as _;
\echo cambio de horario fijo = :r2
reset role;
do $$
declare v public.class_sessions := (select s from public.class_sessions s where id = current_setting('t.s2')::uuid);
begin
  if extract(isodow from v.starts_at at time zone 'America/Argentina/Buenos_Aires') <> 4
     or to_char(v.starts_at at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI') <> '08:00' then
    raise exception 'la clase con anotados no se movió al jueves 8:00 (quedó %)', v.starts_at;
  end if;
  if (v.starts_at - current_setting('t.s2_antes')::timestamptz) <> interval '-1 day +1 hour' then
    raise exception 'no quedó en la misma semana';
  end if;
  if exists (select 1 from public.class_sessions cs where cs.class_type_id = v.class_type_id and cs.series_slot is null
              and cs.status = 'scheduled' and cs.starts_at > now()
              and extract(isodow from cs.starts_at at time zone 'America/Argentina/Buenos_Aires') = 5) then
    raise exception 'quedaron clases vacías en el viernes';
  end if;
  if (select count(*) from public.message_outbox o where o.template_key = 'session_moved') < 3 then
    raise exception 'faltan avisos del cambio de horario fijo';
  end if;
  if (select starts_at from public.class_sessions where id = current_setting('t.s1')::uuid) <> current_setting('t.s1_antes')::timestamptz + interval '1 day 2 hours' then
    raise exception 'la clase movida a mano no se tenía que tocar';
  end if;
end $$;
set role authenticated;
select test.ok('horario fijo: cambia día y hora, mueve las clases con anotados y avisa');

-- ---------- Sacar a un socio y cancelar la clase ----------
select public.cancel_booking((select b.id from public.bookings b join public.members m on m.id = b.member_id
  where m.first_name = 'Tomás' and b.session_id = :'s2')) ->> 'status' as baja \gset
select set_config('t.baja', :'baja', false) is not null as _;
\echo la profe saca a Tomás = :baja
select public.cancel_session(:'s2', 'La profe está enferma') as liberadas \gset
select set_config('t.liberadas', :'liberadas', false) is not null as _;
\echo cancelar clase liberó = :liberadas
reset role;
do $$
begin
  if not exists (select 1 from public.message_outbox o join public.members m on m.id = o.member_id
                  where m.first_name = 'Rocío' and o.template_key = 'session_canceled' and o.body like '%enferma%') then
    raise exception 'no se avisó la suspensión';
  end if;
  if exists (select 1 from public.message_outbox o join public.members m on m.id = o.member_id
              where m.first_name = 'Tomás' and o.template_key = 'session_canceled') then
    raise exception 'avisó a alguien que ya no estaba anotado';
  end if;
end $$;
set role authenticated;
select test.ok('sacar socio y cancelar clase: avisa solo a los que seguían anotados');

-- ---------- Mensajes predefinidos ----------
select count(*) as del_gym from public.message_templates where staff_id is null \gset
select set_config('t.del_gym', :'del_gym', false) is not null as _;
insert into public.message_templates (org_id, staff_id, label, body)
  values ((select id from public.organizations where slug = 'evolution'), (select id from public.staff where display_name = 'Ana'), 'Mío', 'Hola {nombre}');
select test.expect_error($q$insert into public.message_templates (org_id, staff_id, label, body)
  values ((select id from public.organizations where slug = 'evolution'), null, 'Del gym', 'x')$q$, 'row-level security');
update public.message_templates set body = 'hackeado' where staff_id is null;
insert into public.message_outbox (org_id, sender_staff_id, member_id, phone, body, status)
  values ((select id from public.organizations where slug = 'evolution'), (select id from public.staff where display_name = 'Ana'),
          (select id from public.members where first_name = 'Rocío'), '5491155551234', 'Hola Rocío', 'manual');
select test.login('00000000-0000-0000-0000-00000000000c');
select count(*) as ve_leo from public.message_templates where label = 'Mío' \gset
select set_config('t.ve_leo', :'ve_leo', false) is not null as _;
select test.expect_error($q$insert into public.message_outbox (org_id, sender_staff_id, member_id, phone, body, status)
  values ((select id from public.organizations where slug = 'evolution'), (select id from public.staff where display_name = 'Leo'),
          (select id from public.members where first_name = 'Rocío'), '5491155551234', 'Hola', 'manual')$q$, 'row-level security');
reset role;
reset role;
do $$
begin
  if current_setting('t.del_gym')::int <> 9 then raise exception 'esperaba 9 mensajes del gimnasio y hay %', current_setting('t.del_gym')::int; end if;
  if current_setting('t.ve_leo')::int <> 0 then raise exception 'Leo ve los mensajes de Ana'; end if;
  if exists (select 1 from public.message_templates where body = 'hackeado') then raise exception 'la profe editó un mensaje del gimnasio'; end if;
end $$;
set role authenticated;
set role authenticated;
select test.ok('mensajes: 9 del gimnasio, cada profe los suyos, WhatsApp a quien vino a su clase');

-- ---------- El dueño le saca el permiso ----------
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
insert into public.staff_permission_overrides (staff_id, permission, granted)
  values ((select id from public.staff where display_name = 'Ana'), 'schedule.own', false);
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000b');
select test.expect_error($q$select public.update_session((select cs.id from public.class_sessions cs join public.class_types t on t.id = cs.class_type_id
  where t.name = 'ProfeTest' and cs.status = 'scheduled' and cs.starts_at > now() order by starts_at limit 1), null, null, 7)$q$, 'FORBIDDEN');
reset role;
delete from public.staff_permission_overrides where permission = 'schedule.own';
select test.ok('override: sin schedule.own la profe ya no edita');
\echo PANEL DEL PROFE: TODAS LAS PRUEBAS PASARON
