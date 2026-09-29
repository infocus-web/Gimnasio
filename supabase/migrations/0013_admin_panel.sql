-- =====================================================================
-- Evolution Platform v2 · 0013 · Panel de administración (Socios + Equipo)
--   · staff_invitations: invitar staff por email antes de que tenga cuenta
--   · Vinculación automática cuenta ↔ ficha por email
--     (al crearse la cuenta, o al instante si la cuenta ya existía)
--   · admin_create_member / admin_assign_plan: alta atómica con cuenta
--     de facturación, membresía y grupo familiar
--   · member_directory: listado de socios con su plan vigente (respeta RLS)
--   · my_permissions: qué secciones del panel ve cada rol
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Invitaciones de staff
-- ---------------------------------------------------------------------
create table public.staff_invitations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  email        text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  role         public.staff_role not null check (role <> 'owner'),
  display_name text not null check (btrim(display_name) <> ''),
  invited_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  unique (org_id, email)
);
create index staff_invitations_email_idx on public.staff_invitations (email) where accepted_at is null;
create index staff_invitations_invited_by_idx on public.staff_invitations (invited_by);

-- Solo un owner invita admins (mismo criterio que staff_guard)
create or replace function public.staff_invitations_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then return new; end if;
  if new.role = 'admin' and not exists (
       select 1 from public.staff where org_id = new.org_id and user_id = auth.uid() and active and role = 'owner') then
    raise exception 'ONLY_OWNER_CAN_MANAGE_ADMINS';
  end if;
  return new;
end $$;
create trigger staff_invitations_guard before insert or update on public.staff_invitations
  for each row execute function public.staff_invitations_guard();

alter table public.staff_invitations enable row level security;
grant select, insert, update, delete on public.staff_invitations to authenticated;
create policy staff_invitations_manage on public.staff_invitations for all to authenticated
  using ((select private.has_permission(org_id, 'staff.manage')))
  with check ((select private.has_permission(org_id, 'staff.manage')));

-- ---------------------------------------------------------------------
-- 2. Las guardas dejan pasar la vinculación automática
--    (app.linking_user solo lo activa private.link_user_by_email, dentro de
--     su propia transacción; PostgREST no permite fijar GUCs arbitrarios)
-- ---------------------------------------------------------------------
create or replace function public.staff_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_my_role public.staff_role;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     or current_setting('app.linking_user', true) = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' and new.role = 'owner'
     and not exists (select 1 from public.staff where org_id = new.org_id) then
    return new;
  end if;
  select role into v_my_role from public.staff
   where org_id = coalesce(new.org_id, old.org_id) and user_id = auth.uid() and active;

  if tg_op in ('UPDATE', 'DELETE') and old.user_id = auth.uid() then
    if tg_op = 'DELETE' or new.role is distinct from old.role or new.active is distinct from old.active then
      raise exception 'CANNOT_MODIFY_OWN_ROLE';
    end if;
  end if;
  if (coalesce(new.role, old.role) in ('owner', 'admin') or (tg_op = 'UPDATE' and old.role in ('owner', 'admin')))
     and v_my_role is distinct from 'owner' then
    raise exception 'ONLY_OWNER_CAN_MANAGE_ADMINS';
  end if;
  return coalesce(new, old);
end $$;

create or replace function public.members_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     or current_setting('app.linking_user', true) = 'on'
     or private.has_permission(old.org_id, 'members.write') then
    return new;
  end if;
  if new.org_id is distinct from old.org_id
     or new.user_id is distinct from old.user_id
     or new.billing_account_id is distinct from old.billing_account_id
     or new.status is distinct from old.status
     or new.tags is distinct from old.tags
     or new.medical_notes is distinct from old.medical_notes
     or new.document_id is distinct from old.document_id
     or new.last_checkin_at is distinct from old.last_checkin_at then
    raise exception 'FIELD_NOT_EDITABLE_BY_MEMBER';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 3. Vinculación cuenta ↔ ficha por email
-- ---------------------------------------------------------------------
create or replace function private.link_user_by_email(p_user uuid, p_email text, p_org uuid default null)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_members int;
  v_staff int;
begin
  if v_email = '' or p_user is null then return 0; end if;
  perform set_config('app.linking_user', 'on', true);

  -- Socios: una ficha por gimnasio. Si varias fichas comparten el email
  -- (padre e hijos), se vincula la del pagador; si no, la más antigua.
  with pick as (
    select distinct on (m.org_id) m.id
      from public.members m
      left join public.billing_accounts ba on ba.payer_member_id = m.id
     where lower(m.email) = v_email
       and m.user_id is null
       and m.status <> 'archived'
       and (p_org is null or m.org_id = p_org)
       and not exists (select 1 from public.members x where x.org_id = m.org_id and x.user_id = p_user)
     order by m.org_id, (ba.id is null), m.created_at
  )
  update public.members m set user_id = p_user from pick where m.id = pick.id;
  get diagnostics v_members = row_count;

  -- Staff invitado
  insert into public.staff (org_id, user_id, role, display_name)
  select i.org_id, p_user, i.role, i.display_name
    from public.staff_invitations i
   where i.email = v_email and i.accepted_at is null and (p_org is null or i.org_id = p_org)
  on conflict (org_id, user_id) do nothing;
  get diagnostics v_staff = row_count;

  update public.staff_invitations
     set accepted_at = now()
   where email = v_email and accepted_at is null and (p_org is null or org_id = p_org)
     and exists (select 1 from public.staff s where s.org_id = staff_invitations.org_id and s.user_id = p_user);

  perform set_config('app.linking_user', 'off', true);
  return v_members + v_staff;
end $$;
revoke execute on function private.link_user_by_email(uuid, text, uuid) from public, anon, authenticated;

-- Al crearse una cuenta (invitación o link mágico) se vincula sola.
-- Nunca bloquea el alta de la cuenta: ante un error solo deja un warning.
create or replace function public.handle_user_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform private.link_user_by_email(new.id, new.email);
  exception when others then
    raise warning 'link_user_by_email(%) failed: %', new.id, sqlerrm;
  end;
  return new;
end $$;
create trigger on_auth_user_link
  after insert on auth.users
  for each row execute function public.handle_user_link();

-- Desde el panel: si la persona YA tiene cuenta, se vincula en el acto.
-- Devuelve 'LINKED' o 'NO_ACCOUNT' (entonces el servidor manda la invitación).
create or replace function public.link_existing_user(p_org uuid, p_email text)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if not (private.has_permission(p_org, 'members.write') or private.has_permission(p_org, 'staff.manage')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
  if v_user is null then return 'NO_ACCOUNT'; end if;
  perform private.link_user_by_email(v_user, p_email, p_org);
  return 'LINKED';
end $$;
revoke execute on function public.link_existing_user(uuid, text) from public, anon;
grant execute on function public.link_existing_user(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Planes: asignar / renovar (cobro manual en mostrador)
-- ---------------------------------------------------------------------
create or replace function public.admin_assign_plan(p_member uuid, p_plan uuid, p_start date default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_m       public.members;
  v_plan    public.membership_plans;
  v_tz      text;
  v_account uuid;
  v_start   timestamptz;
  v_end     timestamptz;
  v_ms      uuid;
begin
  select * into v_m from public.members where id = p_member;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  if not private.has_permission(v_m.org_id, 'billing.write') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_plan from public.membership_plans where id = p_plan and org_id = v_m.org_id and active;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  select timezone into v_tz from public.organizations where id = v_m.org_id;

  -- El plan se asigna al pagador; si no tiene cuenta, se crea con él de pagador.
  if v_m.billing_account_id is null then
    insert into public.billing_accounts (org_id, payer_member_id, provider)
    values (v_m.org_id, v_m.id, 'cash') returning id into v_account;
    update public.members set billing_account_id = v_account where id = v_m.id;
  else
    select id into v_account from public.billing_accounts
     where id = v_m.billing_account_id and payer_member_id = v_m.id;
    if v_account is null then raise exception 'NOT_PAYER'; end if;
  end if;

  v_start := (coalesce(p_start, (now() at time zone v_tz)::date))::timestamp at time zone v_tz;
  v_end := case v_plan.kind
             when 'recurring' then v_start + (v_plan.interval_count || ' ' || v_plan.billing_interval)::interval
             when 'class_pack' then v_start + make_interval(days => coalesce(v_plan.credits_valid_days, 30))
             when 'trial' then v_start + make_interval(days => 7)
             else v_start + interval '1 day'
           end;

  -- Una sola membresía vigente por cuenta: la anterior se da de baja.
  update public.memberships
     set status = 'canceled', canceled_at = now()
   where billing_account_id = v_account and status in ('active', 'trialing', 'past_due', 'paused');

  insert into public.memberships (org_id, plan_id, billing_account_id, status, started_at,
                                  current_period_start, current_period_end, credits_remaining, provider)
  values (v_m.org_id, v_plan.id, v_account, 'active', v_start, v_start, v_end, v_plan.class_credits, 'cash')
  returning id into v_ms;

  -- Cubre al pagador y a su grupo familiar (el trigger controla el tope del plan)
  insert into public.membership_members (membership_id, member_id, org_id)
  select v_ms, x.id, v_m.org_id
    from public.members x
   where x.billing_account_id = v_account and x.status <> 'archived'
   order by (x.id <> v_m.id), x.created_at;

  return v_ms;
end $$;
revoke execute on function public.admin_assign_plan(uuid, uuid, date) from public, anon;
grant execute on function public.admin_assign_plan(uuid, uuid, date) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Alta de socio (atómica): ficha + cuenta + plan, o integrante de una familia
-- ---------------------------------------------------------------------
create or replace function public.admin_create_member(
  p_org         uuid,
  p_first_name  text,
  p_last_name   text default '',
  p_email       text default null,
  p_phone       text default null,
  p_document_id text default null,
  p_birth_date  date default null,
  p_payer_id    uuid default null,
  p_plan_id     uuid default null,
  p_start       date default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_member  uuid;
  v_account uuid;
begin
  if not private.has_permission(p_org, 'members.write') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if btrim(coalesce(p_first_name, '')) = '' then raise exception 'NAME_REQUIRED'; end if;
  if nullif(btrim(p_document_id), '') is not null
     and exists (select 1 from public.members where org_id = p_org and document_id = btrim(p_document_id)) then
    raise exception 'DOCUMENT_TAKEN';
  end if;

  insert into public.members (org_id, first_name, last_name, email, phone, document_id, birth_date, home_location_id)
  values (p_org, btrim(p_first_name), btrim(coalesce(p_last_name, '')),
          nullif(lower(btrim(p_email)), ''), nullif(btrim(p_phone), ''), nullif(btrim(p_document_id), ''),
          p_birth_date,
          (select id from public.locations where org_id = p_org and active order by created_at limit 1))
  returning id into v_member;

  if p_payer_id is not null then
    -- Integrante de un grupo familiar: se suma a la cuenta y a la membresía vigente del pagador
    select ba.id into v_account
      from public.billing_accounts ba
     where ba.payer_member_id = p_payer_id and ba.org_id = p_org;
    if v_account is null then raise exception 'PAYER_HAS_NO_ACCOUNT'; end if;
    update public.members set billing_account_id = v_account where id = v_member;
    insert into public.membership_members (membership_id, member_id, org_id)
    select ms.id, v_member, p_org
      from public.memberships ms
     where ms.billing_account_id = v_account and ms.status in ('active', 'trialing', 'past_due', 'paused')
     order by ms.current_period_end desc
     limit 1;
  else
    insert into public.billing_accounts (org_id, payer_member_id, provider)
    values (p_org, v_member, 'cash') returning id into v_account;
    update public.members set billing_account_id = v_account where id = v_member;
    if p_plan_id is not null then
      perform public.admin_assign_plan(v_member, p_plan_id, p_start);
    end if;
  end if;

  return v_member;
end $$;
revoke execute on function public.admin_create_member(uuid, text, text, text, text, text, date, uuid, uuid, date) from public, anon;
grant execute on function public.admin_create_member(uuid, text, text, text, text, text, date, uuid, uuid, date) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Listado de socios con su plan vigente (security_invoker → respeta RLS)
-- ---------------------------------------------------------------------
create or replace view public.member_directory with (security_invoker = true) as
select m.id, m.org_id, m.first_name, m.last_name, m.email, m.phone, m.document_id, m.birth_date,
       m.status, m.photo_url, m.medical_notes, m.last_checkin_at, m.created_at,
       m.user_id is not null                          as has_app,
       m.billing_account_id,
       ba.payer_member_id,
       coalesce(ba.payer_member_id = m.id, false)     as is_payer,
       cur.membership_id, cur.plan_id, cur.plan_name, cur.membership_status,
       cur.current_period_end, cur.credits_remaining
  from public.members m
  left join public.billing_accounts ba on ba.id = m.billing_account_id
  left join lateral (
    select ms.id as membership_id, p.id as plan_id, p.name as plan_name, ms.status as membership_status,
           ms.current_period_end, ms.credits_remaining
      from public.membership_members mm
      join public.memberships ms on ms.id = mm.membership_id
      join public.membership_plans p on p.id = ms.plan_id
     where mm.member_id = m.id and ms.status not in ('canceled', 'expired')
     order by ms.current_period_end desc
     limit 1
  ) cur on true;
grant select on public.member_directory to authenticated;

-- ---------------------------------------------------------------------
-- 7. Permisos del usuario logueado en un gimnasio (arma el menú del panel)
-- ---------------------------------------------------------------------
create or replace function public.my_permissions(p_org uuid) returns setof text
language sql stable security definer set search_path = '' as $$
  select p.code from public.permissions p where private.has_permission(p_org, p.code)
$$;
revoke execute on function public.my_permissions(uuid) from public, anon;
grant execute on function public.my_permissions(uuid) to authenticated;

-- Las funciones de trigger no se llaman por la API
revoke execute on function public.handle_user_link() from public, anon, authenticated;
revoke execute on function public.staff_invitations_guard() from public, anon, authenticated;
