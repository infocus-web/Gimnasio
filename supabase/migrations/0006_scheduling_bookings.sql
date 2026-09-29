-- =====================================================================
-- Evolution Platform v2 · 0006 · Recursos, agenda, reservas y check-in
--
-- Modelo "Mindbody": una clase cruza 4 variables y la BASE DE DATOS
-- garantiza que ninguna combinación inválida pueda existir, aunque haya
-- 50 reservas simultáneas o un bug en el frontend:
--
--   Horario     → class_sessions.during (tstzrange generado)
--   Sala        → EXCLUDE (room_id =, during &&)        : una sala, una clase a la vez
--   Staff       → EXCLUDE (instructor_id =, during &&)  : un profe, una clase a la vez
--   Equipamiento→ EXCLUDE (equipment_id =, during &&)   : la bici #12, un socio a la vez
--   Socio       → EXCLUDE (member_id =, during &&)      : un socio, una clase a la vez
--   Cupo        → fila de la sesión bloqueada (FOR UPDATE) dentro de book_class()
-- =====================================================================

create type public.session_status   as enum ('scheduled', 'canceled', 'completed');
create type public.booking_status   as enum ('booked', 'waitlisted', 'canceled', 'late_canceled', 'checked_in', 'no_show');
create type public.equipment_status as enum ('active', 'maintenance', 'retired');
create type public.checkin_method   as enum ('qr', 'manual', 'facial', 'fingerprint', 'nfc');

-- ---------------------------------------------------------------------
-- Recursos
-- ---------------------------------------------------------------------
create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  location_id uuid not null,
  name        text not null,
  capacity    int  not null check (capacity > 0),
  active      boolean not null default true,
  unique (id, org_id),
  unique (location_id, name),
  foreign key (location_id, org_id) references public.locations (id, org_id) on delete cascade
);

create table public.equipment (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  location_id uuid not null,
  room_id     uuid,                       -- null = equipo móvil
  kind        text not null,              -- 'bike', 'rower', 'reformer', ...
  label       text not null,              -- '#12'
  status      public.equipment_status not null default 'active',
  unique (id, org_id),
  unique (location_id, kind, label),
  foreign key (location_id, org_id) references public.locations (id, org_id) on delete cascade,
  foreign key (room_id, org_id)     references public.rooms (id, org_id) on delete set null (room_id)
);
create index equipment_room_kind_idx on public.equipment (room_id, kind) where status = 'active';

create table public.class_types (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations (id) on delete cascade,
  name                 text not null,
  description          text,
  color                text not null default '#edcc36',
  image_url            text,
  default_duration_min int  not null default 60 check (default_duration_min between 5 and 480),
  default_capacity     int  not null default 20 check (default_capacity > 0),
  equipment_kind       text,              -- si no es null, cada reserva ocupa 1 equipo de ese tipo (ej. spinning → 'bike')
  active               boolean not null default true,
  unique (id, org_id)
);

-- Qué clases habilita cada plan (sin filas = todas)
create table public.plan_class_types (
  plan_id       uuid not null,
  class_type_id uuid not null,
  org_id        uuid not null,
  primary key (plan_id, class_type_id),
  foreign key (plan_id, org_id)       references public.membership_plans (id, org_id) on delete cascade,
  foreign key (class_type_id, org_id) references public.class_types (id, org_id) on delete cascade
);

-- Plantilla semanal (el generador crea class_sessions N semanas hacia adelante)
create table public.class_series (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  class_type_id uuid not null,
  room_id       uuid not null,
  instructor_id uuid not null,
  weekday       smallint not null check (weekday between 1 and 7),   -- ISO: 1 = lunes
  start_time    time not null,
  duration_min  int  not null check (duration_min between 5 and 480),
  capacity      int  not null check (capacity > 0),
  valid_from    date not null default current_date,
  valid_until   date,
  unique (id, org_id),
  foreign key (class_type_id, org_id) references public.class_types (id, org_id) on delete cascade,
  foreign key (room_id, org_id)       references public.rooms (id, org_id),
  foreign key (instructor_id, org_id) references public.staff (id, org_id)
);

-- ---------------------------------------------------------------------
-- Sesiones (instancias concretas de clase)
-- ---------------------------------------------------------------------
create table public.class_sessions (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null,
  series_id          uuid,
  class_type_id      uuid not null,
  room_id            uuid not null,
  instructor_id      uuid not null,
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  during             tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  capacity           int not null check (capacity > 0),
  waitlist_capacity  int not null default 0 check (waitlist_capacity >= 0),
  booking_opens_at   timestamptz,                  -- null = según booking_window_days del plan
  booking_closes_min int not null default 0,       -- minutos antes del inicio en que se cierra la reserva
  status             public.session_status not null default 'scheduled',
  cancel_reason      text,
  created_at         timestamptz not null default now(),
  unique (id, org_id),
  check (ends_at > starts_at),
  foreign key (series_id, org_id)     references public.class_series (id, org_id) on delete set null (series_id),
  foreign key (class_type_id, org_id) references public.class_types (id, org_id),
  foreign key (room_id, org_id)       references public.rooms (id, org_id),
  foreign key (instructor_id, org_id) references public.staff (id, org_id),
  constraint class_sessions_no_room_overlap
    exclude using gist (room_id with =, during with &&) where (status <> 'canceled'),
  constraint class_sessions_no_instructor_overlap
    exclude using gist (instructor_id with =, during with &&) where (status <> 'canceled')
);
create index class_sessions_org_time_idx on public.class_sessions (org_id, starts_at) where status = 'scheduled';
create unique index class_sessions_series_uidx on public.class_sessions (series_id, starts_at) where series_id is not null;

-- El cupo nunca supera la sala ni la cantidad de equipos disponibles
create or replace function public.class_sessions_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_room_cap int;
  v_kind     text;
  v_units    int;
begin
  select capacity into v_room_cap from public.rooms where id = new.room_id;
  if new.capacity > v_room_cap then
    raise exception 'CAPACITY_EXCEEDS_ROOM' using hint = format('La sala admite %s personas', v_room_cap);
  end if;

  select equipment_kind into v_kind from public.class_types where id = new.class_type_id;
  if v_kind is not null then
    select count(*) into v_units from public.equipment
     where room_id = new.room_id and kind = v_kind and status = 'active';
    if new.capacity > v_units then
      raise exception 'CAPACITY_EXCEEDS_EQUIPMENT'
        using hint = format('Hay %s equipos "%s" activos en la sala', v_units, v_kind);
    end if;
  end if;

  if not exists (select 1 from public.staff where id = new.instructor_id and active) then
    raise exception 'INSTRUCTOR_INACTIVE';
  end if;
  return new;
end $$;
create trigger class_sessions_guard before insert or update of room_id, capacity, class_type_id, instructor_id
  on public.class_sessions for each row execute function public.class_sessions_guard();

-- ---------------------------------------------------------------------
-- Reservas
-- ---------------------------------------------------------------------
create table public.bookings (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null,
  session_id        uuid not null,
  member_id         uuid not null,
  membership_id     uuid,
  equipment_id      uuid,
  status            public.booking_status not null default 'booked',
  during            tstzrange not null,                  -- copia de la sesión (para los EXCLUDE)
  waitlist_position int,
  credit_consumed   boolean not null default false,
  source            text not null default 'member_app' check (source in ('member_app', 'front_desk', 'trainer', 'automation')),
  booked_by         uuid default auth.uid(),
  idempotency_key   text,
  created_at        timestamptz not null default now(),
  canceled_at       timestamptz,
  checked_in_at     timestamptz,
  unique (id, org_id),
  foreign key (session_id, org_id)    references public.class_sessions (id, org_id) on delete cascade,
  foreign key (member_id, org_id)     references public.members (id, org_id) on delete cascade,
  foreign key (membership_id, org_id) references public.memberships (id, org_id) on delete set null (membership_id),
  foreign key (equipment_id, org_id)  references public.equipment (id, org_id),
  check ((status = 'waitlisted') = (waitlist_position is not null)),
  check (status <> 'waitlisted' or equipment_id is null),
  -- Última línea de defensa contra overbooking de recursos:
  constraint bookings_no_equipment_overlap
    exclude using gist (equipment_id with =, during with &&)
    where (equipment_id is not null and status in ('booked', 'checked_in')),
  constraint bookings_no_member_overlap
    exclude using gist (member_id with =, during with &&)
    where (status in ('booked', 'checked_in'))
);
-- Un socio no puede estar dos veces (activo) en la misma sesión
create unique index bookings_one_active_per_member
  on public.bookings (session_id, member_id)
  where status in ('booked', 'waitlisted', 'checked_in');
create unique index bookings_idempotency_uidx
  on public.bookings (org_id, booked_by, idempotency_key) where idempotency_key is not null;
create index bookings_session_status_idx on public.bookings (session_id, status);
create index bookings_member_time_idx on public.bookings (member_id, during);
create index bookings_membership_idx on public.bookings (membership_id) where status in ('booked', 'checked_in');

-- ---------------------------------------------------------------------
-- Check-ins
-- ---------------------------------------------------------------------
create table public.checkins (
  id          bigint generated always as identity primary key,
  org_id      uuid not null,
  location_id uuid not null,
  member_id   uuid not null,
  booking_id  uuid,
  method      public.checkin_method not null,
  allowed     boolean not null,
  reason      text,
  scanned_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  foreign key (location_id, org_id) references public.locations (id, org_id),
  foreign key (member_id, org_id)   references public.members (id, org_id) on delete cascade,
  foreign key (booking_id, org_id)  references public.bookings (id, org_id) on delete set null (booking_id)
);
create index checkins_member_idx on public.checkins (member_id, created_at desc);
create index checkins_org_time_idx on public.checkins (org_id, created_at desc);

-- =====================================================================
-- Lógica de negocio
-- =====================================================================

-- Busca la membresía que habilita a un socio para una clase en un momento dado.
-- Devuelve la mejor candidata (prioriza ilimitadas sobre packs, para no gastar
-- créditos) o lanza el motivo concreto del rechazo.
create or replace function private.resolve_membership_for_class(
  p_member uuid, p_org uuid, p_class_type uuid, p_at timestamptz, p_tz text
) returns public.memberships
language plpgsql stable security definer set search_path = '' as $$
declare
  r           record;
  v_reason    text := 'MEMBERSHIP_REQUIRED';
  v_week_used int;
begin
  for r in
    select m.*, p.kind, p.max_bookings_per_week, p.booking_window_days, ba.delinquent,
           exists (select 1 from public.plan_class_types pct where pct.plan_id = p.id) as restricted,
           exists (select 1 from public.plan_class_types pct where pct.plan_id = p.id and pct.class_type_id = p_class_type) as allows_type
      from public.membership_members mm
      join public.memberships m       on m.id = mm.membership_id
      join public.membership_plans p  on p.id = m.plan_id
      join public.billing_accounts ba on ba.id = m.billing_account_id
     where mm.member_id = p_member and m.org_id = p_org
     order by (p.kind = 'class_pack'), m.current_period_end
  loop
    if r.status = 'past_due' or r.delinquent then
      v_reason := 'PAYMENT_PAST_DUE'; continue;
    end if;
    if r.status not in ('active', 'trialing') or (r.paused_until is not null and r.paused_until > p_at) then
      continue;
    end if;
    -- La clase tiene que caer dentro del período pago, salvo suscripciones que
    -- se renuevan solas (el cobro fallido las pasa a past_due y ahí se corta).
    if p_at >= r.current_period_end and not (r.kind = 'recurring' and not r.cancel_at_period_end) then
      v_reason := 'MEMBERSHIP_EXPIRES_BEFORE_CLASS'; continue;
    end if;
    if p_at < r.current_period_start then
      continue;
    end if;
    if p_at > now() + make_interval(days => r.booking_window_days) then
      v_reason := 'OUTSIDE_BOOKING_WINDOW'; continue;
    end if;
    if r.restricted and not r.allows_type then
      v_reason := 'PLAN_EXCLUDES_CLASS_TYPE'; continue;
    end if;
    if r.kind = 'class_pack' and coalesce(r.credits_remaining, 0) <= 0 then
      v_reason := 'NO_CREDITS_LEFT'; continue;
    end if;
    if r.max_bookings_per_week is not null then
      select count(*) into v_week_used
        from public.bookings b
       where b.membership_id = r.id and b.member_id = p_member
         and b.status in ('booked', 'checked_in')
         and date_trunc('week', lower(b.during) at time zone p_tz) = date_trunc('week', p_at at time zone p_tz);
      if v_week_used >= r.max_bookings_per_week then
        v_reason := 'WEEKLY_LIMIT_REACHED'; continue;
      end if;
    end if;

    return (select m from public.memberships m where m.id = r.id);
  end loop;

  raise exception '%', v_reason using errcode = 'P0001';
end $$;

-- ---------------------------------------------------------------------
-- book_class: ÚNICA puerta de entrada para crear reservas.
-- Transacción atómica. Orden de validación:
--   0. Autenticación + bloqueo de la sesión (serializa reservas concurrentes)
--   1. Autorización (el socio es el usuario, un familiar a cargo, o staff)
--   2. Que NO esté ya inscripto
--   3. Membresía activa válida para esa clase
--   4. Capacidad (cupo) → reserva o lista de espera
--   5. Equipamiento (auto-asigna o valida el elegido)
-- Errores: message = código estable (ej. CLASS_FULL), hint = texto humano.
-- ---------------------------------------------------------------------
create or replace function public.book_class(
  p_session_id      uuid,
  p_member_id       uuid default null,
  p_equipment_id    uuid default null,
  p_idempotency_key text default null,
  p_allow_waitlist  boolean default true
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid        uuid := auth.uid();
  v_session    public.class_sessions;
  v_org        public.organizations;
  v_type       public.class_types;
  v_member     public.members;
  v_membership public.memberships;
  v_is_staff   boolean;
  v_taken      int;
  v_waiting    int;
  v_status     public.booking_status;
  v_equipment  uuid;
  v_booking    public.bookings;
  v_existing   public.bookings;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Idempotencia: el mismo request reintentado devuelve la misma reserva
  if p_idempotency_key is not null then
    select * into v_existing from public.bookings
     where booked_by = v_uid and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('booking_id', v_existing.id, 'status', v_existing.status,
                                'equipment_id', v_existing.equipment_id,
                                'waitlist_position', v_existing.waitlist_position, 'replayed', true);
    end if;
  end if;

  -- 0. Bloqueo de la sesión: todas las reservas de ESTA clase se serializan
  --    acá, así el conteo de cupo de abajo no puede quedar desactualizado.
  select * into v_session from public.class_sessions where id = p_session_id for update;
  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if v_session.status <> 'scheduled' then
    raise exception 'SESSION_NOT_BOOKABLE' using hint = 'La clase fue cancelada o ya terminó';
  end if;

  select * into v_org  from public.organizations where id = v_session.org_id;
  select * into v_type from public.class_types   where id = v_session.class_type_id;

  if now() >= v_session.starts_at - make_interval(mins => v_session.booking_closes_min) then
    raise exception 'BOOKING_CLOSED' using hint = 'La reserva para esta clase ya cerró';
  end if;
  if v_session.booking_opens_at is not null and now() < v_session.booking_opens_at then
    raise exception 'BOOKING_NOT_OPEN_YET';
  end if;

  -- 1. Autorización
  v_is_staff := private.has_permission(v_session.org_id, 'bookings.manage');
  if p_member_id is null then
    select * into v_member from public.members
     where org_id = v_session.org_id and user_id = v_uid and status <> 'archived';
  else
    select * into v_member from public.members
     where id = p_member_id and org_id = v_session.org_id and status <> 'archived';
  end if;
  if v_member.id is null then
    raise exception 'MEMBER_NOT_FOUND';
  end if;
  if not v_is_staff and not (v_member.id in (select private.actable_member_ids())) then
    raise exception 'FORBIDDEN' using hint = 'No podés reservar en nombre de este socio';
  end if;
  if v_member.status = 'frozen' then
    raise exception 'MEMBER_FROZEN';
  end if;

  -- 2. ¿Ya inscripto?
  if exists (select 1 from public.bookings
              where session_id = v_session.id and member_id = v_member.id
                and status in ('booked', 'waitlisted', 'checked_in')) then
    raise exception 'ALREADY_BOOKED';
  end if;

  -- 3. Membresía activa (lanza el motivo exacto si no hay)
  v_membership := private.resolve_membership_for_class(
    v_member.id, v_session.org_id, v_session.class_type_id, v_session.starts_at, v_org.timezone);
  -- bloquea la membresía para descontar créditos sin carreras
  perform 1 from public.memberships where id = v_membership.id for update;
  select * into v_membership from public.memberships where id = v_membership.id;

  -- 4. Capacidad
  select count(*) filter (where status in ('booked', 'checked_in')),
         count(*) filter (where status = 'waitlisted')
    into v_taken, v_waiting
    from public.bookings where session_id = v_session.id;

  if v_taken < v_session.capacity then
    v_status := 'booked';
  elsif p_allow_waitlist and v_waiting < v_session.waitlist_capacity then
    v_status := 'waitlisted';
  else
    raise exception 'CLASS_FULL' using hint = 'No quedan lugares ni lista de espera';
  end if;

  -- 5. Equipamiento (solo si la clase lo requiere y hay lugar confirmado)
  if v_status = 'booked' and v_type.equipment_kind is not null then
    if p_equipment_id is not null then
      select e.id into v_equipment from public.equipment e
       where e.id = p_equipment_id and e.room_id = v_session.room_id
         and e.kind = v_type.equipment_kind and e.status = 'active';
      if v_equipment is null then
        raise exception 'EQUIPMENT_INVALID' using hint = 'Ese equipo no está disponible en esta sala';
      end if;
      if exists (select 1 from public.bookings b
                  where b.equipment_id = v_equipment and b.status in ('booked', 'checked_in')
                    and b.during && v_session.during) then
        raise exception 'EQUIPMENT_TAKEN' using hint = 'Ese equipo ya está reservado, elegí otro';
      end if;
    else
      select e.id into v_equipment from public.equipment e
       where e.room_id = v_session.room_id and e.kind = v_type.equipment_kind and e.status = 'active'
         and not exists (select 1 from public.bookings b
                          where b.equipment_id = e.id and b.status in ('booked', 'checked_in')
                            and b.during && v_session.during)
       order by length(e.label), e.label
       limit 1;
      if v_equipment is null then
        raise exception 'CLASS_FULL' using hint = 'No quedan equipos libres';
      end if;
    end if;
  elsif p_equipment_id is not null and v_type.equipment_kind is null then
    raise exception 'EQUIPMENT_NOT_APPLICABLE';
  end if;

  -- Insertar (los EXCLUDE/UNIQUE siguen protegiendo ante cualquier carrera residual)
  begin
    insert into public.bookings (org_id, session_id, member_id, membership_id, equipment_id, status,
                                 during, waitlist_position, credit_consumed, source, booked_by, idempotency_key)
    values (v_session.org_id, v_session.id, v_member.id, v_membership.id, v_equipment, v_status,
            v_session.during,
            case when v_status = 'waitlisted' then v_waiting + 1 end,
            (v_status = 'booked' and v_membership.credits_remaining is not null),
            case when v_is_staff and not (v_member.id in (select private.actable_member_ids())) then 'front_desk' else 'member_app' end,
            v_uid, p_idempotency_key)
    returning * into v_booking;
  exception
    when unique_violation then
      raise exception 'ALREADY_BOOKED';
    when exclusion_violation then
      if sqlerrm like '%equipment%' then
        raise exception 'EQUIPMENT_TAKEN';
      end if;
      raise exception 'MEMBER_TIME_CONFLICT' using hint = 'Ya tenés otra clase en ese horario';
  end;

  if v_booking.credit_consumed then
    update public.memberships set credits_remaining = credits_remaining - 1 where id = v_membership.id;
  end if;

  insert into public.domain_events (org_id, type, member_id, payload)
  values (v_session.org_id, 'booking.' || v_status::text, v_member.id,
          jsonb_build_object('booking_id', v_booking.id, 'session_id', v_session.id,
                             'starts_at', v_session.starts_at));

  return jsonb_build_object(
    'booking_id',        v_booking.id,
    'status',            v_booking.status,
    'equipment_id',      v_booking.equipment_id,
    'equipment_label',   (select label from public.equipment where id = v_booking.equipment_id),
    'waitlist_position', v_booking.waitlist_position,
    'membership_id',     v_membership.id,
    'credits_remaining', case when v_booking.credit_consumed then v_membership.credits_remaining - 1
                              else v_membership.credits_remaining end,
    'replayed',          false
  );
end $$;

-- ---------------------------------------------------------------------
-- Promoción de lista de espera (se llama al liberarse un lugar)
-- ---------------------------------------------------------------------
create or replace function private.promote_waitlist(p_session_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.class_sessions;
  v_type    public.class_types;
  v_taken   int;
  w         public.bookings;
  v_ms      public.memberships;
  v_equip   uuid;
begin
  select * into v_session from public.class_sessions where id = p_session_id for update;
  select * into v_type from public.class_types where id = v_session.class_type_id;
  select count(*) into v_taken from public.bookings
   where session_id = p_session_id and status in ('booked', 'checked_in');
  if v_taken >= v_session.capacity or v_session.starts_at <= now() then
    return null;
  end if;

  for w in select * from public.bookings
            where session_id = p_session_id and status = 'waitlisted'
            order by waitlist_position for update
  loop
    select * into v_ms from public.memberships where id = w.membership_id for update;
    if v_ms.id is null or v_ms.status not in ('active', 'trialing')
       or (v_ms.credits_remaining is not null and v_ms.credits_remaining <= 0) then
      update public.bookings set status = 'canceled', waitlist_position = null, canceled_at = now()
       where id = w.id;
      continue;
    end if;

    v_equip := null;
    if v_type.equipment_kind is not null then
      select e.id into v_equip from public.equipment e
       where e.room_id = v_session.room_id and e.kind = v_type.equipment_kind and e.status = 'active'
         and not exists (select 1 from public.bookings b where b.equipment_id = e.id
                          and b.status in ('booked', 'checked_in') and b.during && v_session.during)
       order by length(e.label), e.label limit 1;
      if v_equip is null then return null; end if;
    end if;

    begin
      update public.bookings
         set status = 'booked', waitlist_position = null, equipment_id = v_equip,
             credit_consumed = (v_ms.credits_remaining is not null)
       where id = w.id;
    exception when exclusion_violation then
      -- el socio ya tiene otra clase en ese horario: se lo saltea
      update public.bookings set status = 'canceled', waitlist_position = null, canceled_at = now()
       where id = w.id;
      continue;
    end;
    if v_ms.credits_remaining is not null then
      update public.memberships set credits_remaining = credits_remaining - 1 where id = v_ms.id;
    end if;
    insert into public.domain_events (org_id, type, member_id, payload)
    values (w.org_id, 'booking.promoted', w.member_id,
            jsonb_build_object('booking_id', w.id, 'session_id', p_session_id));
    return w.id;
  end loop;
  return null;
end $$;

-- ---------------------------------------------------------------------
-- cancel_booking: cancelación tardía no devuelve crédito
-- ---------------------------------------------------------------------
create or replace function public.cancel_booking(p_booking_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_b       public.bookings;
  v_session public.class_sessions;
  v_late    boolean;
  v_new     public.booking_status;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_b from public.bookings where id = p_booking_id;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  -- mismo orden de locks que book_class (sesión → reserva) para evitar deadlocks
  select * into v_session from public.class_sessions where id = v_b.session_id for update;
  select * into v_b from public.bookings where id = p_booking_id for update;

  if not (v_b.member_id in (select private.actable_member_ids())
          or private.has_permission(v_b.org_id, 'bookings.manage')) then
    raise exception 'FORBIDDEN';
  end if;
  if v_b.status not in ('booked', 'waitlisted') then
    raise exception 'BOOKING_NOT_CANCELABLE';
  end if;

  v_late := v_b.status = 'booked'
            and now() > v_session.starts_at - make_interval(mins =>
                  (select late_cancel_minutes from public.organizations where id = v_b.org_id));
  v_new := case when v_late then 'late_canceled' else 'canceled' end;

  update public.bookings
     set status = v_new, canceled_at = now(), waitlist_position = null, equipment_id = null
   where id = v_b.id;

  if v_b.credit_consumed and not v_late then
    update public.memberships set credits_remaining = credits_remaining + 1 where id = v_b.membership_id;
    update public.bookings set credit_consumed = false where id = v_b.id;
  end if;

  if v_b.status = 'waitlisted' then
    update public.bookings set waitlist_position = waitlist_position - 1
     where session_id = v_b.session_id and status = 'waitlisted' and waitlist_position > v_b.waitlist_position;
  end if;

  insert into public.domain_events (org_id, type, member_id, payload)
  values (v_b.org_id, 'booking.' || v_new::text, v_b.member_id,
          jsonb_build_object('booking_id', v_b.id, 'session_id', v_b.session_id));

  return jsonb_build_object('booking_id', v_b.id, 'status', v_new,
                            'promoted_booking_id', case when v_b.status = 'booked'
                                                        then private.promote_waitlist(v_b.session_id) end);
end $$;

-- ---------------------------------------------------------------------
-- QR dinámico (TOTP-like): el token cambia cada `qr_step_seconds`.
-- Formato: v1.<member_id>.<step>.<hmac_sha256(member_id:step, secret)[0:32]>
-- Una captura de pantalla vieja no sirve para entrar.
-- ---------------------------------------------------------------------
create or replace function private.qr_signature(p_member uuid, p_step bigint) returns text
language sql stable security definer set search_path = '' as $$
  select left(encode(extensions.hmac(convert_to(p_member::text || ':' || p_step::text, 'UTF8'),
                                     s.qr_secret, 'sha256'), 'hex'), 32)
    from public.member_secrets s where s.member_id = p_member
$$;
revoke execute on function private.qr_signature(uuid, bigint) from public, authenticated;

create or replace function public.get_checkin_token(p_member_id uuid default null, p_org_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_member public.members;
  v_step_s int;
  v_step   bigint;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_member_id is null then
    select * into v_member from public.members
     where user_id = auth.uid() and (p_org_id is null or org_id = p_org_id)
     order by created_at limit 1;
  else
    select * into v_member from public.members where id = p_member_id;
  end if;
  if v_member.id is null or not (v_member.id in (select private.actable_member_ids())) then
    raise exception 'FORBIDDEN';
  end if;

  select qr_step_seconds into v_step_s from public.organizations where id = v_member.org_id;
  v_step := floor(extract(epoch from now()) / v_step_s)::bigint;
  return jsonb_build_object(
    'token', 'v1.' || v_member.id || '.' || v_step || '.' || private.qr_signature(v_member.id, v_step),
    'expires_at', to_timestamp((v_step + 1) * v_step_s),
    'refresh_in_seconds', v_step_s
  );
end $$;

create or replace function public.checkin_scan(
  p_location_id uuid,
  p_token       text default null,
  p_member_id   uuid default null,          -- ingreso manual (sin QR)
  p_method      public.checkin_method default 'qr'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_loc     public.locations;
  v_org     public.organizations;
  v_parts   text[];
  v_member  public.members;
  v_step    bigint;
  v_now_step bigint;
  v_allowed boolean := false;
  v_reason  text;
  v_booking public.bookings;
  v_last    public.checkins;
begin
  select * into v_loc from public.locations where id = p_location_id;
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;
  if not private.has_permission(v_loc.org_id, 'checkins.manage') then
    raise exception 'FORBIDDEN';
  end if;
  select * into v_org from public.organizations where id = v_loc.org_id;

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
    end if;
  else
    v_reason := 'NO_ACTIVE_MEMBERSHIP';
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
    'member', jsonb_build_object('id', v_member.id, 'first_name', v_member.first_name,
                                 'last_name', v_member.last_name, 'photo_url', v_member.photo_url,
                                 'medical_notes', v_member.medical_notes)
  );
end $$;

-- Vista de agenda con lugares libres.
-- security_invoker = false A PROPÓSITO: un socio no puede leer las reservas
-- ajenas (RLS), pero sí necesita saber cuántos lugares quedan. La vista solo
-- expone agregados y filtra explícitamente por las organizaciones del usuario.
create view public.class_sessions_availability with (security_invoker = false) as
select s.id, s.org_id, s.class_type_id, ct.name as class_name, ct.color, s.room_id, r.name as room_name,
       s.instructor_id, st.display_name as instructor_name, s.starts_at, s.ends_at, s.status,
       s.capacity,
       s.capacity - coalesce(b.taken, 0)       as spots_left,
       s.waitlist_capacity - coalesce(b.waiting, 0) as waitlist_left
  from public.class_sessions s
  join public.class_types ct on ct.id = s.class_type_id
  join public.rooms r        on r.id = s.room_id
  join public.staff st       on st.id = s.instructor_id
  left join lateral (
    select count(*) filter (where status in ('booked', 'checked_in')) as taken,
           count(*) filter (where status = 'waitlisted')              as waiting
      from public.bookings where session_id = s.id
  ) b on true
 where s.org_id in (select private.my_org_ids());
