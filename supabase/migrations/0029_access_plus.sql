-- =====================================================================
-- 0029 · Acceso, planes e invitados (molinete de musculación)
--
--   1. Horario por plan: membership_plans.access_windows
--        [{"days":[1,2,3,4,5],"from":"07:00","to":"14:00"}, ...]   (1 = lunes … 7 = domingo)
--        null = puede entrar siempre. Se evalúa en la hora del gimnasio.
--        Molinete: rechaza con OUTSIDE_PLAN_HOURS. Recepción: solo avisa (deja entrar).
--   2. Pases de un día / invitados: day_passes + day_pass_entries.
--        QR del pase (estático, se manda por WhatsApp): p1.<code>.<firma>
--        firma = HMAC-SHA256('pass:<org>:<code>', clave secreta del gimnasio), recortada.
--        Página pública /<gym>/pase/<code> (day_pass_public).
--        El molinete y recepción aceptan el QR: vigencia, entradas, anulado; descuenta una entrada.
--   3. Apto físico obligatorio (opcional por gimnasio, apagado por defecto):
--        molinete rechaza con MEDICAL_CERT_REQUIRED. Recepción solo avisa.
--   4. Concurrencia en vivo: gym_occupancy(p_org) = personas adentro estimadas + nivel.
--
-- Reglas de acceso por gimnasio: access_settings (una fila por gimnasio; sin fila = valores por defecto).
-- Dueño de turnstile_scan, member_gym_allowed y checkin_scan a partir de acá: 0029.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 · Horario por plan
-- ---------------------------------------------------------------------
create or replace function private.valid_access_windows(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare w jsonb; d jsonb;
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 14 then return false; end if;
  for w in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(w) <> 'object' or jsonb_typeof(w -> 'days') <> 'array' or jsonb_array_length(w -> 'days') = 0
       or coalesce(w ->> 'from', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or coalesce(w ->> 'to', '') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
       or (w ->> 'from') = (w ->> 'to') then
      return false;
    end if;
    for d in select * from jsonb_array_elements(w -> 'days') loop
      if jsonb_typeof(d) <> 'number' or d::text !~ '^[1-7]$' then return false; end if;
    end loop;
  end loop;
  return true;
end $$;

alter table public.membership_plans add column if not exists access_windows jsonb;
do $$ begin
  alter table public.membership_plans add constraint membership_plans_access_windows_check
    check (private.valid_access_windows(access_windows));
exception when duplicate_object then null; end $$;
comment on column public.membership_plans.access_windows is
  'Franjas en que el plan puede entrar a musculación: [{"days":[1..7],"from":"HH:MM","to":"HH:MM"}]. null = siempre.';

-- ¿La hora local (del gimnasio) cae dentro de alguna franja? null / [] = siempre
create or replace function private.plan_window_ok(p_windows jsonb, p_local timestamp) returns boolean
language sql immutable set search_path = '' as $$
  select p_windows is null or jsonb_typeof(p_windows) <> 'array' or jsonb_array_length(p_windows) = 0
      or exists (
        select 1 from jsonb_array_elements(p_windows) w
         where (w -> 'days') @> to_jsonb(extract(isodow from p_local)::int)
           and case when (w ->> 'from')::time < (w ->> 'to')::time or (w ->> 'to') = '24:00'
                    then p_local::time >= (w ->> 'from')::time
                         and ((w ->> 'to') = '24:00' or p_local::time < (w ->> 'to')::time)
                    else p_local::time >= (w ->> 'from')::time or p_local::time < (w ->> 'to')::time   -- cruza la medianoche
               end)
$$;

-- ---------------------------------------------------------------------
-- Reglas de acceso por gimnasio
-- ---------------------------------------------------------------------
create table if not exists public.access_settings (
  org_id                   uuid primary key references public.organizations (id) on delete cascade,
  guest_passes_per_month   int  not null default 1  check (guest_passes_per_month between 0 and 10),
  require_medical_cert     boolean not null default false,
  avg_stay_minutes         int  not null default 75 check (avg_stay_minutes between 15 and 300),
  capacity                 int  not null default 60 check (capacity between 1 and 2000),
  updated_at               timestamptz not null default now(),
  updated_by               uuid
);
alter table public.access_settings enable row level security;
revoke all on public.access_settings from anon;
revoke insert, update, delete on public.access_settings from authenticated;
grant select on public.access_settings to authenticated;
grant all on public.access_settings to service_role;
drop policy if exists access_settings_select on public.access_settings;
create policy access_settings_select on public.access_settings for select to authenticated
  using ((select private.has_permission(org_id, 'org.manage')) or (select private.has_permission(org_id, 'checkins.manage')));

-- Valores vigentes (con los por defecto si el gimnasio nunca los cambió)
create or replace function private.access_settings_for(p_org uuid) returns public.access_settings
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select s from public.access_settings s where s.org_id = p_org),
    row(p_org, 1, false, 75, 60, now(), null)::public.access_settings)
$$;

create or replace function public.access_settings_save(
  p_org uuid, p_guest_passes_per_month int, p_require_medical_cert boolean, p_avg_stay_minutes int, p_capacity int
) returns public.access_settings
language plpgsql security definer set search_path = '' as $$
declare r public.access_settings;
begin
  if not private.has_permission(p_org, 'org.manage') then raise exception 'FORBIDDEN'; end if;
  insert into public.access_settings as s (org_id, guest_passes_per_month, require_medical_cert, avg_stay_minutes, capacity, updated_at, updated_by)
  values (p_org, p_guest_passes_per_month, p_require_medical_cert, p_avg_stay_minutes, p_capacity, now(), auth.uid())
  on conflict (org_id) do update
     set guest_passes_per_month = excluded.guest_passes_per_month,
         require_medical_cert   = excluded.require_medical_cert,
         avg_stay_minutes       = excluded.avg_stay_minutes,
         capacity               = excluded.capacity,
         updated_at = now(), updated_by = auth.uid()
  returning * into r;
  return r;
end $$;
revoke execute on function public.access_settings_save(uuid, int, boolean, int, int) from public, anon;
grant execute on function public.access_settings_save(uuid, int, boolean, int, int) to authenticated;

-- ---------------------------------------------------------------------
-- Regla del molinete de musculación (una sola fuente de verdad)
--   null = puede entrar · si no, el motivo:
--   MEMBER_NOT_FOUND | MEMBER_FROZEN | MEMBER_ARCHIVED | PAYMENT_PAST_DUE | OUTSIDE_PLAN_HOURS
--   | MEDICAL_CERT_REQUIRED | MEMBERSHIP_EXPIRED | PLAN_WITHOUT_GYM | NO_ACTIVE_MEMBERSHIP
-- ---------------------------------------------------------------------
create or replace function private.member_gym_access(p_member uuid, p_at timestamptz default now()) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  m       public.members;
  v_org   public.organizations;
  v_local timestamp;
  v_ok    boolean;
  v_set   public.access_settings;
begin
  select * into m from public.members where id = p_member;
  if not found then return 'MEMBER_NOT_FOUND'; end if;
  if m.status in ('frozen', 'archived') then return 'MEMBER_' || upper(m.status::text); end if;
  if coalesce((select ba.delinquent from public.billing_accounts ba where ba.id = m.billing_account_id), false) then
    return 'PAYMENT_PAST_DUE';
  end if;
  select * into v_org from public.organizations where id = m.org_id;
  v_local := p_at at time zone v_org.timezone;

  if m.status <> 'lead' then
    -- null = ningún plan de musculación vigente; false = vigente pero fuera de su horario
    select bool_or(private.plan_window_ok(p.access_windows, v_local)) into v_ok
      from public.membership_members mm
      join public.memberships ms on ms.id = mm.membership_id
      join public.membership_plans p on p.id = ms.plan_id
      join public.billing_accounts ba on ba.id = ms.billing_account_id
     where mm.member_id = m.id and p.includes_open_gym
       and ms.status in ('active', 'trialing')
       and not ba.delinquent
       and (ms.paused_until is null or ms.paused_until <= p_at)
       and p_at >= ms.current_period_start - interval '1 day'
       and p_at < ms.current_period_end + make_interval(days => v_org.grace_days);
    if v_ok is not null then
      if not v_ok then return 'OUTSIDE_PLAN_HOURS'; end if;
      v_set := private.access_settings_for(m.org_id);
      if v_set.require_medical_cert
         and (m.medical_cert_path is null or m.medical_cert_expires_on < v_local::date) then
        return 'MEDICAL_CERT_REQUIRED';
      end if;
      return null;
    end if;
  end if;

  if exists (select 1 from public.membership_members mm join public.memberships ms on ms.id = mm.membership_id
              join public.membership_plans p on p.id = ms.plan_id
              where mm.member_id = m.id and p.includes_open_gym) then
    return 'MEMBERSHIP_EXPIRED';
  end if;
  if exists (select 1 from public.membership_members mm join public.memberships ms on ms.id = mm.membership_id
              where mm.member_id = m.id and ms.status in ('active', 'trialing')) then
    return 'PLAN_WITHOUT_GYM';
  end if;
  return 'NO_ACTIVE_MEMBERSHIP';
end $$;
revoke execute on function private.member_gym_access(uuid, timestamptz) from public, anon, authenticated;

-- Misma firma que en 0024 (la usan otras funciones): ahora también mira horario y apto
create or replace function private.member_gym_allowed(p_member uuid, p_at timestamptz default now()) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.member_gym_access(p_member, p_at) is null
$$;
revoke execute on function private.member_gym_allowed(uuid, timestamptz) from public, anon, authenticated;

-- Franjas del plan de musculación vigente del socio (para el mensaje "Tu plan permite entrar de 7 a 14 h")
create or replace function private.member_access_windows(p_member uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select p.access_windows
    from public.membership_members mm
    join public.memberships ms on ms.id = mm.membership_id
    join public.membership_plans p on p.id = ms.plan_id
   where mm.member_id = p_member and p.includes_open_gym and ms.status in ('active', 'trialing')
     and p.access_windows is not null
   order by ms.current_period_end desc
   limit 1
$$;
revoke execute on function private.member_access_windows(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2 · Pases de un día / invitados
-- ---------------------------------------------------------------------
create table if not exists public.day_passes (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete cascade,
  code               text not null unique check (code ~ '^[A-Z0-9]{6,12}$'),
  kind               text not null check (kind in ('guest', 'trial', 'day')),
  holder_name        text not null check (length(trim(holder_name)) between 2 and 120),
  holder_phone       text,
  holder_email       text,
  holder_document    text,
  invited_by_member  uuid references public.members (id) on delete set null,
  valid_from         timestamptz not null,
  valid_until        timestamptz not null,
  max_entries        int not null default 1 check (max_entries between 1 and 60),
  entries_used       int not null default 0 check (entries_used >= 0),
  price_cents        bigint check (price_cents is null or price_cents >= 0),
  payment_method     text check (payment_method in ('cash', 'transfer', 'mercadopago', 'card_terminal', 'other')),
  payment_id         uuid references public.payments (id) on delete set null,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  revoked_at         timestamptz,
  revoked_by         uuid,
  check (valid_until > valid_from)
);
create index if not exists day_passes_org_idx on public.day_passes (org_id, created_at desc);
create index if not exists day_passes_inviter_idx on public.day_passes (invited_by_member, created_at desc) where invited_by_member is not null;
create index if not exists day_passes_doc_idx on public.day_passes (org_id, holder_document) where holder_document is not null;

-- Cada entrada con un pase (checkins exige socio: los pases tienen su propio registro)
create table if not exists public.day_pass_entries (
  id           bigint generated always as identity primary key,
  org_id       uuid not null references public.organizations (id) on delete cascade,
  pass_id      uuid not null references public.day_passes (id) on delete cascade,
  location_id  uuid,
  device_id    uuid references public.access_devices (id) on delete set null,
  method       text not null default 'qr' check (method in ('qr', 'manual')),
  unlock_id    bigint,                         -- orden "abrir" del molinete (si fue por el molinete)
  failed       boolean not null default false, -- el molinete no abrió: no cuenta
  scanned_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists day_pass_entries_org_idx on public.day_pass_entries (org_id, created_at desc);
create index if not exists day_pass_entries_pass_idx on public.day_pass_entries (pass_id, created_at desc);

alter table public.day_passes enable row level security;
alter table public.day_pass_entries enable row level security;
revoke all on public.day_passes, public.day_pass_entries from anon;
revoke insert, update, delete on public.day_passes, public.day_pass_entries from authenticated;
grant select on public.day_passes, public.day_pass_entries to authenticated;
grant all on public.day_passes, public.day_pass_entries to service_role;

drop policy if exists day_passes_select on public.day_passes;
create policy day_passes_select on public.day_passes for select to authenticated
  using ((select private.has_permission(org_id, 'checkins.manage'))
         or invited_by_member in (select private.actable_member_ids()));
drop policy if exists day_pass_entries_select on public.day_pass_entries;
create policy day_pass_entries_select on public.day_pass_entries for select to authenticated
  using ((select private.has_permission(org_id, 'checkins.manage')));

-- Clave secreta de cada gimnasio para firmar los QR de los pases (nunca sale de la base)
create table if not exists private.day_pass_keys (
  org_id  uuid primary key references public.organizations (id) on delete cascade,
  secret  bytea not null default extensions.gen_random_bytes(32)
);
revoke all on private.day_pass_keys from public, anon, authenticated;

create or replace function private.day_pass_signature(p_org uuid, p_code text) returns text
language sql stable security definer set search_path = '' as $$
  select left(encode(extensions.hmac(convert_to('pass:' || p_org::text || ':' || p_code, 'UTF8'), k.secret, 'sha256'), 'hex'), 24)
    from private.day_pass_keys k where k.org_id = p_org
$$;
revoke execute on function private.day_pass_signature(uuid, text) from public, anon, authenticated;

create or replace function private.day_pass_qr(p_org uuid, p_code text) returns text
language sql stable security definer set search_path = '' as $$
  select 'p1.' || p_code || '.' || private.day_pass_signature(p_org, p_code)
$$;
revoke execute on function private.day_pass_qr(uuid, text) from public, anon, authenticated;

-- Código corto, sin letras que se confunden (sin I, O, 0, 1)
create or replace function private.day_pass_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  a text  := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(10);
  r text  := '';
begin
  for i in 0..9 loop r := r || substr(a, (get_byte(b, i) % 32) + 1, 1); end loop;
  return r;
end $$;
revoke execute on function private.day_pass_code() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Emisión reutilizable (recepción, socio que invita, y más adelante la venta online)
--   No chequea permisos: lo hace quien la llama.
--   p_payment_id: cobro registrado por el frente de pagos (opcional).
-- ---------------------------------------------------------------------
create or replace function private.issue_day_pass(
  p_org             uuid,
  p_kind            text,
  p_holder_name     text,
  p_holder_phone    text,
  p_holder_email    text,
  p_holder_document text,
  p_valid_from      timestamptz,
  p_valid_until     timestamptz,
  p_max_entries     int default 1,
  p_price_cents     bigint default null,
  p_payment_method  text default null,
  p_payment_id      uuid default null,
  p_invited_by      uuid default null,
  p_created_by      uuid default auth.uid()
) returns public.day_passes
language plpgsql security definer set search_path = '' as $$
declare
  r      public.day_passes;
  v_code text;
begin
  if coalesce(length(trim(p_holder_name)), 0) < 2 then raise exception 'NAME_REQUIRED'; end if;
  if p_kind not in ('guest', 'trial', 'day') then raise exception 'INVALID_PASS_KIND'; end if;
  if p_valid_until <= p_valid_from then raise exception 'INVALID_VALIDITY'; end if;
  insert into private.day_pass_keys (org_id) values (p_org) on conflict (org_id) do nothing;
  for i in 1..8 loop
    v_code := private.day_pass_code();
    exit when not exists (select 1 from public.day_passes where code = v_code);
  end loop;
  insert into public.day_passes (org_id, code, kind, holder_name, holder_phone, holder_email, holder_document,
                                 invited_by_member, valid_from, valid_until, max_entries, price_cents,
                                 payment_method, payment_id, created_by)
  values (p_org, v_code, p_kind, trim(p_holder_name), nullif(trim(coalesce(p_holder_phone, '')), ''),
          nullif(lower(trim(coalesce(p_holder_email, ''))), ''),
          nullif(regexp_replace(coalesce(p_holder_document, ''), '\D', '', 'g'), ''),
          p_invited_by, p_valid_from, p_valid_until, greatest(1, coalesce(p_max_entries, 1)), p_price_cents,
          case when p_price_cents is not null and p_price_cents > 0 then p_payment_method end, p_payment_id, p_created_by)
  returning * into r;
  insert into public.domain_events (org_id, type, member_id, payload)
  values (p_org, 'day_pass.issued', p_invited_by,
          jsonb_build_object('pass_id', r.id, 'kind', r.kind, 'price_cents', r.price_cents, 'payment_method', r.payment_method,
                             'holder_phone', r.holder_phone, 'holder_email', r.holder_email));
  return r;
end $$;
revoke execute on function private.issue_day_pass(uuid, text, text, text, text, text, timestamptz, timestamptz, int, bigint, text, uuid, uuid, uuid)
  from public, anon, authenticated;

-- Inicio del día local (del gimnasio) + n días, como timestamptz
create or replace function private.local_day_start(p_org uuid, p_days int default 0) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select ((now() at time zone o.timezone)::date + p_days)::timestamp at time zone o.timezone
    from public.organizations o where o.id = p_org
$$;
revoke execute on function private.local_day_start(uuid, int) from public, anon, authenticated;

-- Panel → Pases: "Pase de prueba" / "Pase por día" (recepción)
create or replace function public.day_pass_issue(
  p_org uuid, p_kind text, p_holder_name text, p_holder_phone text default null, p_holder_document text default null,
  p_holder_email text default null, p_days int default 1, p_max_entries int default 1,
  p_price_cents bigint default null, p_payment_method text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.day_passes;
begin
  if not private.has_permission(p_org, 'checkins.manage') then raise exception 'FORBIDDEN'; end if;
  if p_kind not in ('trial', 'day') then raise exception 'INVALID_PASS_KIND'; end if;
  if p_days not between 1 and 31 then raise exception 'INVALID_VALIDITY'; end if;
  if p_max_entries not between 1 and 60 then raise exception 'INVALID_ENTRIES'; end if;
  if p_price_cents is not null and p_price_cents > 0
     and coalesce(p_payment_method, '') not in ('cash', 'transfer', 'mercadopago', 'card_terminal', 'other') then
    raise exception 'PAYMENT_METHOD_REQUIRED';
  end if;
  r := private.issue_day_pass(p_org, p_kind, p_holder_name, p_holder_phone, p_holder_email, p_holder_document,
                              now(), private.local_day_start(p_org, p_days), p_max_entries,
                              nullif(p_price_cents, 0), p_payment_method, null, null, auth.uid());
  return jsonb_build_object('id', r.id, 'code', r.code, 'qr', private.day_pass_qr(r.org_id, r.code),
                            'valid_until', r.valid_until);
end $$;
revoke execute on function public.day_pass_issue(uuid, text, text, text, text, text, int, int, bigint, text) from public, anon;
grant execute on function public.day_pass_issue(uuid, text, text, text, text, text, int, int, bigint, text) to authenticated;

-- Anular: recepción cualquiera; el socio, los de sus invitados que todavía no se usaron
create or replace function public.day_pass_revoke(p_pass uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.day_passes;
begin
  select * into r from public.day_passes where id = p_pass for update;
  if not found then raise exception 'PASS_NOT_FOUND'; end if;
  if not private.has_permission(r.org_id, 'checkins.manage') then
    if r.invited_by_member is null or r.invited_by_member not in (select private.actable_member_ids()) then
      raise exception 'FORBIDDEN';
    end if;
    if r.entries_used > 0 then raise exception 'PASS_ALREADY_USED'; end if;
  end if;
  if r.revoked_at is null then
    update public.day_passes set revoked_at = now(), revoked_by = auth.uid() where id = r.id;
  end if;
end $$;
revoke execute on function public.day_pass_revoke(uuid) from public, anon;
grant execute on function public.day_pass_revoke(uuid) to authenticated;

-- Invitados de un socio: cupo del mes y si puede invitar
create or replace function private.guest_quota(p_member uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  m       public.members;
  v_set   public.access_settings;
  v_tz    text;
  v_month timestamptz;
  v_used  int;
  v_rule  text;
begin
  select * into m from public.members where id = p_member;
  if not found then return jsonb_build_object('can_invite', false, 'reason', 'MEMBER_NOT_FOUND'); end if;
  v_set := private.access_settings_for(m.org_id);
  select timezone into v_tz from public.organizations where id = m.org_id;
  v_month := date_trunc('month', now() at time zone v_tz) at time zone v_tz;
  -- cuentan los del mes, salvo los anulados sin usar
  select count(*) into v_used from public.day_passes
   where invited_by_member = m.id and kind = 'guest' and created_at >= v_month
     and (revoked_at is null or entries_used > 0);
  v_rule := private.member_gym_access(m.id, now());
  return jsonb_build_object(
    'quota', v_set.guest_passes_per_month,
    'used', v_used,
    'left', greatest(0, v_set.guest_passes_per_month - v_used),
    'can_invite', v_set.guest_passes_per_month > 0 and v_used < v_set.guest_passes_per_month
                  and (v_rule is null or v_rule in ('OUTSIDE_PLAN_HOURS', 'MEDICAL_CERT_REQUIRED')),
    'reason', case when v_set.guest_passes_per_month = 0 then 'GUESTS_DISABLED'
                   when not (v_rule is null or v_rule in ('OUTSIDE_PLAN_HOURS', 'MEDICAL_CERT_REQUIRED')) then 'PLAN_NOT_CURRENT'
                   when v_used >= v_set.guest_passes_per_month then 'GUEST_LIMIT_REACHED' end);
end $$;
revoke execute on function private.guest_quota(uuid) from public, anon, authenticated;

create or replace function public.member_guest_quota(p_member uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_member is null or p_member not in (select private.actable_member_ids()) then raise exception 'FORBIDDEN'; end if;
  return private.guest_quota(p_member);
end $$;
revoke execute on function public.member_guest_quota(uuid) from public, anon;
grant execute on function public.member_guest_quota(uuid) to authenticated;

-- App del socio → Invitados: pase de 1 entrada para el día elegido (hoy … +30 días)
create or replace function public.member_issue_guest_pass(
  p_member uuid, p_holder_name text, p_holder_document text, p_date date default null, p_holder_phone text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m       public.members;
  v_q     jsonb;
  v_doc   text := nullif(regexp_replace(coalesce(p_holder_document, ''), '\D', '', 'g'), '');
  v_tz    text;
  v_today date;
  v_date  date;
  r       public.day_passes;
begin
  if p_member is null or p_member not in (select private.actable_member_ids()) then raise exception 'FORBIDDEN'; end if;
  select * into m from public.members where id = p_member;
  if coalesce(length(trim(p_holder_name)), 0) < 2 then raise exception 'NAME_REQUIRED'; end if;
  if v_doc is null or length(v_doc) not between 6 and 9 then raise exception 'DOCUMENT_REQUIRED'; end if;
  -- candado por socio: dos pedidos a la vez no se pasan del cupo
  perform 1 from public.members where id = m.id for update;
  v_q := private.guest_quota(m.id);
  if not (v_q ->> 'can_invite')::boolean then raise exception '%', v_q ->> 'reason'; end if;
  if exists (select 1 from public.members x where x.org_id = m.org_id and x.document_id = v_doc and x.status <> 'archived') then
    raise exception 'GUEST_IS_MEMBER';
  end if;
  select timezone into v_tz from public.organizations where id = m.org_id;
  v_today := (now() at time zone v_tz)::date;
  v_date := coalesce(p_date, v_today);
  if v_date < v_today or v_date > v_today + 30 then raise exception 'INVALID_VALIDITY'; end if;
  -- la misma persona, una vez por mes como invitada (en todo el gimnasio)
  if exists (select 1 from public.day_passes d where d.org_id = m.org_id and d.kind = 'guest' and d.holder_document = v_doc
               and d.created_at >= date_trunc('month', now() at time zone v_tz) at time zone v_tz
               and (d.revoked_at is null or d.entries_used > 0)) then
    raise exception 'GUEST_ALREADY_INVITED';
  end if;
  r := private.issue_day_pass(m.org_id, 'guest', p_holder_name, p_holder_phone, null, v_doc,
                              greatest(now(), v_date::timestamp at time zone v_tz), (v_date + 1)::timestamp at time zone v_tz,
                              1, null, null, null, m.id, auth.uid());
  return jsonb_build_object('id', r.id, 'code', r.code, 'valid_from', r.valid_from, 'valid_until', r.valid_until);
end $$;
revoke execute on function public.member_issue_guest_pass(uuid, text, text, date, text) from public, anon;
grant execute on function public.member_issue_guest_pass(uuid, text, text, date, text) to authenticated;

-- Página pública del pase (/<gym>/pase/<code>): sin login, con el código como llave
create or replace function public.day_pass_public(p_slug text, p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  o public.organizations;
  r public.day_passes;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if v_code !~ '^[A-Z0-9]{6,12}$' then return null; end if;
  select * into o from public.organizations where slug = p_slug;
  if not found then return null; end if;
  select * into r from public.day_passes where org_id = o.id and code = v_code;
  if not found then return null; end if;
  return jsonb_build_object(
    'gym', o.name, 'timezone', o.timezone, 'code', r.code, 'kind', r.kind, 'holder_name', r.holder_name,
    'valid_from', r.valid_from, 'valid_until', r.valid_until,
    'max_entries', r.max_entries, 'entries_used', r.entries_used,
    'status', case when r.revoked_at is not null then 'revoked'
                   when now() >= r.valid_until then 'expired'
                   when r.entries_used >= r.max_entries then 'used'
                   when now() < r.valid_from then 'upcoming'
                   else 'valid' end,
    'qr', case when r.revoked_at is null and now() < r.valid_until and r.entries_used < r.max_entries
               then private.day_pass_qr(o.id, r.code) end);
end $$;
revoke execute on function public.day_pass_public(text, text) from public;
grant execute on function public.day_pass_public(text, text) to anon, authenticated;

-- ¿Este QR de pase sirve ahora? Devuelve {reason} o {pass_id}
create or replace function private.day_pass_check(p_org uuid, p_qr text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_parts text[] := string_to_array(trim(coalesce(p_qr, '')), '.');
  r public.day_passes;
begin
  if coalesce(array_length(v_parts, 1), 0) <> 3 or v_parts[1] <> 'p1' or v_parts[2] !~ '^[A-Z0-9]{6,12}$'
     or v_parts[3] !~ '^[0-9a-f]{24}$' then
    return jsonb_build_object('reason', 'QR_INVALID');
  end if;
  if private.day_pass_signature(p_org, v_parts[2]) is distinct from v_parts[3] then
    return jsonb_build_object('reason', 'PASS_INVALID');
  end if;
  select * into r from public.day_passes where org_id = p_org and code = v_parts[2];
  if not found then return jsonb_build_object('reason', 'PASS_INVALID'); end if;
  return jsonb_build_object('pass_id', r.id, 'first_name', split_part(r.holder_name, ' ', 1), 'holder_name', r.holder_name,
    'reason', case when r.revoked_at is not null then 'PASS_REVOKED'
                   when now() < r.valid_from then 'PASS_NOT_YET_VALID'
                   when now() >= r.valid_until then 'PASS_EXPIRED'
                   when r.entries_used >= r.max_entries then 'PASS_USED_UP' end);
end $$;
revoke execute on function private.day_pass_check(uuid, text) from public, anon, authenticated;

-- Entradas que no abrieron el molinete no cuentan (se recalcula antes de validar)
create or replace function private.day_pass_refresh(p_pass uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.day_pass_entries e set failed = true
    from public.access_commands c
   where e.pass_id = p_pass and not e.failed and e.unlock_id = c.id and c.status in ('error', 'superseded');
  update public.day_passes d set entries_used = (select count(*) from public.day_pass_entries e where e.pass_id = d.id and not e.failed)
   where d.id = p_pass;
end $$;
revoke execute on function private.day_pass_refresh(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4 · Concurrencia en vivo (sin nombres)
-- ---------------------------------------------------------------------
create or replace function private.gym_occupancy_calc(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org    public.organizations;
  v_set    public.access_settings;
  v_since  timestamptz;
  v_people int;
  v_local  timestamp;
  v_open   boolean;
  v_level  text;
begin
  select * into v_org from public.organizations where id = p_org;
  if not found then return null; end if;
  v_set   := private.access_settings_for(p_org);
  v_since := now() - make_interval(mins => v_set.avg_stay_minutes);
  v_people := (select count(distinct c.member_id) from public.checkins c
                where c.org_id = p_org and c.allowed and c.created_at >= v_since)
            + (select count(distinct e.pass_id) from public.day_pass_entries e
                where e.org_id = p_org and not e.failed and e.created_at >= v_since);
  v_local := now() at time zone v_org.timezone;
  v_open := coalesce(jsonb_array_length(v_org.opening_hours), 0) = 0
            or exists (select 1 from jsonb_array_elements(v_org.opening_hours) d
                        where (d ->> 'weekday')::int = extract(isodow from v_local)::int
                          and v_local::time >= (d ->> 'open')::time and v_local::time < (d ->> 'close')::time);
  v_level := case when not v_open and v_people = 0 then 'closed'
                  when v_people >= ceil(v_set.capacity * 0.8) then 'full'
                  when v_people >= ceil(v_set.capacity * 0.4) then 'normal'
                  else 'quiet' end;
  return jsonb_build_object('people', v_people, 'level', v_level, 'capacity', v_set.capacity,
                            'window_minutes', v_set.avg_stay_minutes, 'at', now());
end $$;
revoke execute on function private.gym_occupancy_calc(uuid) from public, anon, authenticated;

create or replace function public.gym_occupancy(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_org is null or p_org not in (select private.my_org_ids()) then raise exception 'FORBIDDEN'; end if;
  return private.gym_occupancy_calc(p_org);
end $$;
revoke execute on function public.gym_occupancy(uuid) from public, anon;
grant execute on function public.gym_occupancy(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Tablet del molinete: QR de socios (v1.…) y de pases (p1.…)
-- ---------------------------------------------------------------------
create or replace function public.turnstile_scan(p_kiosk_token text, p_qr text, p_unlock bigint default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d          public.access_devices;
  v_org      public.organizations;
  v_parts    text[];
  v_step     bigint;
  v_now_step bigint;
  m          public.members;
  v_allowed  boolean;
  v_reason   text;
  v_last     public.access_commands;
  v_online   boolean;
  v_cmd      public.access_commands;
  v_unlock   bigint;
  v_chk      jsonb;
  v_pass     public.day_passes;
  v_entry    public.day_pass_entries;
begin
  if coalesce(p_kiosk_token, '') !~ '^[0-9a-f]{48}$' then return jsonb_build_object('status', 'unauthorized'); end if;
  select * into d from public.access_devices
   where kiosk_token_hash = encode(extensions.digest(p_kiosk_token, 'sha256'), 'hex');
  if not found then return jsonb_build_object('status', 'unauthorized'); end if;
  select * into v_org from public.organizations where id = d.org_id;

  -- Esta fila funciona también como candado: dos lecturas a la vez del mismo molinete se ordenan acá
  update public.access_devices set info = info || jsonb_build_object('kiosk_seen_at', now()) where id = d.id;
  v_online := d.active and d.agent_token_hash is not null
              and coalesce((d.info ->> 'agent_seen_at')::timestamptz > now() - interval '45 seconds', false);

  -- ¿Abrió? (la tablet pregunta hasta que el intermediario confirma)
  if p_unlock is not null then
    select * into v_cmd from public.access_commands where id = p_unlock and device_id = d.id and kind = 'unlock';
    return jsonb_build_object('status', 'ok', 'unlock',
      case when v_cmd.id is null then 'unknown' when v_cmd.status = 'ok' then 'opened'
           when v_cmd.status in ('error', 'superseded') then 'failed' else 'waiting' end);
  end if;

  if p_qr is null then      -- latido de la tablet (molinete conectado + concurrencia, sin nombres)
    return jsonb_build_object('status', 'ok', 'opener_online', v_online, 'device', d.name,
                              'occupancy', private.gym_occupancy_calc(d.org_id));
  end if;

  -- ---------- Pase de un día / invitado ----------
  if left(trim(p_qr), 3) = 'p1.' then
    v_chk := private.day_pass_check(d.org_id, p_qr);
    if v_chk ->> 'pass_id' is null then
      return jsonb_build_object('status', 'ok', 'allowed', false, 'reason', v_chk ->> 'reason', 'opener_online', v_online, 'guest', true);
    end if;
    select * into v_pass from public.day_passes where id = (v_chk ->> 'pass_id')::uuid for update;
    perform private.day_pass_refresh(v_pass.id);
    select * into v_pass from public.day_passes where id = v_pass.id;

    -- sigue frente a la cámara: la última entrada de este pase en este molinete (que no falló)
    select e.* into v_entry from public.day_pass_entries e
      left join public.access_commands c on c.id = e.unlock_id
     where e.pass_id = v_pass.id and e.device_id = d.id and not e.failed
       and coalesce(c.status, 'ok') in ('pending', 'sent', 'ok')
       and e.created_at > now() - interval '3 minutes'
     order by e.id desc limit 1;
    if v_entry.id is not null and v_entry.created_at > now() - interval '60 seconds' then
      return jsonb_build_object('status', 'ok', 'allowed', true, 'duplicate', true, 'opener_online', v_online, 'guest', true,
                                'first_name', v_chk ->> 'first_name', 'unlock_id', v_entry.unlock_id);
    end if;
    if v_entry.id is not null then
      return jsonb_build_object('status', 'ok', 'allowed', false, 'reason', 'RECENT_ENTRY', 'opener_online', v_online,
                                'guest', true, 'first_name', v_chk ->> 'first_name');
    end if;

    v_reason := case when v_pass.revoked_at is not null then 'PASS_REVOKED'
                     when now() < v_pass.valid_from then 'PASS_NOT_YET_VALID'
                     when now() >= v_pass.valid_until then 'PASS_EXPIRED'
                     when v_pass.entries_used >= v_pass.max_entries then 'PASS_USED_UP' end;
    if v_reason is not null then
      return jsonb_build_object('status', 'ok', 'allowed', false, 'reason', v_reason, 'opener_online', v_online,
                                'guest', true, 'first_name', v_chk ->> 'first_name');
    end if;
    if not v_online then
      return jsonb_build_object('status', 'ok', 'allowed', false, 'reason', 'TURNSTILE_OFFLINE', 'opener_online', false,
                                'guest', true, 'first_name', v_chk ->> 'first_name');
    end if;

    v_unlock := private.access_queue(d.id, d.org_id, null, null, 'unlock', 'UNLOCK 1');
    insert into public.day_pass_entries (org_id, pass_id, location_id, device_id, method, unlock_id)
    values (d.org_id, v_pass.id, d.location_id, d.id, 'qr', v_unlock);
    update public.day_passes set entries_used = entries_used + 1 where id = v_pass.id;
    insert into public.domain_events (org_id, type, member_id, payload)
    values (d.org_id, 'day_pass.entry', v_pass.invited_by_member,
            jsonb_build_object('pass_id', v_pass.id, 'kind', v_pass.kind, 'source', 'turnstile_qr', 'device_id', d.id));
    return jsonb_build_object('status', 'ok', 'allowed', true, 'opener_online', v_online, 'guest', true,
                              'first_name', v_chk ->> 'first_name', 'unlock_id', v_unlock,
                              'entries_left', v_pass.max_entries - v_pass.entries_used - 1);
  end if;

  -- ---------- QR de la app del socio (mismo formato y firma que get_checkin_token / checkin_scan) ----------
  v_parts := string_to_array(trim(p_qr), '.');
  if coalesce(array_length(v_parts, 1), 0) <> 4 or v_parts[1] <> 'v1'
     or v_parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or v_parts[3] !~ '^[0-9]{1,12}$' then
    return jsonb_build_object('status', 'ok', 'allowed', false, 'reason', 'QR_INVALID', 'opener_online', v_online);
  end if;
  v_step     := v_parts[3]::bigint;
  v_now_step := floor(extract(epoch from now()) / v_org.qr_step_seconds)::bigint;
  if v_step not in (v_now_step, v_now_step - 1)
     or private.qr_signature(v_parts[2]::uuid, v_step) is distinct from v_parts[4] then
    return jsonb_build_object('status', 'ok', 'allowed', false, 'reason', 'QR_EXPIRED_OR_INVALID', 'opener_online', v_online);
  end if;
  select * into m from public.members where id = v_parts[2]::uuid and org_id = d.org_id;
  if not found then
    return jsonb_build_object('status', 'ok', 'allowed', false, 'reason', 'MEMBER_NOT_FOUND', 'opener_online', v_online);
  end if;

  -- Molinete sin intermediario conectado (o pausado): no se registra nada, que pase por recepción
  if not v_online then
    return jsonb_build_object('status', 'ok', 'allowed', false, 'reason', 'TURNSTILE_OFFLINE', 'opener_online', false,
                              'first_name', m.first_name);
  end if;

  v_reason  := private.member_gym_access(m.id, now());
  v_allowed := v_reason is null;

  -- Última apertura de este socio en este molinete que no falló (una que no abrió no cuenta)
  select c.* into v_last from public.access_commands c
   where c.device_id = d.id and c.kind = 'unlock' and c.member_id = m.id and c.status in ('pending', 'sent', 'ok')
     and c.created_at > now() - interval '3 minutes'
   order by c.id desc limit 1;

  if v_allowed and v_last.id is not null and v_last.created_at > now() - interval '60 seconds' then
    -- sigue frente a la cámara con el mismo QR: no se abre otra vez ni se registra nada
    return jsonb_build_object('status', 'ok', 'allowed', true, 'duplicate', true, 'opener_online', v_online,
                              'first_name', m.first_name, 'unlock_id', v_last.id);
  end if;
  if v_allowed and v_last.id is not null then
    v_allowed := false;
    v_reason  := 'RECENT_ENTRY';
  end if;

  -- Rechazos: uno solo por minuto por socio (la tablet relee el mismo QR mientras está frente a la cámara)
  if not v_allowed and exists (select 1 from public.checkins c where c.member_id = m.id and not c.allowed
                                 and c.method = 'qr' and c.location_id = d.location_id
                                 and c.created_at > now() - interval '60 seconds') then
    return jsonb_build_object('status', 'ok', 'allowed', false, 'reason', v_reason, 'opener_online', v_online,
                              'first_name', m.first_name,
                              'access_windows', case when v_reason = 'OUTSIDE_PLAN_HOURS' then private.member_access_windows(m.id) end);
  end if;

  perform set_config('app.access_sync', 'on', true);
  insert into public.checkins (org_id, location_id, member_id, method, allowed, reason, created_at)
  values (d.org_id, d.location_id, m.id, 'qr', v_allowed, v_reason, now());
  insert into public.domain_events (org_id, type, member_id, payload)
  values (d.org_id, case when v_allowed then 'checkin.allowed' else 'checkin.denied' end, m.id,
          jsonb_build_object('source', 'turnstile_qr', 'device_id', d.id, 'location_id', d.location_id, 'reason', v_reason));

  if v_allowed then
    update public.members set last_checkin_at = now() where id = m.id;
    v_unlock := private.access_queue(d.id, d.org_id, m.access_pin, m.id, 'unlock', 'UNLOCK 1');
  end if;
  -- (las aperturas viejas se limpian con el resto de la cola: access_cleanup, 30 días)

  return jsonb_build_object('status', 'ok', 'allowed', v_allowed, 'reason', v_reason, 'opener_online', v_online,
                            'first_name', m.first_name, 'unlock_id', v_unlock,
                            'access_windows', case when v_reason = 'OUTSIDE_PLAN_HOURS' then private.member_access_windows(m.id) end);
end $$;
revoke execute on function public.turnstile_scan(text, text, bigint) from public, anon, authenticated;
grant execute on function public.turnstile_scan(text, text, bigint) to service_role;

-- ---------------------------------------------------------------------
-- Recepción: igual que antes + avisos (fuera de horario / apto) + QR de pases
-- ---------------------------------------------------------------------
create or replace function public.checkin_scan(
  p_location_id uuid,
  p_token       text default null,
  p_member_id   uuid default null,          -- ingreso manual (sin QR)
  p_method      public.checkin_method default 'qr'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_loc      public.locations;
  v_org      public.organizations;
  v_parts    text[];
  v_member   public.members;
  v_step     bigint;
  v_now_step bigint;
  v_allowed  boolean := false;
  v_reason   text;
  v_booking  public.bookings;
  v_last     public.checkins;
  v_warn     text;
  v_warnings jsonb := '[]'::jsonb;
  v_chk      jsonb;
  v_pass     public.day_passes;
  v_dup      boolean;
begin
  select * into v_loc from public.locations where id = p_location_id;
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;
  if not private.has_permission(v_loc.org_id, 'checkins.manage') then
    raise exception 'FORBIDDEN';
  end if;
  select * into v_org from public.organizations where id = v_loc.org_id;

  -- QR de un pase de un día / invitado
  if p_token is not null and left(trim(p_token), 3) = 'p1.' then
    v_chk := private.day_pass_check(v_loc.org_id, p_token);
    if v_chk ->> 'pass_id' is null then
      return jsonb_build_object('found', false, 'reason', v_chk ->> 'reason', 'guest', true);
    end if;
    select * into v_pass from public.day_passes where id = (v_chk ->> 'pass_id')::uuid for update;
    perform private.day_pass_refresh(v_pass.id);
    select * into v_pass from public.day_passes where id = v_pass.id;
    -- anti-rebote: el lector lee 3 veces el mismo QR. Solo cuentan las entradas de ESTA recepción
    -- (sin molinete): una pasada por el molinete no hace que un pase agotado figure "ya entró" acá.
    v_dup := exists (select 1 from public.day_pass_entries e where e.pass_id = v_pass.id and not e.failed
                       and e.device_id is null and e.location_id = v_loc.id
                       and e.created_at > now() - interval '2 minutes');
    v_reason := case when v_pass.revoked_at is not null then 'PASS_REVOKED'
                     when now() < v_pass.valid_from then 'PASS_NOT_YET_VALID'
                     when now() >= v_pass.valid_until then 'PASS_EXPIRED'
                     when v_dup then null
                     when v_pass.entries_used >= v_pass.max_entries then 'PASS_USED_UP' end;
    if v_reason is null and not v_dup then
      insert into public.day_pass_entries (org_id, pass_id, location_id, method)
      values (v_loc.org_id, v_pass.id, v_loc.id, 'qr');
      update public.day_passes set entries_used = entries_used + 1 where id = v_pass.id;
      v_pass.entries_used := v_pass.entries_used + 1;
      insert into public.domain_events (org_id, type, member_id, payload)
      values (v_loc.org_id, 'day_pass.entry', v_pass.invited_by_member,
              jsonb_build_object('pass_id', v_pass.id, 'kind', v_pass.kind, 'source', 'reception', 'location_id', v_loc.id));
    end if;
    return jsonb_build_object(
      'found', true, 'allowed', v_reason is null, 'reason', v_reason, 'duplicate', v_dup and v_reason is null,
      'guest', true, 'pass_id', v_pass.id, 'pass_kind', v_pass.kind,
      'entries_left', greatest(0, v_pass.max_entries - v_pass.entries_used),
      'member', jsonb_build_object('id', null, 'first_name', 'Invitado: ' || v_pass.holder_name, 'last_name', '',
                                   'photo_url', null, 'medical_notes', null));
  end if;

  if p_token is not null then
    v_parts := string_to_array(p_token, '.');
    if array_length(v_parts, 1) <> 4 or v_parts[1] <> 'v1'
       or v_parts[2] !~ '^[0-9a-f-]{36}$' or v_parts[3] !~ '^[0-9]{1,12}$' then
      return jsonb_build_object('found', false, 'reason', 'QR_INVALID');
    end if;
    v_step     := v_parts[3]::bigint;
    v_now_step := floor(extract(epoch from now()) / v_org.qr_step_seconds)::bigint;
    -- tolerancia de 1 paso hacia atrás (reloj del celular / latencia)
    if v_step not in (v_now_step, v_now_step - 1)
       or private.qr_signature(v_parts[2]::uuid, v_step) is distinct from v_parts[4] then
      return jsonb_build_object('found', false, 'reason', 'QR_EXPIRED_OR_INVALID');
    end if;
    select * into v_member from public.members where id = v_parts[2]::uuid and org_id = v_loc.org_id;
  elsif p_member_id is not null and p_method <> 'qr' then
    select * into v_member from public.members where id = p_member_id and org_id = v_loc.org_id;
  end if;
  if v_member.id is null then
    return jsonb_build_object('found', false, 'reason', 'MEMBER_NOT_FOUND');
  end if;

  -- ¿Tiene reserva para una clase que empieza en ±30/60 min?
  select b.* into v_booking from public.bookings b
    join public.class_sessions s on s.id = b.session_id
   where b.member_id = v_member.id and b.status = 'booked'
     and s.starts_at between now() - interval '30 minutes' and now() + interval '60 minutes'
   order by s.starts_at limit 1;

  if v_member.status in ('frozen', 'archived') then
    v_reason := 'MEMBER_' || upper(v_member.status::text);
  elsif v_booking.id is not null then
    v_allowed := true;
  elsif exists (
    select 1 from public.membership_members mm
      join public.memberships m on m.id = mm.membership_id
      join public.membership_plans p on p.id = m.plan_id
     where mm.member_id = v_member.id and p.includes_open_gym
       and m.status in ('active', 'trialing')
       and now() < m.current_period_end + make_interval(days => v_org.grace_days)) then
    v_allowed := true;
    if exists (select 1 from public.membership_members mm join public.memberships m on m.id = mm.membership_id
                where mm.member_id = v_member.id and m.status in ('active', 'trialing')
                  and now() >= m.current_period_end) then
      v_reason := 'IN_GRACE_PERIOD';
      v_warnings := v_warnings || to_jsonb('IN_GRACE_PERIOD'::text);
    end if;
  else
    v_reason := 'NO_ACTIVE_MEMBERSHIP';
  end if;

  -- Avisos para recepción (deja entrar igual): fuera del horario del plan / apto físico exigido
  if v_allowed and v_booking.id is null then
    v_warn := private.member_gym_access(v_member.id, now());
    if v_warn in ('OUTSIDE_PLAN_HOURS', 'MEDICAL_CERT_REQUIRED') then
      v_reason := v_warn;
      v_warnings := v_warnings || to_jsonb(v_warn);
    end if;
  end if;

  -- anti-rebote: el lector lee 3 veces el mismo QR
  select * into v_last from public.checkins
   where member_id = v_member.id order by created_at desc limit 1;
  if not (found and v_last.created_at > now() - interval '2 minutes' and v_last.allowed = v_allowed) then
    insert into public.checkins (org_id, location_id, member_id, booking_id, method, allowed, reason)
    values (v_loc.org_id, v_loc.id, v_member.id, v_booking.id, p_method, v_allowed, v_reason);
    if v_allowed then
      update public.members set last_checkin_at = now() where id = v_member.id;
      if v_booking.id is not null then
        update public.bookings set status = 'checked_in', checked_in_at = now() where id = v_booking.id;
      end if;
    end if;
    insert into public.domain_events (org_id, type, member_id, payload)
    values (v_loc.org_id, case when v_allowed then 'checkin.allowed' else 'checkin.denied' end, v_member.id,
            jsonb_build_object('reason', v_reason, 'location_id', v_loc.id));
  end if;

  return jsonb_build_object(
    'found', true, 'allowed', v_allowed, 'reason', v_reason,
    'duplicate', coalesce(v_last.created_at > now() - interval '2 minutes' and v_last.allowed = v_allowed, false),
    'booking_id', v_booking.id,
    'warnings', v_warnings,
    'access_windows', case when v_warnings ? 'OUTSIDE_PLAN_HOURS' then private.member_access_windows(v_member.id) end,
    'member', jsonb_build_object('id', v_member.id, 'first_name', v_member.first_name,
                                 'last_name', v_member.last_name, 'photo_url', v_member.photo_url,
                                 'medical_notes', v_member.medical_notes)
  );
end $$;
revoke execute on function public.checkin_scan(uuid, text, uuid, public.checkin_method) from public, anon;
grant execute on function public.checkin_scan(uuid, text, uuid, public.checkin_method) to authenticated;
