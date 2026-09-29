-- =====================================================================
-- 0020 · Lectores biométricos ZKTeco (SpeedFace V4L Pro / V5L) por ADMS
--
-- El lector se conecta solo (protocolo "Servidor en la nube / ADMS") a
-- /iclock/* en Vercel. Nada de PCs en el gimnasio.
--
--   · Cada socio tiene un número de acceso (access_pin) que es su "ID" en
--     el lector. Se asigna solo (100001, 100002, …).
--   · El lector abre el molinete por su cuenta (funciona aunque se corte
--     internet). El sistema decide QUIÉN está cargado en el lector:
--       al día  → se lo da de alta (con sus caras/palmas/huellas guardadas)
--       vencido, moroso, congelado → se lo borra del lector
--     Un "reconciliador" compara lo que debería haber con lo que hay y
--     encola comandos. Corre cuando cambia un pago/membresía y cada 5 min
--     (los vencimientos son por fecha, no por un cambio en la base).
--   · Las plantillas biométricas (NO fotos) se guardan para restaurarlas
--     cuando el socio paga y para copiarlas al otro lector: se registra la
--     cara una sola vez. Solo las lee el servidor (sin permisos de API).
--   · Cada entrada que marca el lector llega como check-in.
--
-- Seguridad: el protocolo ADMS no tiene contraseña; el lector se identifica
-- por número de serie. Por eso (1) el lector hay que registrarlo a mano en
-- el panel, (2) se fija la IP pública desde la que se conecta la primera vez
-- y si cambia hay que confirmarla en el panel, y (3) las funciones adms_*
-- solo las puede ejecutar el servidor (service_role), nunca un navegador.
-- =====================================================================

-- 1 · Número de acceso y consentimiento -----------------------------------
alter table public.members add column if not exists access_pin int check (access_pin between 1 and 999999999);
alter table public.members add column if not exists biometric_consent_at timestamptz;
create unique index if not exists members_org_pin_uidx on public.members (org_id, access_pin) where access_pin is not null;

create or replace function private.members_assign_pin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.access_pin is null then
    perform pg_advisory_xact_lock(hashtext('access_pin:' || new.org_id::text));
    select coalesce(max(access_pin), 100000) + 1 into new.access_pin
      from public.members where org_id = new.org_id and access_pin between 100001 and 999999;
  end if;
  return new;
end $$;
drop trigger if exists members_assign_pin on public.members;
create trigger members_assign_pin before insert on public.members
  for each row execute function private.members_assign_pin();

update public.members m set access_pin = 100000 + x.rn
  from (select id, row_number() over (partition by org_id order by created_at, id) as rn
          from public.members where access_pin is null) x
 where x.id = m.id;

-- El socio no puede tocar su número de acceso ni el consentimiento
create or replace function public.members_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     or current_setting('app.linking_user', true) = 'on'
     or current_setting('app.access_sync', true) = 'on'
     or private.has_permission(old.org_id, 'members.write') then
    return new;
  end if;
  -- Staff activo registrando una entrada/asistencia: solo puede mover last_checkin_at
  if private.staff_id(old.org_id) is not null
     and (to_jsonb(new) - 'last_checkin_at' - 'updated_at') = (to_jsonb(old) - 'last_checkin_at' - 'updated_at') then
    return new;
  end if;
  if new.org_id is distinct from old.org_id
     or new.user_id is distinct from old.user_id
     or new.billing_account_id is distinct from old.billing_account_id
     or new.status is distinct from old.status
     or new.tags is distinct from old.tags
     or new.medical_notes is distinct from old.medical_notes
     or new.document_id is distinct from old.document_id
     or new.last_checkin_at is distinct from old.last_checkin_at
     or new.access_pin is distinct from old.access_pin
     or new.biometric_consent_at is distinct from old.biometric_consent_at then
    raise exception 'FIELD_NOT_EDITABLE_BY_MEMBER';
  end if;
  return new;
end $$;

-- "Bloquear al vencer": Evolution sin días de gracia (vale también para el QR)
update public.organizations set grace_days = 0 where slug = 'evolution';

-- 2 · Tablas ----------------------------------------------------------------
create table if not exists public.access_devices (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  location_id     uuid not null,
  serial_number   text not null unique check (serial_number ~ '^[A-Z0-9]{6,32}$'),
  name            text not null default 'Lector',
  active          boolean not null default true,
  trusted_ip      text,               -- IP pública fijada en la primera conexión
  last_ip         text,
  pending_ip      text,               -- se conectó desde otra IP: hay que confirmarla
  pending_ip_at   timestamptz,
  last_seen_at    timestamptz,
  info            jsonb not null default '{}'::jsonb,   -- modelo, firmware, cantidad de usuarios…
  attlog_stamp    text,
  operlog_stamp   text,
  created_at      timestamptz not null default now(),
  foreign key (location_id, org_id) references public.locations (id, org_id)
);
create index if not exists access_devices_org_idx on public.access_devices (org_id);

-- Lo que creemos que hay cargado en cada lector
create table if not exists public.access_device_users (
  device_id   uuid not null references public.access_devices (id) on delete cascade,
  pin         int  not null,
  org_id      uuid not null,
  member_id   uuid references public.members (id) on delete set null,
  name        text,
  managed     boolean not null default true,     -- false = lo cargaron a mano en el lector y no está vinculado
  state       text not null default 'present' check (state in ('present', 'absent', 'error')),
  has_bio     boolean not null default false,    -- tiene cara/palma/huella registrada en ESTE lector
  updated_at  timestamptz not null default now(),
  primary key (device_id, pin)
);
create index if not exists access_device_users_member_idx on public.access_device_users (member_id);

-- Plantillas biométricas (texto del protocolo, sin foto). Sin permisos de API.
create table if not exists public.access_templates (
  org_id            uuid not null references public.organizations (id) on delete cascade,
  pin               int  not null,
  tbl               text not null check (tbl in ('BIODATA', 'FP', 'FACE')),
  tkey              text not null,          -- tipo/número/índice de la plantilla
  pin_key           text not null default 'PIN',
  fields            text not null,          -- resto de la línea (sin el PIN)
  source_device_id  uuid references public.access_devices (id) on delete set null,
  updated_at        timestamptz not null default now(),
  primary key (org_id, pin, tbl, tkey)
);

create table if not exists public.access_commands (
  id           bigint generated always as identity primary key,
  device_id    uuid not null references public.access_devices (id) on delete cascade,
  org_id       uuid not null,
  pin          int,
  member_id    uuid,
  kind         text not null check (kind in ('user_put', 'user_del', 'bio_put', 'enroll', 'query', 'other')),
  command      text not null,
  status       text not null default 'pending' check (status in ('pending', 'sent', 'ok', 'error', 'superseded')),
  return_code  int,
  attempts     int not null default 0,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz,
  done_at      timestamptz
);
create index if not exists access_commands_queue_idx on public.access_commands (device_id, id) where status in ('pending', 'sent');
create index if not exists access_commands_member_idx on public.access_commands (member_id, created_at desc);

-- Lectores que se conectaron pero nadie registró todavía (para encontrarlos en el panel)
create table if not exists public.access_unknown_devices (
  serial_number text primary key,
  ip            text,
  info          jsonb not null default '{}'::jsonb,
  hits          int not null default 1,
  last_seen_at  timestamptz not null default now()
);

-- Registro técnico de lo que manda el lector (para diagnosticar). Se borra a los 14 días.
create table if not exists public.access_device_log (
  id          bigint generated always as identity primary key,
  serial      text,
  ip          text,
  method      text,
  path        text,
  query       text,
  body        text,
  result      text,
  created_at  timestamptz not null default now()
);
create index if not exists access_device_log_time_idx on public.access_device_log (created_at desc);

alter table public.access_devices         enable row level security;
alter table public.access_device_users    enable row level security;
alter table public.access_templates       enable row level security;
alter table public.access_commands        enable row level security;
alter table public.access_unknown_devices enable row level security;
alter table public.access_device_log      enable row level security;

revoke all on public.access_devices, public.access_device_users, public.access_templates, public.access_commands,
              public.access_unknown_devices, public.access_device_log from anon, authenticated;
grant all on public.access_devices, public.access_device_users, public.access_templates, public.access_commands,
              public.access_unknown_devices, public.access_device_log to service_role;
grant select on public.access_devices, public.access_device_users to authenticated;
grant select (id, device_id, org_id, pin, member_id, kind, status, return_code, attempts, created_at, sent_at, done_at)
  on public.access_commands to authenticated;

drop policy if exists access_devices_select on public.access_devices;
create policy access_devices_select on public.access_devices for select to authenticated
  using ((select private.has_permission(org_id, 'org.manage')) or (select private.has_permission(org_id, 'checkins.manage')));
drop policy if exists access_device_users_select on public.access_device_users;
create policy access_device_users_select on public.access_device_users for select to authenticated
  using ((select private.has_permission(org_id, 'org.manage')) or (select private.has_permission(org_id, 'checkins.manage'))
         or (select private.has_permission(org_id, 'members.read')));
drop policy if exists access_commands_select on public.access_commands;
create policy access_commands_select on public.access_commands for select to authenticated
  using ((select private.has_permission(org_id, 'org.manage')) or (select private.has_permission(org_id, 'checkins.manage')));

-- 3 · ¿Puede entrar? (misma regla que el QR + morosos afuera) ------------------
create or replace function private.member_access_allowed(p_member uuid, p_at timestamptz default now()) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select m.status not in ('frozen', 'archived', 'lead')
       and not coalesce((select ba.delinquent from public.billing_accounts ba where ba.id = m.billing_account_id), false)
       and (
         -- Clase reservada que empieza dentro de la próxima hora (o empezó hace menos de 30 min)
         exists (select 1 from public.bookings b join public.class_sessions s on s.id = b.session_id
                  where b.member_id = m.id and b.status = 'booked'
                    and s.starts_at between p_at - interval '30 minutes' and p_at + interval '60 minutes')
         -- o un plan con sala libre vigente
         or exists (select 1 from public.membership_members mm
                      join public.memberships ms on ms.id = mm.membership_id
                      join public.membership_plans p on p.id = ms.plan_id
                      join public.billing_accounts ba on ba.id = ms.billing_account_id
                      join public.organizations o on o.id = ms.org_id
                     where mm.member_id = m.id and p.includes_open_gym
                       and ms.status in ('active', 'trialing')
                       and not ba.delinquent
                       and (ms.paused_until is null or ms.paused_until <= p_at)
                       and p_at >= ms.current_period_start - interval '1 day'
                       and p_at < ms.current_period_end + make_interval(days => o.grace_days))
       )
      from public.members m where m.id = p_member
  ), false)
$$;
revoke execute on function private.member_access_allowed(uuid, timestamptz) from public, anon, authenticated;

-- 4 · Armado de comandos -----------------------------------------------------
create or replace function private.adms_clean_name(p_first text, p_last text) returns text
language sql immutable set search_path = '' as $$
  select left(regexp_replace(
           translate(trim(coalesce(p_first, '') || ' ' || coalesce(p_last, '')),
                     'áéíóúÁÉÍÓÚàèìòùÀÈÌÒÙâêîôûäëïöüÄËÏÖÜñÑçÇ', 'aeiouAEIOUaeiouAEIOUaeiouaeiouAEIOUnNcC'),
           '[^A-Za-z0-9 .''-]', '', 'g'), 24)
$$;

create or replace function private.access_queue(p_device uuid, p_org uuid, p_pin int, p_member uuid, p_kind text, p_cmd text)
returns bigint
language sql security definer set search_path = '' as $$
  insert into public.access_commands (device_id, org_id, pin, member_id, kind, command)
  values (p_device, p_org, p_pin, p_member, p_kind, p_cmd)
  returning id
$$;

-- Alta (o actualización) del socio en un lector + sus plantillas guardadas
create or replace function private.access_push_user(p_device uuid, p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m     public.members;
  t     record;
  v_bio boolean := false;
begin
  select * into m from public.members where id = p_member;
  if m.access_pin is null then return; end if;
  update public.access_commands set status = 'superseded'
   where device_id = p_device and pin = m.access_pin and status = 'pending' and kind in ('user_put', 'user_del', 'bio_put');

  perform private.access_queue(p_device, m.org_id, m.access_pin, m.id, 'user_put',
    'DATA UPDATE USERINFO PIN=' || m.access_pin || E'\tName=' || private.adms_clean_name(m.first_name, m.last_name)
    || E'\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000');
  for t in select * from public.access_templates where org_id = m.org_id and pin = m.access_pin order by tbl, tkey loop
    perform private.access_queue(p_device, m.org_id, m.access_pin, m.id, 'bio_put',
      'DATA UPDATE ' || case t.tbl when 'FP' then 'FINGERTMP' else t.tbl end || ' ' || t.pin_key || '=' || m.access_pin || E'\t' || t.fields);
    v_bio := true;
  end loop;

  insert into public.access_device_users (device_id, pin, org_id, member_id, name, managed, state, has_bio, updated_at)
  values (p_device, m.access_pin, m.org_id, m.id, private.adms_clean_name(m.first_name, m.last_name), true, 'present', v_bio, now())
  on conflict (device_id, pin) do update
     set member_id = excluded.member_id, name = excluded.name, managed = true, state = 'present',
         has_bio = excluded.has_bio or public.access_device_users.has_bio, updated_at = now();
end $$;

create or replace function private.access_delete_user(p_device uuid, p_pin int) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_member uuid;
begin
  select org_id, member_id into v_org, v_member from public.access_device_users where device_id = p_device and pin = p_pin;
  if v_org is null then select org_id into v_org from public.access_devices where id = p_device; end if;
  update public.access_commands set status = 'superseded'
   where device_id = p_device and pin = p_pin and status = 'pending' and kind in ('user_put', 'user_del', 'bio_put', 'enroll');
  perform private.access_queue(p_device, v_org, p_pin, v_member, 'user_del', 'DATA DELETE USERINFO PIN=' || p_pin);
  update public.access_device_users set state = 'absent', has_bio = false, updated_at = now()
   where device_id = p_device and pin = p_pin;
end $$;

-- 5 · Reconciliador ------------------------------------------------------------
create or replace function private.access_reconcile(p_org uuid, p_members uuid[] default null) returns int
language plpgsql security definer set search_path = '' as $$
declare
  r   record;
  v_n int := 0;
begin
  if not exists (select 1 from public.access_devices where org_id = p_org and active) then return 0; end if;
  for r in
    select d.id as device_id, m.id as member_id, m.access_pin as pin,
           private.member_access_allowed(m.id) as allowed,
           du.state as cur_state, du.managed, du.member_id as du_member
      from public.access_devices d
      join public.members m on m.org_id = d.org_id and m.access_pin is not null
      left join public.access_device_users du on du.device_id = d.id and du.pin = m.access_pin
     where d.org_id = p_org and d.active
       and (p_members is null or m.id = any (p_members))
  loop
    -- Ese número ya lo usa alguien cargado a mano en el lector: no se pisa (se ve en el panel)
    if r.cur_state is not null and not r.managed and r.du_member is distinct from r.member_id then
      continue;
    end if;
    if r.allowed and coalesce(r.cur_state, 'absent') = 'absent' then
      perform private.access_push_user(r.device_id, r.member_id);
      v_n := v_n + 1;
    elsif not r.allowed and r.cur_state in ('present', 'error') then
      perform private.access_delete_user(r.device_id, r.pin);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

create or replace function public.access_reconcile_all() returns int
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_n int := 0;
begin
  perform set_config('app.access_sync', 'on', true);
  for v_org in select distinct org_id from public.access_devices where active loop
    v_n := v_n + private.access_reconcile(v_org);
  end loop;
  delete from public.access_device_log where created_at < now() - interval '14 days';
  delete from public.access_unknown_devices where last_seen_at < now() - interval '7 days';
  delete from public.access_commands where status in ('ok', 'superseded') and created_at < now() - interval '30 days';
  return v_n;
end $$;
revoke execute on function public.access_reconcile_all() from public, anon, authenticated;

-- Disparadores: pago, membresía, moroso, estado del socio → reconciliar al toque
create or replace function private.access_touch(p_org uuid, p_members uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_members is null or cardinality(p_members) = 0 then return; end if;
  if exists (select 1 from public.access_devices where org_id = p_org and active) then
    perform private.access_reconcile(p_org, p_members);
  end if;
end $$;

create or replace function private.access_on_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.access_touch(new.org_id,
    array(select member_id from public.membership_members where membership_id = new.id));
  return null;
end $$;
drop trigger if exists access_on_membership on public.memberships;
create trigger access_on_membership after insert or update of status, current_period_start, current_period_end, paused_until
  on public.memberships for each row execute function private.access_on_membership();

create or replace function private.access_on_membership_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform private.access_touch(old.org_id, array[old.member_id]);
  else
    perform private.access_touch(new.org_id, array[new.member_id]);
  end if;
  return null;
end $$;
drop trigger if exists access_on_membership_member on public.membership_members;
create trigger access_on_membership_member after insert or delete on public.membership_members
  for each row execute function private.access_on_membership_member();

create or replace function private.access_on_billing() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.access_touch(new.org_id, array(select id from public.members where billing_account_id = new.id));
  return null;
end $$;
drop trigger if exists access_on_billing on public.billing_accounts;
create trigger access_on_billing after update of delinquent on public.billing_accounts
  for each row execute function private.access_on_billing();

create or replace function private.access_on_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.access_pin is distinct from old.access_pin and old.access_pin is not null then
    -- cambió el número: se borra el viejo de los lectores
    perform private.access_delete_user(du.device_id, du.pin)
       from public.access_device_users du
      where du.org_id = new.org_id and du.pin = old.access_pin and du.managed and du.state <> 'absent';
  end if;
  perform private.access_touch(new.org_id, array[new.id]);
  return null;
end $$;
drop trigger if exists access_on_member on public.members;
create trigger access_on_member after update of status, access_pin, billing_account_id on public.members
  for each row execute function private.access_on_member();

-- 6 · Entrada marcada en el lector → check-in --------------------------------------
create or replace function private.access_punch(p_device public.access_devices, p_pin int, p_at timestamptz, p_verify int)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  m         public.members;
  v_booking uuid;
  v_method  public.checkin_method;
  v_ok      boolean;
begin
  select * into m from public.members where org_id = p_device.org_id and access_pin = p_pin;
  if not found then return false; end if;
  if p_at < p_device.created_at - interval '1 day' or p_at > now() + interval '1 day' then
    return false;          -- historial viejo del lector o reloj desfasado
  end if;
  if exists (select 1 from public.checkins where member_id = m.id
              and created_at between p_at - interval '2 minutes' and p_at + interval '2 minutes') then
    return false;          -- ya registrado (reintento del lector o doble lectura)
  end if;

  v_method := case
    when p_verify in (1, 2, 5, 6, 9, 10, 12, 13, 14) then 'fingerprint'
    when p_verify in (15, 16, 17) then 'facial'
    when p_verify in (25, 26, 27) then 'palm'
    when p_verify in (4, 7, 11) then 'nfc'
    else 'facial' end::public.checkin_method;
  v_ok := private.member_access_allowed(m.id, p_at);

  select b.id into v_booking from public.bookings b
    join public.class_sessions s on s.id = b.session_id
   where b.member_id = m.id and b.status = 'booked'
     and s.starts_at between p_at - interval '30 minutes' and p_at + interval '60 minutes'
   order by s.starts_at limit 1;

  insert into public.checkins (org_id, location_id, member_id, booking_id, method, allowed, reason, scanned_by, created_at)
  values (m.org_id, p_device.location_id, m.id, v_booking, v_method, true,
          case when v_ok then null else 'DEVICE_OUT_OF_SYNC' end, null, p_at);
  perform set_config('app.access_sync', 'on', true);
  update public.members set last_checkin_at = greatest(coalesce(last_checkin_at, p_at), p_at) where id = m.id;
  if v_booking is not null then
    update public.bookings set status = 'checked_in', checked_in_at = p_at where id = v_booking;
  end if;
  insert into public.domain_events (org_id, type, member_id, payload)
  values (m.org_id, 'checkin.allowed', m.id,
          jsonb_build_object('source', 'device', 'device_id', p_device.id, 'location_id', p_device.location_id,
                             'method', v_method, 'out_of_sync', not v_ok));
  return true;
end $$;

-- 7 · Endpoints del protocolo (solo el servidor) ------------------------------------
-- Portero: ¿quién es y desde dónde se conecta?
create or replace function private.adms_gate(p_sn text, p_ip text, p_info jsonb default '{}'::jsonb)
returns public.access_devices
language plpgsql security definer set search_path = '' as $$
declare
  d    public.access_devices;
  v_sn text := upper(regexp_replace(coalesce(p_sn, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if v_sn = '' then return null; end if;
  select * into d from public.access_devices where serial_number = v_sn;
  if not found then
    insert into public.access_unknown_devices as u (serial_number, ip, info)
    values (left(v_sn, 32), p_ip, coalesce(p_info, '{}'::jsonb))
    on conflict (serial_number) do update
       set ip = excluded.ip, hits = u.hits + 1, last_seen_at = now(), info = u.info || excluded.info;
    return null;
  end if;
  if d.trusted_ip is null then
    update public.access_devices set trusted_ip = p_ip where id = d.id;
    d.trusted_ip := p_ip;
  end if;
  if d.trusted_ip is distinct from p_ip then
    update public.access_devices set pending_ip = p_ip, pending_ip_at = now() where id = d.id;
    d.active := false;               -- el que llama lo trata como no habilitado
    return d;
  end if;
  update public.access_devices
     set last_seen_at = now(), last_ip = p_ip, pending_ip = null, pending_ip_at = null,
         info = info || coalesce(p_info, '{}'::jsonb)
   where id = d.id
  returning * into d;
  return d;
end $$;

-- Saludo inicial (GET /iclock/cdata?options=all)
create or replace function public.adms_hello(p_sn text, p_ip text, p_info jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.access_devices; v_tz text;
begin
  d := private.adms_gate(p_sn, p_ip, p_info);
  if d.id is null then return jsonb_build_object('status', 'unknown'); end if;
  if not d.active then
    return jsonb_build_object('status', case when d.pending_ip is not null then 'untrusted' else 'inactive' end);
  end if;
  select coalesce(l.timezone, o.timezone) into v_tz
    from public.locations l join public.organizations o on o.id = l.org_id where l.id = d.location_id;
  return jsonb_build_object('status', 'ok', 'device_id', d.id, 'timezone', v_tz,
                            'attlog_stamp', d.attlog_stamp, 'operlog_stamp', d.operlog_stamp);
end $$;

-- Datos que sube el lector (POST /iclock/cdata?table=…). p_records ya viene parseado:
--   {"k":"att","pin":123,"t":"2026-09-29 18:03:11","v":15}
--   {"k":"user","pin":123,"name":"Juan"}
--   {"k":"bio","tbl":"BIODATA","pin":123,"pin_key":"Pin","key":"9:0:0","fields":"No=0\tIndex=0\t…"}
create or replace function public.adms_push(p_sn text, p_ip text, p_table text, p_stamp text, p_records jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d       public.access_devices;
  r       jsonb;
  v_tz    text;
  v_pin   int;
  v_at    timestamptz;
  v_mem   uuid;
  v_ok    int := 0;
  v_other record;
begin
  d := private.adms_gate(p_sn, p_ip);
  if d.id is null then return jsonb_build_object('status', 'unknown'); end if;
  if not d.active then return jsonb_build_object('status', 'untrusted'); end if;
  perform set_config('app.access_sync', 'on', true);

  select coalesce(l.timezone, o.timezone) into v_tz
    from public.locations l join public.organizations o on o.id = l.org_id where l.id = d.location_id;

  for r in select * from jsonb_array_elements(coalesce(p_records, '[]'::jsonb)) loop
    begin
      v_pin := nullif(regexp_replace(r ->> 'pin', '\D', '', 'g'), '')::int;
      if v_pin is null then continue; end if;

      if r ->> 'k' = 'att' then
        v_at := case when (r ->> 't') ~ '^\d{9,11}$' then to_timestamp((r ->> 't')::bigint)
                     else ((r ->> 't')::timestamp at time zone v_tz) end;
        if private.access_punch(d, v_pin, v_at, coalesce((r ->> 'v')::int, 15)) then v_ok := v_ok + 1; end if;

      elsif r ->> 'k' = 'user' then
        select id into v_mem from public.members where org_id = d.org_id and access_pin = v_pin;
        insert into public.access_device_users as du (device_id, pin, org_id, member_id, name, managed, state, updated_at)
        values (d.id, v_pin, d.org_id, v_mem, left(r ->> 'name', 40), v_mem is not null, 'present', now())
        on conflict (device_id, pin) do update
           set name = excluded.name, state = 'present', updated_at = now(),
               member_id = coalesce(du.member_id, excluded.member_id),
               managed = du.managed or excluded.managed;
        v_ok := v_ok + 1;

      elsif r ->> 'k' = 'bio' then
        insert into public.access_templates as t (org_id, pin, tbl, tkey, pin_key, fields, source_device_id, updated_at)
        values (d.org_id, v_pin, r ->> 'tbl', coalesce(r ->> 'key', '0'), coalesce(r ->> 'pin_key', 'PIN'),
                r ->> 'fields', d.id, now())
        on conflict (org_id, pin, tbl, tkey) do update
           set fields = excluded.fields, pin_key = excluded.pin_key, source_device_id = excluded.source_device_id, updated_at = now();
        update public.access_device_users set has_bio = true, updated_at = now() where device_id = d.id and pin = v_pin;
        -- Se registró en un lector → se copia a los otros donde el socio está cargado
        select id into v_mem from public.members where org_id = d.org_id and access_pin = v_pin;
        if v_mem is not null then
          for v_other in select du.device_id from public.access_device_users du
                          join public.access_devices o on o.id = du.device_id and o.active
                         where du.org_id = d.org_id and du.pin = v_pin and du.device_id <> d.id and du.state = 'present' loop
            perform private.access_queue(v_other.device_id, d.org_id, v_pin, v_mem, 'bio_put',
              'DATA UPDATE ' || case r ->> 'tbl' when 'FP' then 'FINGERTMP' else r ->> 'tbl' end || ' ' || coalesce(r ->> 'pin_key', 'PIN') || '=' || v_pin || E'\t' || (r ->> 'fields'));
            update public.access_device_users set has_bio = true where device_id = v_other.device_id and pin = v_pin;
          end loop;
        end if;
        v_ok := v_ok + 1;
      end if;
    exception when others then
      insert into public.access_device_log (serial, ip, method, path, body, result)
      values (d.serial_number, p_ip, 'ERR', p_table, left(r::text, 500), sqlerrm);
    end;
  end loop;

  if p_stamp is not null and p_stamp <> '' then
    if upper(p_table) = 'ATTLOG' then update public.access_devices set attlog_stamp = left(p_stamp, 40) where id = d.id;
    elsif upper(p_table) = 'OPERLOG' then update public.access_devices set operlog_stamp = left(p_stamp, 40) where id = d.id;
    end if;
  end if;
  return jsonb_build_object('status', 'ok', 'accepted', v_ok);
end $$;

-- El lector pide trabajo (GET /iclock/getrequest)
create or replace function public.adms_poll(p_sn text, p_ip text, p_max_bytes int default 48000) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d      public.access_devices;
  c      record;
  v_out  jsonb := '[]'::jsonb;
  v_size int := 0;
begin
  d := private.adms_gate(p_sn, p_ip);
  if d.id is null or not d.active then return v_out; end if;
  -- Enviados hace rato sin respuesta: se reintentan (hasta 5 veces)
  update public.access_commands set status = 'pending'
   where device_id = d.id and status = 'sent' and sent_at < now() - interval '5 minutes' and attempts < 5;
  update public.access_commands set status = 'error', return_code = -9999, done_at = now()
   where device_id = d.id and status = 'sent' and sent_at < now() - interval '5 minutes' and attempts >= 5;

  for c in select id, command from public.access_commands
            where device_id = d.id and status = 'pending' order by id limit 200 for update skip locked loop
    exit when v_size > 0 and v_size + length(c.command) > p_max_bytes;
    v_out := v_out || jsonb_build_object('id', c.id, 'cmd', c.command);
    v_size := v_size + length(c.command) + 16;
    update public.access_commands set status = 'sent', sent_at = now(), attempts = attempts + 1 where id = c.id;
  end loop;
  return v_out;
end $$;

-- Resultado de los comandos (POST /iclock/devicecmd): [{"id":12,"ret":0}, …]
create or replace function public.adms_results(p_sn text, p_ip text, p_results jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  d   public.access_devices;
  r   jsonb;
  c   public.access_commands;
  v_n int := 0;
begin
  d := private.adms_gate(p_sn, p_ip);
  if d.id is null or not d.active then return 0; end if;
  for r in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    update public.access_commands
       set status = case when (r ->> 'ret')::int >= 0 then 'ok' else 'error' end,
           return_code = (r ->> 'ret')::int, done_at = now()
     where id = (r ->> 'id')::bigint and device_id = d.id and status in ('sent', 'pending')
    returning * into c;
    if c.id is null then continue; end if;
    v_n := v_n + 1;
    if c.status = 'error' then
      if c.kind = 'user_put' then
        update public.access_device_users set state = 'error', updated_at = now() where device_id = d.id and pin = c.pin;
      elsif c.kind = 'bio_put' then
        update public.access_device_users set has_bio = false, updated_at = now() where device_id = d.id and pin = c.pin;
      end if;
    end if;
    c := null;
  end loop;
  return v_n;
end $$;

create or replace function public.adms_log(p_sn text, p_ip text, p_method text, p_path text, p_query text, p_body text, p_result text)
returns void
language sql security definer set search_path = '' as $$
  insert into public.access_device_log (serial, ip, method, path, query, body, result)
  values (left(p_sn, 40), left(p_ip, 64), left(p_method, 10), left(p_path, 100), left(p_query, 500), left(p_body, 2000), left(p_result, 500))
$$;

revoke execute on function public.adms_hello(text, text, jsonb), public.adms_push(text, text, text, text, jsonb),
  public.adms_poll(text, text, int), public.adms_results(text, text, jsonb),
  public.adms_log(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.adms_hello(text, text, jsonb), public.adms_push(text, text, text, text, jsonb),
  public.adms_poll(text, text, int), public.adms_results(text, text, jsonb),
  public.adms_log(text, text, text, text, text, text, text), public.access_reconcile_all() to service_role;

-- 8 · Acciones del panel -------------------------------------------------------------
create or replace function private.access_device_for_admin(p_device uuid, p_perm text default 'org.manage')
returns public.access_devices
language plpgsql stable security definer set search_path = '' as $$
declare d public.access_devices;
begin
  select * into d from public.access_devices where id = p_device;
  if not found then raise exception 'DEVICE_NOT_FOUND'; end if;
  if not private.has_permission(d.org_id, p_perm) then raise exception 'FORBIDDEN'; end if;
  return d;
end $$;

create or replace function public.access_device_register(p_org uuid, p_serial text, p_name text, p_location uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_sn  text := upper(regexp_replace(coalesce(p_serial, ''), '[^A-Za-z0-9]', '', 'g'));
  v_loc uuid := p_location;
  v_id  uuid;
begin
  if not private.has_permission(p_org, 'org.manage') then raise exception 'FORBIDDEN'; end if;
  if v_sn !~ '^[A-Z0-9]{6,32}$' then raise exception 'INVALID_SERIAL'; end if;
  if exists (select 1 from public.access_devices where serial_number = v_sn) then raise exception 'SERIAL_TAKEN'; end if;
  if v_loc is null then
    select id into v_loc from public.locations where org_id = p_org and active order by created_at limit 1;
  end if;
  insert into public.access_devices (org_id, location_id, serial_number, name, trusted_ip, info)
  select p_org, v_loc, v_sn, coalesce(nullif(trim(p_name), ''), 'Lector'), u.ip, coalesce(u.info, '{}'::jsonb)
    from (select 1) x left join public.access_unknown_devices u on u.serial_number = v_sn
  returning id into v_id;
  delete from public.access_unknown_devices where serial_number = v_sn;
  -- Primero preguntamos qué tiene cargado, después damos de alta a los socios al día
  perform private.access_queue(v_id, p_org, null, null, 'query', 'DATA QUERY USERINFO');
  perform set_config('app.access_sync', 'on', true);
  perform private.access_reconcile(p_org);
  return v_id;
end $$;

create or replace function public.access_device_update(p_device uuid, p_name text, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.access_devices;
begin
  d := private.access_device_for_admin(p_device);
  update public.access_devices set name = coalesce(nullif(trim(p_name), ''), name), active = p_active where id = d.id;
  if p_active then perform set_config('app.access_sync', 'on', true); perform private.access_reconcile(d.org_id); end if;
end $$;

create or replace function public.access_device_confirm_ip(p_device uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.access_devices;
begin
  d := private.access_device_for_admin(p_device);
  if d.pending_ip is null then return; end if;
  update public.access_devices set trusted_ip = pending_ip, pending_ip = null, pending_ip_at = null where id = d.id;
end $$;

create or replace function public.access_device_delete(p_device uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.access_devices;
begin
  d := private.access_device_for_admin(p_device);
  delete from public.access_devices where id = d.id;
end $$;

-- "Reenviar todo": vuelve a cargar a todos los socios al día (por si se reseteó el lector)
create or replace function public.access_device_resync(p_device uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare d public.access_devices;
begin
  d := private.access_device_for_admin(p_device);
  update public.access_commands set status = 'superseded' where device_id = d.id and status = 'pending';
  update public.access_device_users set state = 'absent' where device_id = d.id and managed;
  perform private.access_queue(d.id, d.org_id, null, null, 'query', 'DATA QUERY USERINFO');
  perform set_config('app.access_sync', 'on', true);
  return private.access_reconcile(d.org_id);
end $$;

create or replace function public.access_device_query_users(p_device uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.access_devices;
begin
  d := private.access_device_for_admin(p_device);
  perform private.access_queue(d.id, d.org_id, null, null, 'query', 'DATA QUERY USERINFO');
end $$;

-- Registrar la cara del socio: lo carga en el lector (si está al día) y le pide al
-- lector que abra la pantalla de registro. Queda anotado el consentimiento.
create or replace function public.access_enroll(p_member uuid, p_device uuid, p_bio_type int default 9) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  d  public.access_devices;
  m  public.members;
  du public.access_device_users;
begin
  d := private.access_device_for_admin(p_device, 'checkins.manage');
  select * into m from public.members where id = p_member and org_id = d.org_id;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  if not private.member_access_allowed(m.id) then raise exception 'ACCESS_NOT_ALLOWED'; end if;
  if p_bio_type not in (1, 8, 9) then raise exception 'INVALID_BIO_TYPE'; end if;
  perform set_config('app.access_sync', 'on', true);
  update public.members set biometric_consent_at = coalesce(biometric_consent_at, now()) where id = m.id;
  select * into du from public.access_device_users where device_id = d.id and pin = m.access_pin;
  if du.state is distinct from 'present' then
    perform private.access_push_user(d.id, m.id);
  end if;
  return private.access_queue(d.id, d.org_id, m.access_pin, m.id, 'enroll',
    'ENROLL_BIO TYPE=' || p_bio_type || E'\tPIN=' || m.access_pin || E'\tRETRY=3\tOVERWRITE=1');
end $$;

-- Vincular a un socio alguien que ya estaba cargado a mano en el lector (conserva su cara)
create or replace function public.access_link_pin(p_device uuid, p_pin int, p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.access_devices;
begin
  d := private.access_device_for_admin(p_device);
  if not exists (select 1 from public.members where id = p_member and org_id = d.org_id) then
    raise exception 'MEMBER_NOT_FOUND';
  end if;
  if exists (select 1 from public.members where org_id = d.org_id and access_pin = p_pin and id <> p_member) then
    raise exception 'PIN_TAKEN';
  end if;
  perform set_config('app.access_sync', 'on', true);
  update public.access_device_users set member_id = p_member, managed = true, updated_at = now()
   where org_id = d.org_id and pin = p_pin;
  update public.members set access_pin = p_pin where id = p_member;     -- dispara la reconciliación
  perform private.access_reconcile(d.org_id, array[p_member]);
end $$;

-- Borrar del lector a alguien cargado a mano que no es socio
create or replace function public.access_forget_pin(p_device uuid, p_pin int) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.access_devices;
begin
  d := private.access_device_for_admin(p_device);
  perform private.access_delete_user(d.id, p_pin);
  delete from public.access_templates t where t.org_id = d.org_id and t.pin = p_pin
     and not exists (select 1 from public.members m where m.org_id = d.org_id and m.access_pin = p_pin);
end $$;

-- Lectores detectados que nadie registró, conectados desde la misma IP que el admin
create or replace function public.access_unknown_nearby(p_org uuid, p_ip text) returns table (serial_number text, last_seen_at timestamptz, info jsonb)
language sql stable security definer set search_path = '' as $$
  select u.serial_number, u.last_seen_at, u.info from public.access_unknown_devices u
   where private.has_permission(p_org, 'org.manage') and u.ip = p_ip and u.last_seen_at > now() - interval '1 day'
   order by u.last_seen_at desc limit 5
$$;

revoke execute on function public.access_device_register(uuid, text, text, uuid), public.access_device_update(uuid, text, boolean),
  public.access_device_confirm_ip(uuid), public.access_device_delete(uuid), public.access_device_resync(uuid),
  public.access_device_query_users(uuid), public.access_enroll(uuid, uuid, int), public.access_link_pin(uuid, int, uuid),
  public.access_forget_pin(uuid, int), public.access_unknown_nearby(uuid, text) from public, anon;
grant execute on function public.access_device_register(uuid, text, text, uuid), public.access_device_update(uuid, text, boolean),
  public.access_device_confirm_ip(uuid), public.access_device_delete(uuid), public.access_device_resync(uuid),
  public.access_device_query_users(uuid), public.access_enroll(uuid, uuid, int), public.access_link_pin(uuid, int, uuid),
  public.access_forget_pin(uuid, int), public.access_unknown_nearby(uuid, text) to authenticated;

-- 9 · Cada 5 minutos: vencimientos por fecha, reservas que abren/cierran, limpieza ---------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $c$select cron.schedule('access-reconcile', '*/5 * * * *', 'select public.access_reconcile_all()')$c$;
  end if;
end $$;

-- 10 · Baja del socio → se borran sus plantillas biométricas ---------------------------
create or replace function private.access_forget_member_bio() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.access_pin is not null then
      delete from public.access_templates where org_id = old.org_id and pin = old.access_pin;
    end if;
    return old;
  end if;
  if new.status = 'archived' and old.status is distinct from 'archived' and new.access_pin is not null then
    delete from public.access_templates where org_id = new.org_id and pin = new.access_pin;
    update public.access_device_users set has_bio = false where org_id = new.org_id and pin = new.access_pin;
  end if;
  return new;
end $$;
drop trigger if exists access_forget_member_bio on public.members;
create trigger access_forget_member_bio after update of status or delete on public.members
  for each row execute function private.access_forget_member_bio();
