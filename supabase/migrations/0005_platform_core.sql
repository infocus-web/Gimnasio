-- =====================================================================
-- Evolution Platform v2 · 0005 · Núcleo multi-tenant, RBAC, socios y
-- facturación familiar.
--
-- Qué hace esta migración
--   1. Archiva las tablas de la v1 (Vite) en el schema `legacy` (no borra nada).
--   2. Crea el núcleo SaaS: organizations (tenant) → locations (sedes).
--   3. Identidad global (profiles) separada de los roles por gimnasio:
--        · staff    → owner / admin / staff / trainer  (RBAC granular)
--        · members  → clientes del gimnasio (pueden no tener login: hijos, etc.)
--   4. Facturación "familiar": billing_accounts (1 pagador) → memberships
--      que cubren N socios (membership_members, tope = plan.max_members).
--   5. Pagos agnósticos de proveedor (Stripe / Mercado Pago / efectivo).
--   6. Outbox de eventos de dominio (domain_events) para el motor de workflows.
--
-- Convenciones
--   · Todas las tablas de negocio llevan org_id (tenant) y FKs compuestas
--     (id, org_id) para que sea IMPOSIBLE mezclar datos de dos gimnasios.
--   · Montos en centavos (bigint) + moneda ISO-4217. Nunca float.
--   · Timestamps en timestamptz; la zona horaria vive en organizations.
--   · Helpers de seguridad en el schema `private` (no expuesto por la API).
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto  with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Archivar la v1
-- ---------------------------------------------------------------------
create schema if not exists legacy;
revoke all on schema legacy from public, anon, authenticated;

-- El trigger de alta de usuarios de la v1 escribe en public.profiles; lo
-- reemplazamos más abajo.
drop trigger if exists on_auth_user_created on auth.users;

-- Funciones v1: dependen de las tablas viejas. CASCADE borra también las
-- políticas RLS de la v1 y las de storage que usaban is_staff() (se recrean
-- en 0008 con el modelo nuevo).
drop function if exists public.member_portal(text) cascade;
drop function if exists public.dashboard_stats() cascade;
drop function if exists public.check_in(text, uuid, text) cascade;
drop function if exists public.record_payment(uuid, uuid, numeric, text, text, text, int) cascade;
drop function if exists public.after_payment_delete() cascade;
drop function if exists public.protect_profile_role() cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.is_staff() cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.is_service() cascade;
drop view if exists public.members_view;
drop function if exists public.member_status(boolean, date) cascade;

do $$
declare t text;
begin
  foreach t in array array['settings', 'profiles', 'plans', 'members', 'payments', 'checkins',
                           'exercises', 'routines', 'routine_items', 'member_routines',
                           'activities', 'activity_schedule', 'email_log'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I set schema legacy', t);
      execute format('revoke all on legacy.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Tipos
-- ---------------------------------------------------------------------
create type public.staff_role        as enum ('owner', 'admin', 'staff', 'trainer');
create type public.member_status     as enum ('lead', 'active', 'frozen', 'archived');
create type public.plan_kind         as enum ('recurring', 'class_pack', 'drop_in', 'trial');
create type public.membership_status as enum ('trialing', 'active', 'past_due', 'paused', 'canceled', 'expired');
create type public.payment_provider  as enum ('stripe', 'mercadopago', 'cash', 'transfer', 'card_terminal', 'other');
create type public.payment_status    as enum ('pending', 'succeeded', 'failed', 'refunded', 'canceled');
create type public.invoice_status    as enum ('draft', 'open', 'paid', 'void', 'uncollectible');

-- ---------------------------------------------------------------------
-- 3. Utilidades
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 4. Tenancy
-- ---------------------------------------------------------------------
create table public.organizations (
  id                        uuid primary key default gen_random_uuid(),
  slug                      text not null unique check (slug ~ '^[a-z0-9](-?[a-z0-9])*$' and length(slug) between 3 and 48),
  name                      text not null,
  timezone                  text not null default 'America/Argentina/Buenos_Aires',
  currency                  char(3) not null default 'ARS',
  country                   char(2) not null default 'AR',
  default_payment_provider  public.payment_provider not null default 'mercadopago',
  grace_days                int  not null default 3  check (grace_days between 0 and 30),
  late_cancel_minutes       int  not null default 120 check (late_cancel_minutes >= 0),
  qr_step_seconds           int  not null default 30 check (qr_step_seconds between 10 and 300),
  branding                  jsonb not null default '{}'::jsonb,  -- colores, logo (ej. negro + #edcc36)
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create trigger organizations_touch before update on public.organizations
  for each row execute function public.touch_updated_at();

create table public.locations (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  name       text not null,
  address    text,
  timezone   text,                           -- null = la de la organización
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, org_id)
);
create index locations_org_idx on public.locations (org_id);

-- ---------------------------------------------------------------------
-- 5. Identidad global (1:1 con auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  phone      text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 6. RBAC: staff + matriz de permisos
-- ---------------------------------------------------------------------
create table public.staff (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         public.staff_role not null,
  display_name text not null,
  bio          text,
  photo_url    text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (org_id, user_id),
  unique (id, org_id)
);
create index staff_user_idx on public.staff (user_id) where active;

-- Catálogo de permisos (granular). La app pregunta por permisos, nunca por roles.
create table public.permissions (
  code        text primary key,
  description text not null
);
insert into public.permissions (code, description) values
  ('org.manage',          'Configuración del gimnasio, sedes y datos fiscales'),
  ('staff.manage',        'Alta/baja de staff y asignación de roles'),
  ('members.read',        'Ver todos los socios del gimnasio'),
  ('members.write',       'Crear y editar socios, asignar entrenador'),
  ('billing.read',        'Ver membresías, facturas y pagos'),
  ('billing.write',       'Cobrar, reembolsar, cambiar planes'),
  ('schedule.manage',     'Salas, equipamiento, tipos de clase y agenda'),
  ('bookings.manage',     'Reservar/cancelar en nombre de cualquier socio'),
  ('checkins.manage',     'Operar la recepción (escanear QR, ingreso manual)'),
  ('training.manage_all', 'Ver y editar entrenamiento de todos los socios'),
  ('automations.manage',  'Configurar workflows automáticos'),
  ('reports.read',        'Ver reportes y métricas del negocio');

create table public.role_permissions (
  role       public.staff_role not null,
  permission text not null references public.permissions (code) on delete cascade,
  primary key (role, permission)
);
-- owner tiene todo implícitamente (ver private.has_permission)
insert into public.role_permissions (role, permission)
select 'admin'::public.staff_role, code from public.permissions
union all
select 'staff', unnest(array['members.read', 'members.write', 'billing.read', 'billing.write',
                             'bookings.manage', 'checkins.manage'])
union all
select 'trainer', unnest(array['checkins.manage']);
-- Nota: el trainer NO tiene members.read. Ve únicamente a SUS alumnos
-- (trainer_clients) y los asistentes de SUS clases. Ver 0008.

-- Excepciones por persona (ej. un trainer que también cobra en recepción)
create table public.staff_permission_overrides (
  staff_id   uuid not null references public.staff (id) on delete cascade,
  permission text not null references public.permissions (code) on delete cascade,
  granted    boolean not null,
  primary key (staff_id, permission)
);

-- ---------------------------------------------------------------------
-- 7. Socios (clientes) y facturación familiar
-- ---------------------------------------------------------------------
create table public.members (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete cascade,
  user_id            uuid references auth.users (id) on delete set null,  -- null = sin login (ej. hijo menor)
  billing_account_id uuid,                                                -- FK agregada más abajo (ciclo)
  home_location_id   uuid,
  first_name         text not null,
  last_name          text not null default '',
  email              text,
  phone              text,
  document_id        text,                                                -- DNI
  birth_date         date,
  emergency_contact  jsonb,
  medical_notes      text,
  photo_url          text,
  status             public.member_status not null default 'active',
  tags               text[] not null default '{}',
  last_checkin_at    timestamptz,                                         -- denormalizado para el motor de retención
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, org_id),
  foreign key (home_location_id, org_id) references public.locations (id, org_id)
);
create unique index members_org_user_uidx on public.members (org_id, user_id) where user_id is not null;
create unique index members_org_doc_uidx  on public.members (org_id, document_id) where document_id is not null and document_id <> '';
create index members_org_name_idx on public.members (org_id, lower(last_name), lower(first_name));
create index members_billing_idx  on public.members (billing_account_id);
create index members_last_checkin_idx on public.members (org_id, last_checkin_at);
create trigger members_touch before update on public.members
  for each row execute function public.touch_updated_at();

-- Secreto del QR dinámico: tabla aparte, sin políticas → solo funciones definer.
create table public.member_secrets (
  member_id  uuid primary key references public.members (id) on delete cascade,
  qr_secret  bytea not null default extensions.gen_random_bytes(32),
  rotated_at timestamptz not null default now()
);
create or replace function public.members_create_secret() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.member_secrets (member_id) values (new.id);
  return new;
end $$;
create trigger members_create_secret after insert on public.members
  for each row execute function public.members_create_secret();

-- Relación entrenador ↔ alumno (base del modelo "two-sided" de Trainerize)
create table public.trainer_clients (
  org_id     uuid not null,
  trainer_id uuid not null,
  member_id  uuid not null,
  since      date not null default current_date,
  primary key (trainer_id, member_id),
  foreign key (trainer_id, org_id) references public.staff (id, org_id) on delete cascade,
  foreign key (member_id, org_id)  references public.members (id, org_id) on delete cascade
);
create index trainer_clients_member_idx on public.trainer_clients (member_id);

-- Cuenta de facturación: UN pagador, N socios vinculados.
create table public.billing_accounts (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations (id) on delete cascade,
  payer_member_id       uuid not null,
  provider              public.payment_provider not null default 'mercadopago',
  provider_customer_id  text,                         -- cus_... (Stripe) / customer id (MP)
  delinquent            boolean not null default false,
  created_at            timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, payer_member_id),
  unique (provider, provider_customer_id),
  foreign key (payer_member_id, org_id) references public.members (id, org_id) on delete restrict
);

alter table public.members
  add constraint members_billing_account_fk
  foreign key (billing_account_id, org_id) references public.billing_accounts (id, org_id)
  on delete set null (billing_account_id) deferrable initially deferred;

-- Planes
create table public.membership_plans (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organizations (id) on delete cascade,
  name                   text not null,
  description            text,
  kind                   public.plan_kind not null default 'recurring',
  price_cents            bigint not null check (price_cents >= 0),
  currency               char(3) not null,
  billing_interval       text check (billing_interval in ('day', 'week', 'month', 'year')),
  interval_count         int not null default 1 check (interval_count > 0),
  class_credits          int check (class_credits > 0),          -- packs de clases
  credits_valid_days     int check (credits_valid_days > 0),
  max_members            int not null default 1 check (max_members between 1 and 10),  -- >1 = plan familiar
  max_bookings_per_week  int check (max_bookings_per_week > 0),
  booking_window_days    int not null default 14 check (booking_window_days between 0 and 90),
  includes_open_gym      boolean not null default true,         -- acceso libre a sala de musculación
  provider_price_ids     jsonb not null default '{}'::jsonb,     -- {"stripe":"price_...","mercadopago":"preapproval_plan_id"}
  active                 boolean not null default true,
  is_public              boolean not null default true,
  sort                   int not null default 0,
  created_at             timestamptz not null default now(),
  unique (id, org_id),
  check (kind <> 'recurring'  or billing_interval is not null),
  check (kind <> 'class_pack' or class_credits is not null)
);

create table public.memberships (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations (id) on delete cascade,
  plan_id                  uuid not null,
  billing_account_id       uuid not null,
  status                   public.membership_status not null default 'active',
  started_at               timestamptz not null default now(),
  current_period_start     timestamptz not null,
  current_period_end       timestamptz not null,
  cancel_at_period_end     boolean not null default false,
  canceled_at              timestamptz,
  paused_until             timestamptz,
  credits_remaining        int check (credits_remaining >= 0),
  provider                 public.payment_provider not null,
  provider_subscription_id text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (id, org_id),
  unique (provider, provider_subscription_id),
  check (current_period_end > current_period_start),
  foreign key (plan_id, org_id)            references public.membership_plans (id, org_id),
  foreign key (billing_account_id, org_id) references public.billing_accounts (id, org_id) on delete cascade
);
create index memberships_account_idx on public.memberships (billing_account_id, status);
create trigger memberships_touch before update on public.memberships
  for each row execute function public.touch_updated_at();

-- Qué socios cubre cada membresía (el corazón de las cuentas familiares)
create table public.membership_members (
  membership_id uuid not null,
  member_id     uuid not null,
  org_id        uuid not null,
  added_at      timestamptz not null default now(),
  primary key (membership_id, member_id),
  foreign key (membership_id, org_id) references public.memberships (id, org_id) on delete cascade,
  foreign key (member_id, org_id)     references public.members (id, org_id) on delete cascade
);
create index membership_members_member_idx on public.membership_members (member_id);

-- Tope de integrantes según el plan + todos deben pertenecer a la cuenta pagadora
create or replace function public.membership_members_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_max     int;
  v_count   int;
  v_account uuid;
begin
  select p.max_members, m.billing_account_id into v_max, v_account
    from public.memberships m join public.membership_plans p on p.id = m.plan_id
   where m.id = new.membership_id
   for update of m;                       -- serializa altas concurrentes a la misma membresía

  select count(*) into v_count from public.membership_members where membership_id = new.membership_id;
  if v_count >= v_max then
    raise exception 'FAMILY_LIMIT_REACHED' using hint = format('El plan admite hasta %s integrantes', v_max);
  end if;

  if not exists (select 1 from public.members where id = new.member_id and billing_account_id = v_account) then
    raise exception 'MEMBER_NOT_IN_BILLING_ACCOUNT'
      using hint = 'El socio debe estar vinculado a la cuenta del pagador';
  end if;
  return new;
end $$;
create trigger membership_members_guard before insert on public.membership_members
  for each row execute function public.membership_members_guard();

-- ---------------------------------------------------------------------
-- 8. Facturas y pagos (agnósticos del proveedor)
-- ---------------------------------------------------------------------
create table public.invoices (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id) on delete cascade,
  billing_account_id  uuid not null,
  membership_id       uuid,
  number              text,
  status              public.invoice_status not null default 'open',
  amount_due_cents    bigint not null check (amount_due_cents >= 0),
  amount_paid_cents   bigint not null default 0 check (amount_paid_cents >= 0),
  currency            char(3) not null,
  period_start        timestamptz,
  period_end          timestamptz,
  due_at              timestamptz,
  provider            public.payment_provider,
  provider_invoice_id text,
  created_at          timestamptz not null default now(),
  unique (id, org_id),
  unique (provider, provider_invoice_id),
  foreign key (billing_account_id, org_id) references public.billing_accounts (id, org_id) on delete cascade,
  foreign key (membership_id, org_id)      references public.memberships (id, org_id) on delete set null (membership_id)
);
create index invoices_account_idx on public.invoices (billing_account_id, created_at desc);

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id) on delete cascade,
  billing_account_id  uuid not null,
  invoice_id          uuid,
  amount_cents        bigint not null check (amount_cents >= 0),
  currency            char(3) not null,
  provider            public.payment_provider not null,
  provider_payment_id text,
  status              public.payment_status not null,
  failure_reason      text,
  paid_at             timestamptz,
  recorded_by         uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (provider, provider_payment_id),               -- idempotencia de webhooks
  foreign key (billing_account_id, org_id) references public.billing_accounts (id, org_id) on delete cascade,
  foreign key (invoice_id, org_id)         references public.invoices (id, org_id) on delete set null (invoice_id)
);
create index payments_account_idx on public.payments (billing_account_id, created_at desc);
create index payments_org_paid_idx on public.payments (org_id, paid_at desc) where status = 'succeeded';
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

-- Idempotencia de webhooks (Stripe `evt_...`, Mercado Pago `id` de notificación)
create table public.webhook_events (
  provider     public.payment_provider not null,
  event_id     text not null,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  error        text,
  primary key (provider, event_id)
);

-- ---------------------------------------------------------------------
-- 9. Outbox de eventos de dominio (lo consume el motor de workflows)
-- ---------------------------------------------------------------------
create table public.domain_events (
  id            bigint generated always as identity primary key,
  org_id        uuid not null references public.organizations (id) on delete cascade,
  type          text not null,       -- 'payment.failed', 'booking.created', 'member.inactive', ...
  member_id     uuid,
  payload       jsonb not null default '{}'::jsonb,
  occurred_at   timestamptz not null default now(),
  processed_at  timestamptz,
  attempts      int not null default 0
);
create index domain_events_pending_idx on public.domain_events (occurred_at) where processed_at is null;

-- Pago fallido → evento; membresía cambia de estado → evento
create or replace function public.payments_emit_events() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_payer uuid;
begin
  if new.status is distinct from coalesce(old.status, 'pending'::public.payment_status)
     and new.status in ('failed', 'succeeded') then
    select payer_member_id into v_payer from public.billing_accounts where id = new.billing_account_id;
    insert into public.domain_events (org_id, type, member_id, payload)
    values (new.org_id, 'payment.' || new.status::text, v_payer,
            jsonb_build_object('payment_id', new.id, 'amount_cents', new.amount_cents,
                               'currency', new.currency, 'reason', new.failure_reason));
    update public.billing_accounts set delinquent = (new.status = 'failed')
     where id = new.billing_account_id;
  end if;
  return new;
end $$;
create trigger payments_emit_events after insert or update of status on public.payments
  for each row execute function public.payments_emit_events();

create or replace function public.memberships_emit_events() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.domain_events (org_id, type, payload)
    values (new.org_id, 'membership.' || new.status::text,
            jsonb_build_object('membership_id', new.id, 'billing_account_id', new.billing_account_id,
                               'previous_status', case when tg_op = 'UPDATE' then old.status::text end));
  end if;
  return new;
end $$;
create trigger memberships_emit_events after insert or update of status on public.memberships
  for each row execute function public.memberships_emit_events();

-- ---------------------------------------------------------------------
-- 10. Helpers de autorización (schema private, no expuesto por PostgREST)
--     SECURITY DEFINER + STABLE: se evalúan una vez por query cuando se
--     envuelven en (select ...) dentro de las políticas.
-- ---------------------------------------------------------------------
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

create or replace function private.staff_id(p_org uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.staff where org_id = p_org and user_id = auth.uid() and active
$$;

create or replace function private.has_permission(p_org uuid, p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
             when s.role = 'owner' then true
             when o.granted is not null then o.granted
             else exists (select 1 from public.role_permissions rp
                           where rp.role = s.role and rp.permission = p_permission)
           end
      from public.staff s
      left join public.staff_permission_overrides o on o.staff_id = s.id and o.permission = p_permission
     where s.org_id = p_org and s.user_id = auth.uid() and s.active
  ), false)
$$;

-- Organizaciones donde el usuario es staff o socio
-- (devuelven SETOF para usarse como `col in (select private.fn())`: Postgres
--  evalúa el subquery UNA vez por consulta y lo hashea → RLS barato)
create or replace function private.my_org_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select org_id from public.staff   where user_id = auth.uid() and active
  union
  select org_id from public.members where user_id = auth.uid() and status <> 'archived'
$$;

-- Socios en cuyo nombre puede actuar el usuario: él mismo + los integrantes
-- de las cuentas familiares donde es el pagador.
create or replace function private.actable_member_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.members m where m.user_id = auth.uid()
  union
  select dep.id
    from public.members payer
    join public.billing_accounts ba on ba.payer_member_id = payer.id
    join public.members dep on dep.billing_account_id = ba.id
   where payer.user_id = auth.uid()
$$;

create or replace function private.is_payer(p_billing_account uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.billing_accounts ba
                   join public.members m on m.id = ba.payer_member_id
                  where ba.id = p_billing_account and m.user_id = auth.uid())
$$;

-- Alumnos asignados al entrenador logueado (en cualquier gimnasio)
create or replace function private.my_client_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select tc.member_id
    from public.trainer_clients tc
    join public.staff s on s.id = tc.trainer_id
   where s.user_id = auth.uid() and s.active
$$;

grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 11. Guardas anti-escalamiento de privilegios
-- ---------------------------------------------------------------------
create or replace function public.staff_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_my_role public.staff_role;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return coalesce(new, old);
  end if;
  -- bootstrap: el primer staff de una organización nueva es su owner
  -- (solo alcanzable vía create_organization, porque RLS exige staff.manage)
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
  -- solo un owner crea/modifica/elimina owners y admins
  if (coalesce(new.role, old.role) in ('owner', 'admin') or (tg_op = 'UPDATE' and old.role in ('owner', 'admin')))
     and v_my_role is distinct from 'owner' then
    raise exception 'ONLY_OWNER_CAN_MANAGE_ADMINS';
  end if;
  return coalesce(new, old);
end $$;
create trigger staff_guard before insert or update or delete on public.staff
  for each row execute function public.staff_guard();

-- Un socio puede editar sus datos de contacto, pero no su estado, su org,
-- su cuenta de facturación ni su vínculo de login.
create or replace function public.members_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role'
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
create trigger members_guard before update on public.members
  for each row execute function public.members_guard();

-- ---------------------------------------------------------------------
-- 12. Onboarding de un gimnasio nuevo (el que llama queda como owner)
-- ---------------------------------------------------------------------
create or replace function public.create_organization(p_name text, p_slug text, p_display_name text default null)
returns public.organizations
language plpgsql security definer set search_path = '' as $$
declare v_org public.organizations;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  insert into public.organizations (name, slug) values (p_name, lower(p_slug)) returning * into v_org;
  insert into public.locations (org_id, name) values (v_org.id, 'Sede principal');
  insert into public.staff (org_id, user_id, role, display_name)
  values (v_org.id, auth.uid(), 'owner',
          coalesce(p_display_name, (select full_name from public.profiles where id = auth.uid()), 'Owner'));
  return v_org;
end $$;
