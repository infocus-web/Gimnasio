-- =====================================================================
-- Pruebas del panel de administración (0013). Corre después de scenario_v2.sql
-- =====================================================================
\set ON_ERROR_STOP 1
set client_min_messages = warning;

select set_config('request.jwt.claims', '{"role":"service_role"}', false);
insert into public.membership_plans (org_id, name, kind, price_cents, currency, billing_interval, max_members)
select id, 'Admin Individual', 'recurring', 3000000, 'ARS', 'month', 1 from public.organizations where slug = 'evolution';
insert into public.membership_plans (org_id, name, kind, price_cents, currency, billing_interval, max_members)
select id, 'Admin Familiar x2', 'recurring', 5000000, 'ARS', 'month', 2 from public.organizations where slug = 'evolution';

set role authenticated;

-- ---------- Alta de socios desde recepción ----------
select test.login('00000000-0000-0000-0000-00000000000a');   -- recepción (staff)
select public.admin_create_member(
  (select id from public.organizations where slug = 'evolution'), 'Juan', 'Pérez', ' Juan@Test.com ', null, '30111222',
  null, null, (select id from public.membership_plans where name = 'Admin Familiar x2'), null) as juan \gset
select public.admin_create_member(
  (select id from public.organizations where slug = 'evolution'), 'Juanito', 'Pérez', 'juan@test.com', null, null,
  null, :'juan', null, null) as juanito \gset
do $$
begin
  if (select count(*) from public.member_directory where plan_name = 'Admin Familiar x2' and last_name = 'Pérez') <> 2 then
    raise exception 'la familia no quedó cubierta por el plan';
  end if;
  if (select email from public.members where first_name = 'Juan') <> 'juan@test.com' then
    raise exception 'el email no se normalizó';
  end if;
end $$;
select test.expect_error($q$select public.admin_create_member(
  (select id from public.organizations where slug = 'evolution'), 'Juancito', 'Pérez', null, null, null,
  null, (select id from public.members where first_name = 'Juan'), null, null)$q$, 'FAMILY_LIMIT_REACHED');
select test.expect_error($q$select public.admin_create_member(
  (select id from public.organizations where slug = 'evolution'), 'Clon', '', null, null, '30111222')$q$, 'DOCUMENT_TAKEN');
select test.ok('alta de socio + plan + grupo familiar con tope');

-- Renovación: la membresía anterior queda cancelada, sigue habiendo una sola vigente
select public.admin_assign_plan(:'juan', (select id from public.membership_plans where name = 'Admin Familiar x2'), null) is not null as renovado;
do $$
begin
  if (select count(*) from public.memberships ms join public.members m on m.billing_account_id = ms.billing_account_id
       where m.first_name = 'Juan' and ms.status = 'active') <> 1 then
    raise exception 'quedaron dos membresías vigentes';
  end if;
end $$;
select test.expect_error($q$select public.admin_assign_plan((select id from public.members where first_name = 'Juanito'),
  (select id from public.membership_plans where name = 'Admin Individual'), null)$q$, 'NOT_PAYER');
select test.ok('renovar plan / solo el pagador');

-- ---------- Permisos ----------
select test.login('00000000-0000-0000-0000-00000000000b');   -- trainer
select test.expect_error($q$select public.admin_create_member(
  (select org_id from public.staff limit 1), 'X')$q$, 'FORBIDDEN');
do $$
begin
  if array(select public.my_permissions((select org_id from public.staff where display_name = 'Ana')) order by 1)
     <> array['checkins.manage'] then
    raise exception 'permisos del trainer incorrectos';
  end if;
end $$;
select test.login('00000000-0000-0000-0000-00000000000a');   -- recepción: no gestiona staff
select test.expect_error($q$insert into public.staff_invitations (org_id, email, role, display_name)
  select id, 'x@test.com', 'trainer', 'X' from public.organizations where slug = 'evolution'$q$, 'row-level security');
select test.ok('permisos: trainer no da altas, recepción no invita staff');

-- ---------- Invitaciones de staff ----------
select test.login('aaaaaaaa-0000-0000-0000-000000000001');   -- owner
insert into public.staff_invitations (org_id, email, role, display_name)
select id, 'nuevo.profe@test.com', 'trainer', 'Nuevo Profe' from public.organizations where slug = 'evolution';
select public.link_existing_user((select id from public.organizations where slug = 'evolution'), 'nuevo.profe@test.com') as sin_cuenta \gset
\echo sin cuenta = :sin_cuenta
reset role;
-- La persona acepta la invitación → se crea su cuenta (como lo haría Supabase Auth)
select set_config('request.jwt.claims', '', false);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000011', 'nuevo.profe@test.com');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000012', 'JUAN@test.com');
do $$
begin
  if not exists (select 1 from public.staff where user_id = '00000000-0000-0000-0000-000000000011' and role = 'trainer') then
    raise exception 'la invitación no creó el staff';
  end if;
  if exists (select 1 from public.staff_invitations where email = 'nuevo.profe@test.com' and accepted_at is null) then
    raise exception 'la invitación no quedó aceptada';
  end if;
  -- papá e hijo comparten email: se vincula SOLO el pagador
  if (select first_name from public.members where user_id = '00000000-0000-0000-0000-000000000012') <> 'Juan'
     or (select user_id from public.members where first_name = 'Juanito') is not null then
    raise exception 'vinculación de socio por email incorrecta';
  end if;
end $$;
select test.ok('invitación de staff y vínculo automático al crear la cuenta');

-- Cuenta que ya existía: se vincula en el acto desde el panel
set role authenticated;
select test.login('00000000-0000-0000-0000-00000000000a');
select public.admin_create_member((select id from public.organizations where slug = 'evolution'), 'Leo', 'Socio', 'profe.leo@test.com') is not null;
select public.link_existing_user((select id from public.organizations where slug = 'evolution'), 'profe.leo@test.com') as ya_tenia \gset
\echo ya tenía cuenta = :ya_tenia
do $$
begin
  if (select user_id from public.members where first_name = 'Leo' and last_name = 'Socio') <> '00000000-0000-0000-0000-00000000000c' then
    raise exception 'no se vinculó la cuenta existente';
  end if;
end $$;
select test.ok('cuenta existente vinculada desde el panel');

-- Un socio solo ve su grupo familiar en el directorio
select test.login('00000000-0000-0000-0000-000000000012');   -- Juan
do $$
begin
  if (select count(*) from public.member_directory) <> 2 then
    raise exception 'el socio ve fichas ajenas en el directorio';
  end if;
end $$;
select test.expect_error($q$select public.admin_assign_plan((select id from public.members where first_name = 'Juan'),
  (select id from public.membership_plans where name = 'Admin Individual'), null)$q$, 'FORBIDDEN');
select test.ok('directorio respeta RLS / socio no se asigna planes');

reset role;
\echo 'PANEL ADMIN: TODAS LAS PRUEBAS PASARON'
