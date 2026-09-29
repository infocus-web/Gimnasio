-- =====================================================================
-- Evolution Platform v2 · 0017 · Padrón del equipo (autoinscripción + aprobación)
--   · staff_requests: los profes se anotan con un link público; NO se crea
--     ninguna cuenta hasta que el dueño/admin aprueba.
--   · submit_staff_request(): única vía de alta (anon), con validaciones y
--     límite de envíos por hora.
--   · staff / staff_invitations guardan teléfono y DNI.
-- =====================================================================

alter table public.staff             add column if not exists phone text, add column if not exists document_id text;
alter table public.staff_invitations add column if not exists phone text, add column if not exists document_id text;

create table public.staff_requests (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  first_name     text not null check (btrim(first_name) <> ''),
  last_name      text not null check (btrim(last_name) <> ''),
  document_id    text not null check (document_id ~ '^\d{7,9}$'),
  phone          text not null,
  email          text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  requested_role public.staff_role not null check (requested_role in ('trainer', 'staff')),
  message        text check (char_length(message) <= 500),
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by    uuid references auth.users (id) on delete set null,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now()
);
create unique index staff_requests_pending_email_uidx on public.staff_requests (org_id, email) where status = 'pending';
create index staff_requests_org_status_idx on public.staff_requests (org_id, status, created_at desc);
create index staff_requests_reviewed_by_idx on public.staff_requests (reviewed_by);

alter table public.staff_requests enable row level security;
grant select, update, delete on public.staff_requests to authenticated;
create policy staff_requests_manage on public.staff_requests for all to authenticated
  using ((select private.has_permission(org_id, 'staff.manage')))
  with check ((select private.has_permission(org_id, 'staff.manage')));

-- Alta pública. Devuelve siempre 'OK' aunque el email ya sea del equipo
-- (no revela quién trabaja en el gimnasio).
create or replace function public.submit_staff_request(
  p_slug        text,
  p_first_name  text,
  p_last_name   text,
  p_document_id text,
  p_phone       text,
  p_email       text,
  p_role        text,
  p_message     text default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_org   uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_doc   text := regexp_replace(coalesce(p_document_id, ''), '\D', '', 'g');
begin
  select id into v_org from public.organizations where slug = lower(p_slug);
  if v_org is null then raise exception 'ORG_NOT_FOUND'; end if;

  if btrim(coalesce(p_first_name, '')) = '' or btrim(coalesce(p_last_name, '')) = '' then raise exception 'NAME_REQUIRED'; end if;
  if v_doc !~ '^\d{7,9}$' then raise exception 'INVALID_DOCUMENT'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'INVALID_EMAIL'; end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 8 then raise exception 'INVALID_PHONE'; end if;
  if p_role not in ('trainer', 'staff') then raise exception 'INVALID_ROLE'; end if;

  -- Anti-spam: tope de solicitudes por gimnasio por hora
  if (select count(*) from public.staff_requests where org_id = v_org and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'RATE_LIMITED';
  end if;

  -- Ya es del equipo o ya tiene una solicitud pendiente: no se duplica (respuesta igual)
  if exists (select 1 from public.staff s join auth.users u on u.id = s.user_id where s.org_id = v_org and lower(u.email) = v_email)
     or exists (select 1 from public.staff_requests where org_id = v_org and email = v_email and status = 'pending') then
    return 'OK';
  end if;

  insert into public.staff_requests (org_id, first_name, last_name, document_id, phone, email, requested_role, message)
  values (v_org, btrim(p_first_name), btrim(p_last_name), v_doc, btrim(p_phone), v_email,
          p_role::public.staff_role, nullif(left(btrim(coalesce(p_message, '')), 500), ''));
  return 'OK';
end $$;
revoke execute on function public.submit_staff_request(text, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_staff_request(text, text, text, text, text, text, text, text) to anon, authenticated;

-- La vinculación por email ahora copia teléfono y DNI de la invitación al staff
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

  insert into public.staff (org_id, user_id, role, display_name, phone, document_id)
  select i.org_id, p_user, i.role, i.display_name, i.phone, i.document_id
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
