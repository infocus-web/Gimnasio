-- =====================================================================
-- 0028 · Comunicación y retención (agente A)
--   1. Avisos automáticos por email (vence en 3 días / hoy, te extrañamos 7/14,
--      cumpleaños con regalo, bienvenida) → se encolan en message_outbox con dedupe.
--      El envío lo hace /api/cron/messages (Resend). pg_cron genera todos los días 9:00 AR.
--   2. Panel: socios en riesgo, "contactado", historial de mensajes.
--   3. App del socio: logros (checkins reales), referidos con días gratis,
--      congelamiento por vacaciones (autoservicio con tope anual).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 · message_outbox: ahora también emails del sistema (sin profe que firme)
-- ---------------------------------------------------------------------
alter table public.message_outbox alter column sender_staff_id drop not null;
alter table public.message_outbox alter column phone drop not null;
alter table public.message_outbox add column if not exists email      text;
alter table public.message_outbox add column if not exists subject    text;
alter table public.message_outbox add column if not exists dedupe_key text;
alter table public.message_outbox add column if not exists locked_at  timestamptz;
alter table public.message_outbox add column if not exists attempts   int not null default 0;
alter table public.message_outbox add column if not exists provider_message_id text;

alter table public.message_outbox drop constraint if exists message_outbox_channel_check;
alter table public.message_outbox add constraint message_outbox_channel_check check (channel in ('whatsapp', 'email'));
alter table public.message_outbox drop constraint if exists message_outbox_destination_check;
alter table public.message_outbox add constraint message_outbox_destination_check check (
  (channel = 'whatsapp' and phone is not null)
  or (channel = 'email' and email is not null and length(email) <= 320 and subject is not null and length(subject) <= 200)
);

-- No mandar dos veces el mismo aviso por el mismo motivo
create unique index if not exists message_outbox_dedupe on public.message_outbox (member_id, dedupe_key) where dedupe_key is not null;
create index if not exists message_outbox_email_queued on public.message_outbox (created_at) where status = 'queued' and channel = 'email';

-- ---------------------------------------------------------------------
-- 2 · Configuración por gimnasio
-- ---------------------------------------------------------------------
create table if not exists public.engagement_settings (
  org_id               uuid primary key references public.organizations (id) on delete cascade,
  birthday_gift_days   int not null default 1  check (birthday_gift_days between 0 and 7),
  referral_reward_days int not null default 15 check (referral_reward_days between 0 and 60),
  freeze_max_days_year int not null default 15 check (freeze_max_days_year between 0 and 90),
  updated_at           timestamptz not null default now()
);

create table if not exists public.engagement_notices (
  org_id     uuid not null references public.organizations (id) on delete cascade,
  kind       text not null check (kind in ('expiry_3d', 'expiry_today', 'inactive_7', 'inactive_14', 'birthday', 'welcome')),
  enabled    boolean not null default false,
  subject    text not null check (length(subject) between 1 and 150),
  body       text not null check (length(body) between 1 and 1500),
  updated_at timestamptz not null default now(),
  primary key (org_id, kind)
);

create or replace function private.engagement_default_notice(p_kind text, out subject text, out body text)
language sql immutable set search_path = '' as $$
  select x.s, x.b from (values
    ('expiry_3d', 'Tu plan vence en 3 días',
     E'¡Hola {nombre}! Te recordamos que tu plan en {gimnasio} vence el {vence}.\nRenovalo en recepción así seguís entrenando sin cortes. 💪'),
    ('expiry_today', 'Tu plan vence hoy',
     E'¡Hola {nombre}! Tu plan en {gimnasio} vence hoy ({vence}).\nPasá por recepción para renovarlo y que no se corte tu acceso.'),
    ('inactive_7', '¡Te extrañamos, {nombre}!',
     E'Hace {dias} días que no te vemos por {gimnasio}. ¿Todo bien?\nVolver es más fácil de lo que parece: te esperamos para retomar. 💪'),
    ('inactive_14', 'Tu lugar en {gimnasio} te está esperando',
     E'¡Hola {nombre}! Ya pasaron {dias} días desde tu última visita.\nTu plan sigue vigente hasta el {vence}: aprovechalo. Si necesitás ayuda para retomar, hablá con cualquiera de los profes.'),
    ('birthday', '¡Feliz cumpleaños, {nombre}! 🎂',
     E'Todo el equipo de {gimnasio} te desea un muy feliz cumpleaños.\nDe regalo te sumamos días a tu plan (+{dias}): ahora vence el {vence}. ¡Que lo disfrutes!'),
    ('welcome', '¡Bienvenido/a a {gimnasio}!',
     E'¡Hola {nombre}! Qué bueno tenerte en {gimnasio}.\nDesde la app mostrás tu pase de acceso, reservás clases, ves tu rutina y seguís tu progreso. Cualquier duda, preguntanos en recepción. ¡A entrenar! 💪')
  ) as x(k, s, b) where x.k = p_kind
$$;

create or replace function private.engagement_seed_org(p_org uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.engagement_settings (org_id) values (p_org) on conflict do nothing;
  insert into public.engagement_notices (org_id, kind, subject, body)
  select p_org, k, d.subject, d.body
    from unnest(array['expiry_3d', 'expiry_today', 'inactive_7', 'inactive_14', 'birthday', 'welcome']) k,
         lateral private.engagement_default_notice(k) d
  on conflict do nothing;
$$;

do $$ declare o uuid; begin
  for o in select id from public.organizations loop perform private.engagement_seed_org(o); end loop;
end $$;

create or replace function private.engagement_on_org() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.engagement_seed_org(new.id);
  return new;
end $$;
drop trigger if exists organizations_engagement_seed on public.organizations;
create trigger organizations_engagement_seed after insert on public.organizations
  for each row execute function private.engagement_on_org();

-- ---------------------------------------------------------------------
-- 3 · Referidos, premios (días regalados), congelamientos, contactos
-- ---------------------------------------------------------------------
create table if not exists public.member_referral_codes (
  member_id  uuid primary key references public.members (id) on delete cascade,
  org_id     uuid not null references public.organizations (id) on delete cascade,
  code       text not null check (code ~ '^[A-Z0-9]{4,16}$'),
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

create table if not exists public.referrals (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete cascade,
  referrer_member_id uuid not null references public.members (id) on delete cascade,
  referred_member_id uuid not null unique references public.members (id) on delete cascade,
  code               text not null,
  status             text not null default 'pending' check (status in ('pending', 'rewarded', 'canceled')),
  reward_days        int,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  rewarded_at        timestamptz,
  check (referrer_member_id <> referred_member_id)
);
create index if not exists referrals_referrer on public.referrals (referrer_member_id);
create index if not exists referrals_org on public.referrals (org_id, created_at desc);

-- Días regalados (cumpleaños, referidos). unique = una sola vez por motivo.
create table if not exists public.member_rewards (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  member_id     uuid not null references public.members (id) on delete cascade,
  kind          text not null check (kind in ('birthday', 'referral_new', 'referral_by')),
  ref_key       text not null,
  days          int not null check (days between 0 and 90),
  status        text not null default 'pending' check (status in ('pending', 'applied')),
  membership_id uuid references public.memberships (id) on delete set null,
  created_at    timestamptz not null default now(),
  applied_at    timestamptz,
  unique (member_id, kind, ref_key)
);
create index if not exists member_rewards_pending on public.member_rewards (member_id) where status = 'pending';

create table if not exists public.membership_freezes (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete cascade,
  membership_id      uuid not null references public.memberships (id) on delete cascade,
  billing_account_id uuid not null references public.billing_accounts (id) on delete cascade,
  member_id          uuid references public.members (id) on delete set null,
  starts_on          date not null,
  days               int  not null check (days between 1 and 90),
  ends_on            date generated always as (starts_on + days) stored,   -- primer día sin congelar
  status             text not null default 'scheduled' check (status in ('scheduled', 'active', 'done', 'canceled')),
  prev_status        public.membership_status,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  canceled_at        timestamptz
);
create index if not exists membership_freezes_account on public.membership_freezes (billing_account_id, starts_on);
create index if not exists membership_freezes_open on public.membership_freezes (status) where status in ('scheduled', 'active');

create table if not exists public.engagement_contacts (
  id           bigint generated always as identity primary key,
  org_id       uuid not null references public.organizations (id) on delete cascade,
  member_id    uuid not null references public.members (id) on delete cascade,
  staff_id     uuid references public.staff (id) on delete set null,
  contacted_at timestamptz not null default now()
);
create index if not exists engagement_contacts_member on public.engagement_contacts (member_id, contacted_at desc);

-- RLS: solo lectura; toda escritura pasa por funciones que validan permisos
alter table public.engagement_settings   enable row level security;
alter table public.engagement_notices    enable row level security;
alter table public.member_referral_codes enable row level security;
alter table public.referrals             enable row level security;
alter table public.member_rewards        enable row level security;
alter table public.membership_freezes    enable row level security;
alter table public.engagement_contacts   enable row level security;

drop policy if exists engagement_settings_select on public.engagement_settings;
create policy engagement_settings_select on public.engagement_settings for select to authenticated
  using ((select private.has_permission(org_id, 'members.read')));
drop policy if exists engagement_notices_select on public.engagement_notices;
create policy engagement_notices_select on public.engagement_notices for select to authenticated
  using ((select private.has_permission(org_id, 'members.read')));
drop policy if exists member_referral_codes_select on public.member_referral_codes;
create policy member_referral_codes_select on public.member_referral_codes for select to authenticated
  using ((select private.has_permission(org_id, 'members.read')) or member_id in (select private.actable_member_ids()));
drop policy if exists referrals_select on public.referrals;
create policy referrals_select on public.referrals for select to authenticated
  using ((select private.has_permission(org_id, 'members.read')) or referrer_member_id in (select private.actable_member_ids()));
drop policy if exists member_rewards_select on public.member_rewards;
create policy member_rewards_select on public.member_rewards for select to authenticated
  using ((select private.has_permission(org_id, 'members.read')) or member_id in (select private.actable_member_ids()));
drop policy if exists membership_freezes_select on public.membership_freezes;
create policy membership_freezes_select on public.membership_freezes for select to authenticated
  using ((select private.has_permission(org_id, 'members.read')) or (select private.is_payer(billing_account_id)));
drop policy if exists engagement_contacts_select on public.engagement_contacts;
create policy engagement_contacts_select on public.engagement_contacts for select to authenticated
  using ((select private.has_permission(org_id, 'members.read')));

revoke all on public.engagement_settings, public.engagement_notices, public.member_referral_codes, public.referrals,
              public.member_rewards, public.membership_freezes, public.engagement_contacts from anon, authenticated;
grant select on public.engagement_settings, public.engagement_notices, public.member_referral_codes, public.referrals,
                public.member_rewards, public.membership_freezes, public.engagement_contacts to authenticated;

-- ---------------------------------------------------------------------
-- 4 · Helpers
-- ---------------------------------------------------------------------
create or replace function private.engagement_can_manage(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_permission(p_org, 'automations.manage') or private.has_permission(p_org, 'org.manage')
$$;

create or replace function private.engagement_first_name(p_first text) returns text
language sql immutable set search_path = '' as $$
  select initcap(lower(coalesce(nullif(split_part(btrim(coalesce(p_first, '')), ' ', 1), ''), 'socio')))
$$;

create or replace function private.engagement_render(p_text text, p_name text, p_gym text, p_vence date, p_dias int)
returns text language sql immutable set search_path = '' as $$
  select replace(replace(replace(replace(p_text,
           '{nombre}', private.engagement_first_name(p_name)),
           '{gimnasio}', coalesce(p_gym, '')),
           '{vence}', coalesce(to_char(p_vence, 'DD/MM/YYYY'), '')),
           '{dias}', coalesce(p_dias::text, ''))
$$;

-- Membresía vigente de un socio (la que más tarde vence)
create or replace function private.engagement_current_membership(p_member uuid) returns public.memberships
language sql stable security definer set search_path = '' as $$
  select ms.* from public.membership_members mm
    join public.memberships ms on ms.id = mm.membership_id
   where mm.member_id = p_member
     and ms.status in ('active', 'trialing', 'paused', 'past_due')
     and ms.current_period_end >= now()
   order by ms.current_period_end desc
   limit 1
$$;

-- Aplica un premio pendiente sobre la membresía vigente (si hay). Devuelve true si lo aplicó.
create or replace function private.engagement_apply_reward(p_reward uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  r  public.member_rewards;
  ms public.memberships;
begin
  select * into r from public.member_rewards where id = p_reward and status = 'pending' for update;
  if not found then return false; end if;
  ms := private.engagement_current_membership(r.member_id);
  if ms.id is null then return false; end if;
  if r.days > 0 then
    update public.memberships set current_period_end = current_period_end + make_interval(days => r.days) where id = ms.id;
  end if;
  update public.member_rewards set status = 'applied', applied_at = now(), membership_id = ms.id where id = r.id;
  return true;
end $$;

-- Registra un premio (una sola vez por motivo) y lo aplica si se puede. null = ya existía.
create or replace function private.engagement_grant(p_member uuid, p_kind text, p_ref text, p_days int) returns text
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_org uuid;
begin
  select org_id into v_org from public.members where id = p_member;
  insert into public.member_rewards (org_id, member_id, kind, ref_key, days)
  values (v_org, p_member, p_kind, p_ref, greatest(coalesce(p_days, 0), 0))
  on conflict (member_id, kind, ref_key) do nothing
  returning id into v_id;
  if v_id is null then return null; end if;
  return case when private.engagement_apply_reward(v_id) then 'applied' else 'pending' end;
end $$;

-- Acredita un referido a los dos (una sola vez)
create or replace function private.referral_reward(p_referral uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  r      public.referrals;
  v_days int;
begin
  select * into r from public.referrals where id = p_referral and status = 'pending' for update;
  if not found then return false; end if;
  select coalesce(s.referral_reward_days, 15) into v_days from public.engagement_settings s where s.org_id = r.org_id;
  v_days := coalesce(v_days, 15);
  update public.referrals set status = 'rewarded', rewarded_at = now(), reward_days = v_days where id = r.id;
  perform private.engagement_grant(r.referred_member_id, 'referral_new', r.id::text, v_days);
  perform private.engagement_grant(r.referrer_member_id, 'referral_by', r.id::text, v_days);
  return true;
end $$;

-- Al registrarse un pago: primer pago de un referido → premio; premios pendientes de la cuenta → se aplican.
-- Nunca frena el cobro: si algo falla queda una advertencia en el log.
create or replace function private.engagement_on_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if tg_op = 'UPDATE' and old.status = 'succeeded' then return new; end if;
  if new.amount_cents <= 0 then return new; end if;
  begin
    for v_id in
      select rf.id from public.referrals rf
        join public.members m on m.id = rf.referred_member_id
       where m.billing_account_id = new.billing_account_id and rf.status = 'pending'
    loop
      perform private.referral_reward(v_id);
    end loop;
    for v_id in
      select rw.id from public.member_rewards rw
        join public.members m on m.id = rw.member_id
       where m.billing_account_id = new.billing_account_id and rw.status = 'pending'
    loop
      perform private.engagement_apply_reward(v_id);
    end loop;
  exception when others then
    raise warning 'engagement_on_payment: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists payments_engagement on public.payments;
create trigger payments_engagement after insert or update of status on public.payments
  for each row when (new.status = 'succeeded') execute function private.engagement_on_payment();

-- Premio pendiente + plan nuevo (p. ej. un pago online que registra el pago antes de crear la membresía): se aplica al vincular
create or replace function private.engagement_on_membership_member() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  begin
    for v_id in select id from public.member_rewards where member_id = new.member_id and status = 'pending' loop
      perform private.engagement_apply_reward(v_id);
    end loop;
  exception when others then
    raise warning 'engagement_on_membership_member: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists membership_members_engagement on public.membership_members;
create trigger membership_members_engagement after insert on public.membership_members
  for each row execute function private.engagement_on_membership_member();

revoke execute on function private.engagement_seed_org(uuid), private.engagement_current_membership(uuid),
  private.engagement_apply_reward(uuid), private.engagement_grant(uuid, text, text, int),
  private.referral_reward(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5 · Congelamientos: arranque y fin (pg_cron 00:05 AR + al crear uno que empieza hoy)
-- ---------------------------------------------------------------------
create or replace function public.engagement_freeze_tick() returns int
language plpgsql security definer set search_path = '' as $$
declare
  f     record;
  v_n   int := 0;
begin
  -- Membresía reemplazada/vencida antes de arrancar: el congelamiento ya no aplica
  update public.membership_freezes fz set status = 'canceled', canceled_at = now()
    from public.memberships ms
   where ms.id = fz.membership_id and fz.status = 'scheduled' and ms.status not in ('active', 'trialing', 'paused');

  -- Arrancan los que empiezan hoy (o antes, si el cron no corrió)
  for f in
    select fz.*, (now() at time zone o.timezone)::date as today
      from public.membership_freezes fz join public.organizations o on o.id = fz.org_id
     where fz.status = 'scheduled' and fz.starts_on <= (now() at time zone o.timezone)::date
     for update of fz
  loop
    if f.ends_on <= f.today then
      update public.membership_freezes set status = 'done' where id = f.id;
    else
      update public.membership_freezes fz set status = 'active', prev_status = ms.status
        from public.memberships ms where ms.id = fz.membership_id and fz.id = f.id;
      update public.memberships
         set status = 'paused', paused_until = private.org_midnight(f.org_id, f.ends_on)
       where id = f.membership_id and status in ('active', 'trialing', 'paused');
    end if;
    v_n := v_n + 1;
  end loop;

  -- Terminan: vuelve a 'active' (o al estado que tenía)
  for f in
    select fz.* from public.membership_freezes fz join public.organizations o on o.id = fz.org_id
     where fz.status = 'active' and fz.ends_on <= (now() at time zone o.timezone)::date
     for update of fz
  loop
    update public.memberships
       set status = case when coalesce(f.prev_status, 'active') = 'trialing' then 'trialing'::public.membership_status
                         else 'active'::public.membership_status end,
           paused_until = null
     where id = f.membership_id and status = 'paused';
    update public.membership_freezes set status = 'done' where id = f.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.engagement_freeze_tick() from public, anon, authenticated;
grant execute on function public.engagement_freeze_tick() to service_role;

-- ---------------------------------------------------------------------
-- 6 · Generación diaria de avisos (pg_cron 12:00 UTC = 9:00 AR, y /api/cron/messages para bienvenida)
-- ---------------------------------------------------------------------
create or replace function public.engagement_generate(p_kinds text[] default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_counts jsonb := '{}'::jsonb;
  v_n      int;
  r        record;
  v_res    text;
  v_end    timestamptz;
  v_tz     text;
begin
  perform public.engagement_freeze_tick();

  -- a) Vence en 3 días / vence hoy (planes con renovación manual, socios activos con email)
  if p_kinds is null or 'expiry_3d' = any (p_kinds) or 'expiry_today' = any (p_kinds) then
    insert into public.message_outbox (org_id, member_id, channel, email, subject, body, template_key, status, dedupe_key)
    select x.org_id, x.member_id, 'email', x.email,
           left(private.engagement_render(n.subject, x.first_name, x.org_name, x.end_day, x.days_left), 200),
           left(private.engagement_render(n.body, x.first_name, x.org_name, x.end_day, x.days_left), 2000),
           n.kind, 'queued', n.kind || ':' || x.membership_id || ':' || x.end_day
      from (
        select distinct on (m.id) m.id as member_id, m.org_id, m.first_name, btrim(m.email) as email, o.name as org_name,
               ms.id as membership_id, (ms.current_period_end at time zone o.timezone)::date as end_day,
               (ms.current_period_end at time zone o.timezone)::date - (now() at time zone o.timezone)::date as days_left
          from public.members m
          join public.organizations o on o.id = m.org_id
          join public.membership_members mm on mm.member_id = m.id
          join public.memberships ms on ms.id = mm.membership_id
         where m.status = 'active' and nullif(btrim(m.email), '') is not null
           and ms.status in ('active', 'trialing') and ms.cancel_at_period_end
           and ms.current_period_end > now() - interval '1 day'
         order by m.id, ms.current_period_end desc
      ) x
      join public.engagement_notices n on n.org_id = x.org_id and n.enabled
       and ((n.kind = 'expiry_3d' and x.days_left = 3) or (n.kind = 'expiry_today' and x.days_left = 0))
     where p_kinds is null or n.kind = any (p_kinds)
    on conflict (member_id, dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('expiry', v_n);
  end if;

  -- b) Te extrañamos 7 / 14 días (una vez por racha: la clave es el último ingreso / arranque)
  if p_kinds is null or 'inactive_7' = any (p_kinds) or 'inactive_14' = any (p_kinds) then
    insert into public.message_outbox (org_id, member_id, channel, email, subject, body, template_key, status, dedupe_key)
    select x.org_id, x.member_id, 'email', x.email,
           left(private.engagement_render(n.subject, x.first_name, x.org_name, x.end_day, x.days_away), 200),
           left(private.engagement_render(n.body, x.first_name, x.org_name, x.end_day, x.days_away), 2000),
           n.kind, 'queued', n.kind || ':' || floor(extract(epoch from x.ref_at))::bigint
      from (
        select y.*, floor(extract(epoch from now() - y.ref_at) / 86400)::int as days_away
          from (
            select distinct on (m.id) m.id as member_id, m.org_id, m.first_name, btrim(m.email) as email, o.name as org_name,
                   (ms.current_period_end at time zone o.timezone)::date as end_day,
                   greatest(lc.last_at, m.created_at, ms.current_period_start) as ref_at
              from public.members m
              join public.organizations o on o.id = m.org_id
              join public.membership_members mm on mm.member_id = m.id
              join public.memberships ms on ms.id = mm.membership_id
              left join lateral (select max(c.created_at) as last_at from public.checkins c
                                  where c.member_id = m.id and c.allowed) lc on true
             where m.status = 'active' and nullif(btrim(m.email), '') is not null
               and ms.status in ('active', 'trialing') and ms.current_period_end > now()
               and (ms.paused_until is null or ms.paused_until <= now())
             order by m.id, ms.current_period_end desc
          ) y
      ) x
      join public.engagement_notices n on n.org_id = x.org_id and n.enabled
       and ((n.kind = 'inactive_7' and x.days_away between 7 and 13) or (n.kind = 'inactive_14' and x.days_away >= 14))
     where p_kinds is null or n.kind = any (p_kinds)
    on conflict (member_id, dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('inactive', v_n);
  end if;

  -- c) Cumpleaños: regalo de días (una vez por año) + email
  if p_kinds is null or 'birthday' = any (p_kinds) then
    v_n := 0;
    for r in
      select m.id as member_id, m.org_id, m.first_name, nullif(btrim(m.email), '') as email, o.name as org_name, o.timezone,
             n.subject, n.body, coalesce(s.birthday_gift_days, 1) as gift,
             extract(year from (now() at time zone o.timezone))::int as yr
        from public.members m
        join public.organizations o on o.id = m.org_id
        join public.engagement_notices n on n.org_id = m.org_id and n.kind = 'birthday' and n.enabled
        left join public.engagement_settings s on s.org_id = m.org_id
       where m.status = 'active' and m.birth_date is not null
         and (to_char(m.birth_date, 'MM-DD') = to_char((now() at time zone o.timezone)::date, 'MM-DD')
              or (to_char(m.birth_date, 'MM-DD') = '02-29'
                  and to_char((now() at time zone o.timezone)::date, 'MM-DD') = '02-28'
                  and extract(day from (date_trunc('year', (now() at time zone o.timezone)) + interval '59 days'))::int = 1))
         and (private.engagement_current_membership(m.id)).id is not null
    loop
      v_res := private.engagement_grant(r.member_id, 'birthday', r.yr::text, r.gift);
      if v_res is null then continue; end if;          -- ya se festejó este año
      v_n := v_n + 1;
      if r.email is not null then
        v_end := (private.engagement_current_membership(r.member_id)).current_period_end;
        insert into public.message_outbox (org_id, member_id, channel, email, subject, body, template_key, status, dedupe_key)
        values (r.org_id, r.member_id, 'email', r.email,
                left(private.engagement_render(r.subject, r.first_name, r.org_name, (v_end at time zone r.timezone)::date, r.gift), 200),
                left(private.engagement_render(r.body, r.first_name, r.org_name, (v_end at time zone r.timezone)::date, r.gift), 2000),
                'birthday', 'queued', 'birthday:' || r.yr)
        on conflict (member_id, dedupe_key) where dedupe_key is not null do nothing;
      end if;
    end loop;
    v_counts := v_counts || jsonb_build_object('birthday', v_n);
  end if;

  -- d) Bienvenida (socio nuevo con email, inscripto en los últimos 3 días)
  if p_kinds is null or 'welcome' = any (p_kinds) then
    insert into public.message_outbox (org_id, member_id, channel, email, subject, body, template_key, status, dedupe_key)
    select m.org_id, m.id, 'email', btrim(m.email),
           left(private.engagement_render(n.subject, m.first_name, o.name, null, null), 200),
           left(private.engagement_render(n.body, m.first_name, o.name, null, null), 2000),
           'welcome', 'queued', 'welcome'
      from public.members m
      join public.organizations o on o.id = m.org_id
      join public.engagement_notices n on n.org_id = m.org_id and n.kind = 'welcome' and n.enabled
     where m.status = 'active' and nullif(btrim(m.email), '') is not null
       and m.created_at > now() - interval '3 days'
    on conflict (member_id, dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('welcome', v_n);
  end if;

  return v_counts;
end $$;
revoke execute on function public.engagement_generate(text[]) from public, anon, authenticated;
grant execute on function public.engagement_generate(text[]) to service_role;

-- ---------------------------------------------------------------------
-- 7 · Envío (lo usa /api/cron/messages con la secret key)
-- ---------------------------------------------------------------------
-- Toma un lote de emails pendientes con lock (dos ejecuciones simultáneas no mandan dos veces)
create or replace function public.message_outbox_claim(p_limit int default 50) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  -- Lo que quedó esperando más de 3 días ya no tiene sentido mandarlo ("vence hoy" de la semana pasada)
  update public.message_outbox set status = 'failed', error = 'No se envió a tiempo (más de 3 días en espera)', locked_at = null
   where channel = 'email' and status = 'queued' and created_at < now() - interval '3 days';

  with c as (
    update public.message_outbox o
       set locked_at = now(), attempts = o.attempts + 1
      from (select id from public.message_outbox
             where channel = 'email' and status = 'queued'
               and (locked_at is null or locked_at < now() - interval '10 minutes')
             order by created_at
             limit greatest(1, least(coalesce(p_limit, 50), 200))
             for update skip locked) s
     where o.id = s.id
    returning o.id, o.org_id, o.email, o.subject, o.body, o.template_key
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'email', c.email, 'subject', c.subject, 'body', c.body,
                                               'kind', c.template_key, 'org_name', og.name, 'org_slug', og.slug) order by c.id), '[]'::jsonb)
    into v
    from c join public.organizations og on og.id = c.org_id;
  return v;
end $$;

create or replace function public.message_outbox_mark(p_id bigint, p_ok boolean, p_error text default null,
                                                      p_retry boolean default false, p_provider_id text default null)
returns void language sql security definer set search_path = '' as $$
  update public.message_outbox
     set status = case when p_ok then 'sent' when p_retry and attempts < 3 then 'queued' else 'failed' end,
         sent_at = case when p_ok then now() else sent_at end,
         error = case when p_ok then null else left(p_error, 500) end,
         provider_message_id = coalesce(p_provider_id, provider_message_id),
         locked_at = null
   where id = p_id and status = 'queued'
$$;
revoke execute on function public.message_outbox_claim(int), public.message_outbox_mark(bigint, boolean, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.message_outbox_claim(int), public.message_outbox_mark(bigint, boolean, text, boolean, text)
  to service_role;

-- ---------------------------------------------------------------------
-- 8 · Panel /admin/comunicacion
-- ---------------------------------------------------------------------
create or replace function public.engagement_admin_get(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not private.has_permission(p_org, 'members.write') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select jsonb_build_object(
    'can_manage', private.engagement_can_manage(p_org),
    'notices', coalesce((select jsonb_agg(jsonb_build_object('kind', n.kind, 'enabled', n.enabled, 'subject', n.subject, 'body', n.body)
                                          order by array_position(array['welcome','expiry_3d','expiry_today','inactive_7','inactive_14','birthday'], n.kind))
                           from public.engagement_notices n where n.org_id = p_org), '[]'::jsonb),
    'rules', (select jsonb_build_object('birthday_gift_days', s.birthday_gift_days, 'referral_reward_days', s.referral_reward_days,
                                        'freeze_max_days_year', s.freeze_max_days_year)
                from public.engagement_settings s where s.org_id = p_org),
    'stats', jsonb_build_object(
       'queued', (select count(*) from public.message_outbox where org_id = p_org and channel = 'email' and status = 'queued'),
       'sent_7d', (select count(*) from public.message_outbox where org_id = p_org and channel = 'email' and status = 'sent' and sent_at > now() - interval '7 days'),
       'failed_7d', (select count(*) from public.message_outbox where org_id = p_org and channel = 'email' and status = 'failed' and created_at > now() - interval '7 days')),
    'referrals', coalesce((select jsonb_agg(x order by x ->> 'created_at' desc) from (
        select jsonb_build_object('id', r.id, 'status', r.status, 'code', r.code, 'created_at', r.created_at, 'rewarded_at', r.rewarded_at,
                                  'reward_days', r.reward_days,
                                  'referrer', btrim(a.first_name || ' ' || a.last_name), 'referrer_id', a.id,
                                  'referred', btrim(b.first_name || ' ' || b.last_name), 'referred_id', b.id) as x
          from public.referrals r
          join public.members a on a.id = r.referrer_member_id
          join public.members b on b.id = r.referred_member_id
         where r.org_id = p_org order by r.created_at desc limit 30) q), '[]'::jsonb),
    'new_members', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('id', m.id, 'name', btrim(m.first_name || ' ' || m.last_name), 'document', m.document_id,
                                  'number', m.access_pin, 'created_at', m.created_at) as x
          from public.members m
         where m.org_id = p_org and m.status in ('active', 'lead') and m.created_at > now() - interval '60 days'
           and not exists (select 1 from public.referrals r where r.referred_member_id = m.id)
         order by m.created_at desc limit 300) q), '[]'::jsonb)
  ) into v;
  return v;
end $$;

create or replace function public.engagement_save_notice(p_org uuid, p_kind text, p_enabled boolean, p_subject text, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.engagement_can_manage(p_org) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_subject, ''))) not between 1 and 150 then raise exception 'NOTICE_SUBJECT_INVALID'; end if;
  if length(btrim(coalesce(p_body, ''))) not between 1 and 1500 then raise exception 'NOTICE_BODY_INVALID'; end if;
  perform private.engagement_seed_org(p_org);
  update public.engagement_notices
     set enabled = coalesce(p_enabled, false), subject = btrim(p_subject), body = btrim(p_body), updated_at = now()
   where org_id = p_org and kind = p_kind;
  if not found then raise exception 'NOTICE_NOT_FOUND'; end if;
end $$;

create or replace function public.engagement_save_rules(p_org uuid, p_birthday_gift_days int, p_referral_reward_days int,
                                                        p_freeze_max_days_year int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.engagement_can_manage(p_org) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_birthday_gift_days not between 0 and 7 or p_referral_reward_days not between 0 and 60
     or p_freeze_max_days_year not between 0 and 90 then
    raise exception 'RULES_OUT_OF_RANGE';
  end if;
  perform private.engagement_seed_org(p_org);
  update public.engagement_settings
     set birthday_gift_days = p_birthday_gift_days, referral_reward_days = p_referral_reward_days,
         freeze_max_days_year = p_freeze_max_days_year, updated_at = now()
   where org_id = p_org;
end $$;

-- Socios en riesgo: activos con plan vigente que no vienen hace 7+ días
-- o que bajaron mucho la frecuencia (últimas 2 semanas vs. las 4 anteriores, por semana)
create or replace function public.engagement_at_risk(p_org uuid, p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; v_tz text;
begin
  if not private.has_permission(p_org, 'members.write') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select timezone into v_tz from public.organizations where id = p_org;
  with base as (
    select distinct on (m.id) m.id, m.first_name, m.last_name, m.phone, m.access_pin, m.created_at,
           ms.current_period_end, ms.current_period_start
      from public.members m
      join public.membership_members mm on mm.member_id = m.id
      join public.memberships ms on ms.id = mm.membership_id
     where m.org_id = p_org and m.status = 'active'
       and ms.status in ('active', 'trialing') and ms.current_period_end > now()
       and (ms.paused_until is null or ms.paused_until <= now())
       and not exists (select 1 from public.engagement_contacts ec
                        where ec.member_id = m.id and ec.contacted_at > now() - interval '14 days')
     order by m.id, ms.current_period_end desc
  ), stats as (
    select b.*,
           (select max(c.created_at) from public.checkins c where c.member_id = b.id and c.allowed) as last_at,
           (select count(distinct (c.created_at at time zone v_tz)::date) from public.checkins c
             where c.member_id = b.id and c.allowed and c.created_at > now() - interval '14 days') as recent,
           (select count(distinct (c.created_at at time zone v_tz)::date) from public.checkins c
             where c.member_id = b.id and c.allowed and c.created_at <= now() - interval '14 days'
               and c.created_at > now() - interval '42 days') as previous
      from base b
  ), scored as (
    select s.*,
           floor(extract(epoch from now() - greatest(coalesce(s.last_at, s.created_at), s.created_at)) / 86400)::int as days_away,
           -- visitas por semana: antes (4 semanas) vs. ahora (2 semanas)
           (s.previous / 4.0) as prev_rate, (s.recent / 2.0) as recent_rate
      from stats s
  ), risky as (
    select sc.*,
           (sc.days_away >= 7) as away,
           (sc.previous >= 4 and sc.recent_rate <= sc.prev_rate * 0.5) as dropped
      from scored sc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'member_id', r.id, 'first_name', r.first_name, 'last_name', r.last_name, 'phone', r.phone, 'number', r.access_pin,
           'last_checkin_at', r.last_at, 'days_away', r.days_away, 'recent', r.recent, 'previous', r.previous,
           'period_end', r.current_period_end,
           'reason', case when r.away and r.last_at is null then 'never' when r.away then 'away' else 'dropped' end,
           'risk', least(r.days_away, 60) + case when r.dropped
                     then round(30 * (1 - r.recent_rate / nullif(r.prev_rate, 0)))::int else 0 end)
         order by least(r.days_away, 60) + case when r.dropped then round(30 * (1 - r.recent_rate / nullif(r.prev_rate, 0)))::int else 0 end desc,
                  r.days_away desc), '[]'::jsonb)
    into v
    from (select * from risky where away or dropped
           order by least(days_away, 60) + case when dropped then round(30 * (1 - recent_rate / nullif(prev_rate, 0)))::int else 0 end desc
           limit greatest(1, least(coalesce(p_limit, 100), 300))) r;
  return v;
end $$;

create or replace function public.engagement_mark_contacted(p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select org_id into v_org from public.members where id = p_member;
  if v_org is null then raise exception 'MEMBER_NOT_FOUND'; end if;
  if not private.has_permission(v_org, 'members.write') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  insert into public.engagement_contacts (org_id, member_id, staff_id) values (v_org, p_member, private.staff_id(v_org));
end $$;

create or replace function public.engagement_history(p_org uuid, p_status text default null, p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not private.has_permission(p_org, 'members.write') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(x order by (x ->> 'id')::bigint desc), '[]'::jsonb) into v from (
    select jsonb_build_object('id', o.id, 'created_at', o.created_at, 'sent_at', o.sent_at, 'status', o.status,
                              'channel', o.channel, 'kind', o.template_key, 'subject', o.subject, 'body', o.body,
                              'error', o.error, 'email', o.email, 'phone', o.phone, 'member_id', o.member_id,
                              'member_name', btrim(m.first_name || ' ' || m.last_name), 'sender', st.display_name) as x
      from public.message_outbox o
      join public.members m on m.id = o.member_id
      left join public.staff st on st.id = o.sender_staff_id
     where o.org_id = p_org
       and (p_status is null or p_status = '' or o.status = p_status
            or (p_status = 'pending' and o.status = 'queued'))
     order by o.id desc
     limit greatest(1, least(coalesce(p_limit, 100), 200))) q;
  return v;
end $$;

-- Staff registra que un socio nuevo vino recomendado por el código de otro
create or replace function public.referral_apply(p_member_new uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_new  public.members;
  v_ref  public.members;
  v_code text;
  v_id   uuid;
  v_paid boolean;
begin
  select * into v_new from public.members where id = p_member_new;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  if not private.has_permission(v_new.org_id, 'members.write') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  v_code := upper(regexp_replace(regexp_replace(coalesce(p_code, ''), '^.*ref=', ''), '[^A-Za-z0-9]', '', 'g'));
  select m.* into v_ref from public.member_referral_codes c join public.members m on m.id = c.member_id
   where c.org_id = v_new.org_id and c.code = v_code;
  if not found then raise exception 'REFERRAL_CODE_NOT_FOUND'; end if;
  if v_ref.id = v_new.id then raise exception 'REFERRAL_SELF'; end if;
  if v_new.billing_account_id is not null and v_new.billing_account_id = v_ref.billing_account_id then
    raise exception 'REFERRAL_SAME_FAMILY';
  end if;
  if exists (select 1 from public.referrals where referred_member_id = v_new.id) then raise exception 'REFERRAL_ALREADY'; end if;
  if v_new.created_at < now() - interval '60 days' then raise exception 'REFERRAL_NOT_NEW'; end if;

  insert into public.referrals (org_id, referrer_member_id, referred_member_id, code)
  values (v_new.org_id, v_ref.id, v_new.id, v_code) returning id into v_id;

  -- Si ya registró su primer pago, se acredita en el momento
  v_paid := v_new.billing_account_id is not null and exists (
    select 1 from public.payments p where p.billing_account_id = v_new.billing_account_id
       and p.status = 'succeeded' and p.amount_cents > 0);
  if v_paid then perform private.referral_reward(v_id); end if;
  return jsonb_build_object('referral_id', v_id, 'referrer', btrim(v_ref.first_name || ' ' || v_ref.last_name),
                            'rewarded', v_paid);
end $$;

-- ---------------------------------------------------------------------
-- 9 · App del socio (/app/yo)
-- ---------------------------------------------------------------------
create or replace function private.engagement_can_see_member(p_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_member in (select private.actable_member_ids())
      or exists (select 1 from public.members m where m.id = p_member and private.has_permission(m.org_id, 'members.read'))
$$;

-- Logros y rachas a partir de las entradas reales (un día = una visita)
create or replace function public.member_achievements(p_member uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz    text;
  v_today date;
  v_cur   int;
  v       jsonb;
begin
  if not private.engagement_can_see_member(p_member) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select o.timezone into v_tz from public.members m join public.organizations o on o.id = m.org_id where m.id = p_member;
  v_today := (now() at time zone v_tz)::date;
  v_cur := (date_trunc('week', v_today::timestamp)::date - date '2000-01-03') / 7;

  with days as (
    select (c.created_at at time zone v_tz)::date as d,
           min((c.created_at at time zone v_tz)::time) as first_t,
           max((c.created_at at time zone v_tz)::time) as last_t
      from public.checkins c where c.member_id = p_member and c.allowed
     group by 1
  ), weeks as (
    select distinct (date_trunc('week', d::timestamp)::date - date '2000-01-03') / 7 as wi from days
  ), isl as (
    select wi, wi - row_number() over (order by wi) as g from weeks
  ), runs as (
    select max(wi) as last_wi, count(*)::int as n from isl group by g
  ), months as (
    select date_trunc('month', d::timestamp) as mo, count(*)::int as n from days group by 1
  )
  select jsonb_build_object(
    'total', (select count(*) from days),
    'early', (select count(*) from days where first_t < time '08:00'),
    'night', (select count(*) from days where last_t >= time '21:00'),
    'this_month', coalesce((select n from months where mo = date_trunc('month', v_today::timestamp)), 0),
    'best_month', coalesce((select max(n) from months), 0),
    'this_week', (select count(*) from days where date_trunc('week', d::timestamp) = date_trunc('week', v_today::timestamp)),
    'week_streak', coalesce((select n from runs where last_wi >= v_cur - 1 order by last_wi desc limit 1), 0),
    'best_week_streak', coalesce((select max(n) from runs), 0),
    'last_visit', (select max(d) from days),
    'first_visit', (select min(d) from days)
  ) into v;
  return v;
end $$;

-- Código personal de referido (se crea la primera vez que se pide)
create or replace function private.referral_code_for(p_member uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  m      public.members;
  v_code text;
  v_base text;
  i      int := 0;
begin
  select code into v_code from public.member_referral_codes where member_id = p_member;
  if v_code is not null then return v_code; end if;
  select * into m from public.members where id = p_member;
  v_base := left(upper(regexp_replace(translate(coalesce(split_part(btrim(m.first_name), ' ', 1), ''),
              'áéíóúÁÉÍÓÚàèìòùÀÈÌÒÙâêîôûäëïöüÄËÏÖÜñÑçÇ', 'aeiouAEIOUaeiouAEIOUaeiouaeiouAEIOUnNcC'), '[^A-Za-z]', '', 'g')), 8);
  if length(v_base) < 2 then v_base := 'SOCIO'; end if;
  loop
    i := i + 1;
    v_code := v_base || (1000 + floor(random() * 9000))::int;
    begin
      insert into public.member_referral_codes (member_id, org_id, code) values (p_member, m.org_id, v_code);
      return v_code;
    exception when unique_violation then
      select code into v_code from public.member_referral_codes where member_id = p_member;
      if v_code is not null then return v_code; end if;
      if i > 20 then raise; end if;
    end;
  end loop;
end $$;
revoke execute on function private.referral_code_for(uuid) from public, anon, authenticated;

-- Todo lo de "Mi cuenta": código y referidos, días ganados, congelamientos
create or replace function public.member_engagement(p_member uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m        public.members;
  ms       public.memberships;
  s        public.engagement_settings;
  v_tz     text;
  v_today  date;
  v_used   int;
  v_payer  boolean;
  v_code   text;
begin
  if not private.engagement_can_see_member(p_member) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into m from public.members where id = p_member;
  select timezone into v_tz from public.organizations where id = m.org_id;
  v_today := (now() at time zone v_tz)::date;
  select * into s from public.engagement_settings where org_id = m.org_id;
  ms := private.engagement_current_membership(p_member);
  v_payer := ms.id is not null and (private.is_payer(ms.billing_account_id) or private.has_permission(m.org_id, 'members.write'));
  v_code := case when m.status in ('active', 'frozen') then private.referral_code_for(p_member) end;
  select coalesce(sum(f.days), 0) into v_used from public.membership_freezes f
   where f.billing_account_id = ms.billing_account_id and f.status <> 'canceled'
     and extract(year from f.starts_on) = extract(year from v_today);

  return jsonb_build_object(
    'referral', jsonb_build_object(
      'code', v_code,
      'reward_days', coalesce(s.referral_reward_days, 15),
      'days_earned', (select coalesce(sum(days), 0) from public.member_rewards
                       where member_id = p_member and kind in ('referral_by', 'referral_new') and status = 'applied'),
      'days_pending', (select coalesce(sum(days), 0) from public.member_rewards
                        where member_id = p_member and kind in ('referral_by', 'referral_new') and status = 'pending'),
      'list', coalesce((select jsonb_agg(jsonb_build_object(
                 'name', private.engagement_first_name(b.first_name) || coalesce(' ' || left(nullif(btrim(b.last_name), ''), 1) || '.', ''),
                 'status', r.status, 'created_at', r.created_at, 'rewarded_at', r.rewarded_at, 'days', r.reward_days)
                 order by r.created_at desc)
               from public.referrals r join public.members b on b.id = r.referred_member_id
              where r.referrer_member_id = p_member and r.status <> 'canceled'), '[]'::jsonb)),
    'birthday_gift_days', coalesce(s.birthday_gift_days, 1),
    'freeze', jsonb_build_object(
      'can_request', v_payer and ms.status in ('active', 'trialing'),
      'is_payer', v_payer,
      'membership_status', ms.status,
      'period_end', ms.current_period_end,
      'paused_until', ms.paused_until,
      'max_days_year', coalesce(s.freeze_max_days_year, 15),
      'min_days', 7,
      'used_this_year', v_used,
      'remaining', greatest(coalesce(s.freeze_max_days_year, 15) - v_used, 0),
      'today', v_today,
      'list', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'starts_on', f.starts_on, 'ends_on', f.ends_on,
                                                            'days', f.days, 'status', f.status) order by f.starts_on desc)
                          from public.membership_freezes f
                         where ms.id is not null and f.billing_account_id = ms.billing_account_id
                           and f.starts_on >= make_date(extract(year from v_today)::int, 1, 1)), '[]'::jsonb))
  );
end $$;

-- Congelar por vacaciones (titular de la cuenta)
create or replace function public.member_freeze_create(p_member uuid, p_start date, p_days int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m       public.members;
  ms      public.memberships;
  v_tz    text;
  v_today date;
  v_max   int;
  v_used  int;
  v_id    uuid;
begin
  select * into m from public.members where id = p_member;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  if not private.engagement_can_see_member(p_member) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select timezone into v_tz from public.organizations where id = m.org_id;
  v_today := (now() at time zone v_tz)::date;

  select * into ms from public.memberships
   where id = (private.engagement_current_membership(p_member)).id for update;
  if ms.id is null then raise exception 'MEMBERSHIP_REQUIRED'; end if;
  if not (private.is_payer(ms.billing_account_id) or private.has_permission(m.org_id, 'members.write')) then
    raise exception 'FREEZE_ONLY_PAYER' using errcode = '42501';
  end if;
  if ms.status not in ('active', 'trialing') then raise exception 'FREEZE_NOT_AVAILABLE'; end if;
  if p_start is null or p_start < v_today or p_start > v_today + 90 then raise exception 'FREEZE_BAD_START'; end if;
  if p_start >= (ms.current_period_end at time zone v_tz)::date then raise exception 'FREEZE_AFTER_PERIOD_END'; end if;
  if p_days is null or p_days < 7 then raise exception 'FREEZE_MIN_DAYS'; end if;

  select coalesce(s.freeze_max_days_year, 15) into v_max from public.engagement_settings s where s.org_id = m.org_id;
  v_max := coalesce(v_max, 15);
  -- tope anual por cuenta (no se reinicia cambiando de plan)
  perform pg_advisory_xact_lock(hashtext('freeze:' || ms.billing_account_id::text));
  select coalesce(sum(days), 0) into v_used from public.membership_freezes
   where billing_account_id = ms.billing_account_id and status <> 'canceled'
     and extract(year from starts_on) = extract(year from p_start);
  if v_used + p_days > v_max then
    raise exception 'FREEZE_LIMIT' using hint = format('Te quedan %s días para congelar este año.', greatest(v_max - v_used, 0));
  end if;
  if exists (select 1 from public.membership_freezes
              where billing_account_id = ms.billing_account_id and status in ('scheduled', 'active')
                and daterange(starts_on, ends_on) && daterange(p_start, p_start + p_days)) then
    raise exception 'FREEZE_OVERLAP';
  end if;

  insert into public.membership_freezes (org_id, membership_id, billing_account_id, member_id, starts_on, days)
  values (m.org_id, ms.id, ms.billing_account_id, p_member, p_start, p_days) returning id into v_id;
  -- Los días congelados se devuelven al final del plan
  update public.memberships set current_period_end = current_period_end + make_interval(days => p_days) where id = ms.id;
  if p_start = v_today then perform public.engagement_freeze_tick(); end if;

  return jsonb_build_object('id', v_id, 'starts_on', p_start, 'ends_on', p_start + p_days,
                            'period_end', (select current_period_end from public.memberships where id = ms.id),
                            'remaining', v_max - v_used - p_days);
end $$;

create or replace function public.member_freeze_cancel(p_freeze uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.membership_freezes;
begin
  select * into f from public.membership_freezes where id = p_freeze for update;
  if not found then raise exception 'FREEZE_NOT_FOUND'; end if;
  if not (private.is_payer(f.billing_account_id) or private.has_permission(f.org_id, 'members.write')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if f.status <> 'scheduled' then raise exception 'FREEZE_NOT_CANCELABLE'; end if;
  update public.membership_freezes set status = 'canceled', canceled_at = now() where id = f.id;
  update public.memberships set current_period_end = current_period_end - make_interval(days => f.days)
   where id = f.membership_id;
end $$;

revoke execute on function public.engagement_admin_get(uuid), public.engagement_save_notice(uuid, text, boolean, text, text),
  public.engagement_save_rules(uuid, int, int, int), public.engagement_at_risk(uuid, int), public.engagement_mark_contacted(uuid),
  public.engagement_history(uuid, text, int), public.referral_apply(uuid, text), public.member_achievements(uuid),
  public.member_engagement(uuid), public.member_freeze_create(uuid, date, int), public.member_freeze_cancel(uuid)
  from public, anon;
grant execute on function public.engagement_admin_get(uuid), public.engagement_save_notice(uuid, text, boolean, text, text),
  public.engagement_save_rules(uuid, int, int, int), public.engagement_at_risk(uuid, int), public.engagement_mark_contacted(uuid),
  public.engagement_history(uuid, text, int), public.referral_apply(uuid, text), public.member_achievements(uuid),
  public.member_engagement(uuid), public.member_freeze_create(uuid, date, int), public.member_freeze_cancel(uuid)
  to authenticated;
revoke execute on function private.engagement_can_see_member(uuid), private.engagement_can_manage(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 10 · Agenda (pg_cron)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $c$select cron.schedule('engagement-daily', '0 12 * * *', 'select public.engagement_generate(null)')$c$;
    execute $c$select cron.schedule('engagement-freezes', '5 3 * * *', 'select public.engagement_freeze_tick()')$c$;
  end if;
end $$;
