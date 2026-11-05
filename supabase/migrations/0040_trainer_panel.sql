-- =====================================================================
-- Evolution Platform v2 · 0040 · Panel del profe
--   · Permiso nuevo 'schedule.own': el profe maneja SUS clases
--       - grilla propia: agregar horario, cambiar día / hora / duración / sala / cupo, dar de baja
--       - una clase puntual: moverla de día/hora, cupo, sala, cancelarla
--       - anotar y sacar socios de SUS clases
--     (el dueño se lo puede sacar a un profe en Equipo → override)
--   · Cambio de horario o cancelación: se avisa por email a los anotados (message_outbox)
--   · Clases movidas a mano (series_slot) no se vuelven a crear en el horario original
--   · trainer_members: control de socios de las clases del profe (plan, asistencia, faltas)
--   · class_member_search: buscador de socios para anotar en una clase (sin members.read)
--   · message_templates: mensajes predefinidos de WhatsApp (del gimnasio y de cada profe)
--   · message_outbox: el profe también puede escribirle a quien se anotó en sus clases
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Permiso y helpers
-- ---------------------------------------------------------------------
insert into public.permissions (code, description) values
  ('schedule.own', 'Profesor: maneja sus propias clases (días, horarios, cupos, cancelar) y anota socios en ellas')
on conflict (code) do nothing;
insert into public.role_permissions (role, permission) values ('trainer', 'schedule.own')
on conflict do nothing;

-- ¿El usuario logueado puede editar una clase de este profesor?
create or replace function private.can_edit_class(p_org uuid, p_instructor uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_permission(p_org, 'schedule.manage')
      or (private.has_permission(p_org, 'schedule.own')
          and exists (select 1 from public.staff s
                       where s.id = p_instructor and s.org_id = p_org and s.user_id = auth.uid() and s.active))
$$;

create or replace function private.my_staff_id(p_org uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.staff where org_id = p_org and user_id = auth.uid() and active
$$;

-- "martes 12/11 a las 19:00"
create or replace function private.class_when(p_ts timestamptz, p_tz text) returns text
language sql stable set search_path = '' as $$
  select (array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'])
           [extract(isodow from p_ts at time zone p_tz)::int]
         || ' ' || to_char(p_ts at time zone p_tz, 'DD/MM') || ' a las ' || to_char(p_ts at time zone p_tz, 'HH24:MI')
$$;

revoke execute on function private.can_edit_class(uuid, uuid), private.my_staff_id(uuid), private.class_when(timestamptz, text)
  from public, anon;
grant execute on function private.can_edit_class(uuid, uuid), private.my_staff_id(uuid), private.class_when(timestamptz, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Clases movidas a mano: recuerdan el lugar de la grilla que ocupaban
-- ---------------------------------------------------------------------
alter table public.class_sessions add column if not exists series_slot timestamptz;
comment on column public.class_sessions.series_slot is
  'Si la clase de un horario fijo se movió a mano: la fecha/hora original de la grilla (así el generador no la vuelve a crear).';
create index if not exists class_sessions_series_slot_idx on public.class_sessions (series_id, series_slot)
  where series_slot is not null;

-- Avisos por email a los anotados (cambio de horario / clase suspendida). Devuelve cuántos se encolaron.
create or replace function private.notify_session_change(p_session uuid, p_kind text, p_old_start timestamptz, p_reason text default null)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_s    public.class_sessions;
  v_tz   text;
  v_name text;
  v_n    int;
begin
  select * into v_s from public.class_sessions where id = p_session;
  select timezone into v_tz from public.organizations where id = v_s.org_id;
  select name into v_name from public.class_types where id = v_s.class_type_id;

  insert into public.domain_events (org_id, type, member_id, payload)
  select b.org_id, case when p_kind = 'moved' then 'session.rescheduled' else 'session.canceled' end, b.member_id,
         jsonb_build_object('session_id', p_session, 'booking_id', b.id, 'old_starts_at', p_old_start,
                            'starts_at', v_s.starts_at, 'reason', p_reason)
    from public.bookings b
   where b.session_id = p_session and b.status in ('booked', 'waitlisted')
     and p_kind = 'moved';   -- la cancelación ya emite su evento en cancel_session

  insert into public.message_outbox (org_id, member_id, channel, email, subject, body, template_key, status, dedupe_key)
  select b.org_id, b.member_id, 'email', btrim(m.email),
         left(case when p_kind = 'moved' then 'Cambio de horario: ' || v_name else 'Se suspendió la clase de ' || v_name end, 200),
         left(case when p_kind = 'moved' then
                format(E'¡Hola %s!\n\nLa clase de %s del %s cambió de horario: ahora es el %s.\n\n'
                       || E'Tu lugar sigue reservado. Si no podés ir, cancelá la reserva desde la app para liberar el lugar.',
                       m.first_name, v_name, private.class_when(p_old_start, v_tz), private.class_when(v_s.starts_at, v_tz))
              else
                format(E'¡Hola %s!\n\nTe avisamos que la clase de %s del %s se suspendió%s.\n\n'
                       || E'Tu reserva quedó cancelada y, si tenés un pack, se te devolvió la clase. Podés anotarte en otra desde la app.',
                       m.first_name, v_name, private.class_when(v_s.starts_at, v_tz),
                       coalesce(': ' || nullif(btrim(p_reason), ''), ''))
              end, 2000),
         'session_' || p_kind, 'queued',
         'session_' || p_kind || ':' || p_session || ':' || extract(epoch from v_s.starts_at)::bigint
    from public.bookings b
    join public.members m on m.id = b.member_id
   where b.session_id = p_session
     and ((p_kind = 'moved' and b.status in ('booked', 'waitlisted'))
          -- cancelación: solo las reservas que se cancelaron en ESTA transacción (no las que el socio ya había cancelado)
          or (p_kind = 'canceled' and b.status = 'canceled' and b.canceled_at = now()))
     and m.email like '%_@_%' and length(btrim(m.email)) <= 320
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function private.notify_session_change(uuid, text, timestamptz, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Funciones de agenda existentes: ahora también el profe en lo suyo
-- ---------------------------------------------------------------------
create or replace function public.generate_sessions(p_org uuid default null, p_weeks int default 4)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s          record;
  d          date;
  v_from     date;
  v_to       date;
  v_created  int := 0;
  v_skipped  int := 0;
  v_start    timestamptz;
begin
  if auth.uid() is not null then
    if p_org is null or not (private.has_permission(p_org, 'schedule.manage') or private.has_permission(p_org, 'schedule.own')) then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
  end if;
  p_weeks := least(greatest(coalesce(p_weeks, 4), 1), 12);

  for s in
    select cs.*, o.timezone
      from public.class_series cs
      join public.organizations o on o.id = cs.org_id
      join public.class_types ct on ct.id = cs.class_type_id and ct.active
     where (p_org is null or cs.org_id = p_org)
  loop
    v_from := greatest(s.valid_from, (now() at time zone s.timezone)::date);
    v_to := least(coalesce(s.valid_until, 'infinity'::date), (now() at time zone s.timezone)::date + p_weeks * 7);
    d := v_from + ((s.weekday - extract(isodow from v_from)::int + 7) % 7);
    while d <= v_to loop
      v_start := (d + s.start_time) at time zone s.timezone;
      if v_start > now()
         -- 0040: esa fecha se movió a mano a otro horario → no recrearla
         and not exists (select 1 from public.class_sessions x where x.series_id = s.id and x.series_slot = v_start) then
        begin
          insert into public.class_sessions (org_id, series_id, class_type_id, room_id, instructor_id,
                                             starts_at, ends_at, capacity, waitlist_capacity)
          values (s.org_id, s.id, s.class_type_id, s.room_id, s.instructor_id,
                  v_start, v_start + make_interval(mins => s.duration_min), s.capacity, 5)
          on conflict (series_id, starts_at) where series_id is not null do nothing;
          if found then v_created := v_created + 1; end if;
        exception when others then
          v_skipped := v_skipped + 1;   -- choque de sala/profe o cupo inválido: se saltea esa fecha
        end;
      end if;
      d := d + 7;
    end loop;
  end loop;

  return jsonb_build_object('created', v_created, 'skipped', v_skipped);
end $$;
revoke execute on function public.generate_sessions(uuid, int) from public, anon;
grant execute on function public.generate_sessions(uuid, int) to authenticated;

create or replace function public.cancel_session(p_session uuid, p_reason text default null) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.class_sessions;
  v_n int;
begin
  select * into v_s from public.class_sessions where id = p_session for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if not private.can_edit_class(v_s.org_id, v_s.instructor_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_s.status <> 'scheduled' then raise exception 'SESSION_NOT_BOOKABLE'; end if;

  update public.class_sessions set status = 'canceled', cancel_reason = nullif(btrim(p_reason), '') where id = p_session;

  update public.memberships ms
     set credits_remaining = credits_remaining + x.n
    from (select membership_id, count(*) as n from public.bookings
           where session_id = p_session and status = 'booked' and credit_consumed group by membership_id) x
   where ms.id = x.membership_id;

  insert into public.domain_events (org_id, type, member_id, payload)
  select b.org_id, 'session.canceled', b.member_id,
         jsonb_build_object('session_id', p_session, 'booking_id', b.id, 'reason', p_reason)
    from public.bookings b where b.session_id = p_session and b.status in ('booked', 'waitlisted');

  update public.bookings
     set status = 'canceled', canceled_at = now(), waitlist_position = null, equipment_id = null, credit_consumed = false
   where session_id = p_session and status in ('booked', 'waitlisted');
  get diagnostics v_n = row_count;

  -- 0040: aviso por email a los que estaban anotados (solo si la clase todavía no empezó)
  if v_n > 0 and v_s.starts_at > now() then
    perform private.notify_session_change(p_session, 'canceled', v_s.starts_at, p_reason);
  end if;
  return v_n;
end $$;
revoke execute on function public.cancel_session(uuid, text) from public, anon;
grant execute on function public.cancel_session(uuid, text) to authenticated;

create or replace function public.end_series(p_series uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_s    public.class_series;
  v_del  int;
  v_kept int;
begin
  select * into v_s from public.class_series where id = p_series for update;
  if not found then raise exception 'SERIES_NOT_FOUND'; end if;
  if not private.can_edit_class(v_s.org_id, v_s.instructor_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.class_series set valid_until = current_date - 1 where id = p_series;

  delete from public.class_sessions cs
   where cs.series_id = p_series and cs.starts_at > now() and cs.status = 'scheduled'
     and not exists (select 1 from public.bookings b where b.session_id = cs.id and b.status in ('booked', 'waitlisted', 'checked_in'));
  get diagnostics v_del = row_count;
  select count(*) into v_kept from public.class_sessions
   where series_id = p_series and starts_at > now() and status = 'scheduled';
  return jsonb_build_object('deleted', v_del, 'kept_with_bookings', v_kept);
end $$;
revoke execute on function public.end_series(uuid) from public, anon;
grant execute on function public.end_series(uuid) to authenticated;

create or replace function public.apply_series_to_future(p_series uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.class_series;
  v_n int := 0;
  r   record;
begin
  select * into v_s from public.class_series where id = p_series;
  if not found then raise exception 'SERIES_NOT_FOUND'; end if;
  if not private.can_edit_class(v_s.org_id, v_s.instructor_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  for r in select id from public.class_sessions
            where series_id = p_series and starts_at > now() and status = 'scheduled'
  loop
    begin
      update public.class_sessions
         set instructor_id = v_s.instructor_id, room_id = v_s.room_id,
             capacity = greatest(v_s.capacity, (select count(*) from public.bookings b
                                                where b.session_id = r.id and b.status = 'booked')::int)
       where id = r.id;
      v_n := v_n + 1;
    exception when others then
      null;   -- choque puntual (ej. el profe ya da otra clase ese día): esa fecha queda como estaba
    end;
  end loop;
  return v_n;
end $$;
revoke execute on function public.apply_series_to_future(uuid) from public, anon;
grant execute on function public.apply_series_to_future(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. book_class / cancel_booking: el profe anota y saca socios de SUS clases
--    (mismo cuerpo que 0006; solo cambian la autorización y el origen 'trainer')
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
  -- 0040: el profe (con schedule.own) puede anotar socios en SUS clases
  v_is_staff := private.has_permission(v_session.org_id, 'bookings.manage')
                or private.can_edit_class(v_session.org_id, v_session.instructor_id);
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
            case when v_is_staff and not (v_member.id in (select private.actable_member_ids()))
                 then case when private.has_permission(v_session.org_id, 'bookings.manage') then 'front_desk' else 'trainer' end
                 else 'member_app' end,
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
          or private.has_permission(v_b.org_id, 'bookings.manage')
          or private.can_edit_class(v_b.org_id, v_session.instructor_id)) then   -- 0040: el profe en su clase
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
revoke execute on function public.book_class(uuid, uuid, uuid, text, boolean), public.cancel_booking(uuid) from public, anon;
grant execute on function public.book_class(uuid, uuid, uuid, text, boolean), public.cancel_booking(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Editar UNA clase (día/hora, duración, cupo, sala)
-- ---------------------------------------------------------------------
create or replace function public.update_session(
  p_session      uuid,
  p_starts_at    timestamptz default null,
  p_duration_min int default null,
  p_capacity     int default null,
  p_room         uuid default null,
  p_notify       boolean default true
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_s         public.class_sessions;
  v_start     timestamptz;
  v_end       timestamptz;
  v_dur       int;
  v_room      uuid;
  v_cap       int;
  v_taken     int;
  v_moved     boolean;
  v_promoted  int := 0;
  v_notified  int := 0;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_s from public.class_sessions where id = p_session for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if not private.can_edit_class(v_s.org_id, v_s.instructor_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_s.status <> 'scheduled' or v_s.ends_at <= now() then
    raise exception 'SESSION_NOT_EDITABLE' using hint = 'La clase ya terminó o fue cancelada';
  end if;

  v_dur := coalesce(p_duration_min, (extract(epoch from v_s.ends_at - v_s.starts_at) / 60)::int);
  if v_dur not between 5 and 480 then
    raise exception 'INVALID_DURATION' using hint = 'La duración tiene que estar entre 5 y 480 minutos';
  end if;
  v_start := coalesce(p_starts_at, v_s.starts_at);
  v_end := v_start + make_interval(mins => v_dur);
  v_moved := v_start <> v_s.starts_at or v_end <> v_s.ends_at;
  if v_start <> v_s.starts_at and (v_s.starts_at <= now() or v_start <= now()) then
    raise exception 'INVALID_START' using hint = 'No se puede mover una clase que ya empezó ni pasarla a un horario que ya pasó';
  end if;

  v_room := coalesce(p_room, v_s.room_id);
  if not exists (select 1 from public.rooms where id = v_room and org_id = v_s.org_id and active) then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select count(*) into v_taken from public.bookings
   where session_id = p_session and status in ('booked', 'checked_in', 'no_show');
  v_cap := coalesce(p_capacity, v_s.capacity);
  if v_cap < 1 then raise exception 'INVALID_CAPACITY'; end if;
  if v_cap < v_taken then
    raise exception 'CAPACITY_BELOW_BOOKED' using hint = format('Ya hay %s anotados: el cupo no puede ser menor', v_taken);
  end if;

  begin
    update public.class_sessions
       set starts_at = v_start, ends_at = v_end, capacity = v_cap, room_id = v_room,
           series_slot = case when v_moved and series_id is not null then coalesce(series_slot, v_s.starts_at) else series_slot end
     where id = p_session;
    if v_moved then
      update public.bookings set during = tstzrange(v_start, v_end, '[)') where session_id = p_session;
    end if;
  exception
    when exclusion_violation then
      if sqlerrm like '%room%' then
        raise exception 'ROOM_BUSY' using hint = 'La sala ya está ocupada en ese horario';
      elsif sqlerrm like '%instructor%' then
        raise exception 'INSTRUCTOR_BUSY' using hint = 'El profe ya tiene otra clase en ese horario';
      elsif sqlerrm like '%equipment%' then
        raise exception 'EQUIPMENT_TAKEN' using hint = 'Un equipo reservado ya está ocupado en ese horario';
      else
        raise exception 'MEMBER_TIME_CONFLICT' using hint = 'Alguien anotado ya tiene otra clase en ese horario';
      end if;
    when unique_violation then
      raise exception 'SLOT_TAKEN' using hint = 'Ya hay otra clase de este mismo horario fijo en esa fecha y hora';
  end;

  -- Más cupo → entra la lista de espera
  if v_cap > v_s.capacity then
    while private.promote_waitlist(p_session) is not null loop
      v_promoted := v_promoted + 1;
    end loop;
  end if;

  if v_moved and p_notify then
    v_notified := private.notify_session_change(p_session, 'moved', v_s.starts_at);
  end if;

  return jsonb_build_object('moved', v_moved, 'notified', v_notified, 'promoted', v_promoted);
end $$;
revoke execute on function public.update_session(uuid, timestamptz, int, int, uuid, boolean) from public, anon;
grant execute on function public.update_session(uuid, timestamptz, int, int, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Grilla: crear y editar un horario fijo (día, hora, duración, sala, cupo)
-- ---------------------------------------------------------------------
-- ¿Choca con otro horario fijo vigente (misma sala o mismo profe, mismo día)?
create or replace function private.series_conflict(
  p_org uuid, p_weekday int, p_start time, p_duration int, p_room uuid, p_instructor uuid, p_exclude uuid
) returns text
language sql stable security definer set search_path = '' as $$
  select case when bool_or(cs.room_id = p_room) then 'room' else 'instructor' end
    from public.class_series cs
   where cs.org_id = p_org and cs.weekday = p_weekday
     and (p_exclude is null or cs.id <> p_exclude)
     and (cs.valid_until is null or cs.valid_until >= current_date)
     and (cs.room_id = p_room or cs.instructor_id = p_instructor)
     and cs.start_time < p_start + make_interval(mins => p_duration)
     and p_start < cs.start_time + make_interval(mins => cs.duration_min)
  having count(*) > 0
$$;
revoke execute on function private.series_conflict(uuid, int, time, int, uuid, uuid, uuid) from public, anon, authenticated;

create or replace function private.series_validate(
  p_org uuid, p_weekday int, p_start time, p_duration int, p_capacity int, p_room uuid, p_instructor uuid, p_exclude uuid
) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cap int;
  v_conf text;
begin
  if p_weekday is null or p_weekday not between 1 and 7 then raise exception 'INVALID_WEEKDAY'; end if;
  if p_start is null then raise exception 'INVALID_START' using hint = 'Indicá la hora'; end if;
  if p_duration is null or p_duration not between 5 and 480 then
    raise exception 'INVALID_DURATION' using hint = 'La duración tiene que estar entre 5 y 480 minutos';
  end if;
  if p_capacity is null or p_capacity < 1 then raise exception 'INVALID_CAPACITY'; end if;
  select capacity into v_cap from public.rooms where id = p_room and org_id = p_org and active;
  if v_cap is null then raise exception 'ROOM_NOT_FOUND'; end if;
  if p_capacity > v_cap then
    raise exception 'CAPACITY_EXCEEDS_ROOM' using hint = format('La sala admite %s personas', v_cap);
  end if;
  if not exists (select 1 from public.staff where id = p_instructor and org_id = p_org and active) then
    raise exception 'INSTRUCTOR_INACTIVE';
  end if;
  v_conf := private.series_conflict(p_org, p_weekday, p_start, p_duration, p_room, p_instructor, p_exclude);
  if v_conf = 'room' then
    raise exception 'ROOM_BUSY' using hint = 'La sala ya tiene otra clase fija ese día en ese horario';
  elsif v_conf = 'instructor' then
    raise exception 'INSTRUCTOR_BUSY' using hint = 'El profe ya tiene otra clase fija ese día en ese horario';
  end if;
end $$;
revoke execute on function private.series_validate(uuid, int, time, int, int, uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.create_series(
  p_org          uuid,
  p_class_type   uuid,
  p_room         uuid,
  p_weekday      int,
  p_start_time   time,
  p_duration_min int,
  p_capacity     int,
  p_valid_from   date default null,
  p_instructor   uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_instr uuid;
  v_id    uuid;
  v_gen   jsonb;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_instr := coalesce(p_instructor, private.my_staff_id(p_org));
  if v_instr is null or not private.can_edit_class(p_org, v_instr) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (select 1 from public.class_types where id = p_class_type and org_id = p_org and active) then
    raise exception 'CLASS_TYPE_NOT_FOUND';
  end if;
  perform private.series_validate(p_org, p_weekday, p_start_time, p_duration_min, p_capacity, p_room, v_instr, null);

  insert into public.class_series (org_id, class_type_id, room_id, instructor_id, weekday, start_time, duration_min, capacity, valid_from)
  values (p_org, p_class_type, p_room, v_instr, p_weekday, p_start_time, p_duration_min, p_capacity,
          greatest(coalesce(p_valid_from, current_date), current_date))
  returning id into v_id;

  v_gen := public.generate_sessions(p_org, 4);
  -- lo creado de ESTE horario (generate_sessions cuenta todo el gimnasio)
  return jsonb_build_object('series_id', v_id,
                            'created', (select count(*) from public.class_sessions where series_id = v_id),
                            'skipped_all', (v_gen ->> 'skipped')::int);
end $$;
revoke execute on function public.create_series(uuid, uuid, uuid, int, time, int, int, date, uuid) from public, anon;
grant execute on function public.create_series(uuid, uuid, uuid, int, time, int, int, date, uuid) to authenticated;

-- Cambiar día / hora / duración / sala / cupo (y profe, solo administración) de un horario fijo.
-- Clases futuras: las vacías se rearman en el horario nuevo; las que tienen anotados se mueven
-- a la misma semana (si p_move_booked) y se avisa por email, o quedan como estaban.
create or replace function public.update_series(
  p_series       uuid,
  p_weekday      int,
  p_start_time   time,
  p_duration_min int,
  p_capacity     int,
  p_room         uuid,
  p_instructor   uuid default null,
  p_move_booked  boolean default true
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_s        public.class_series;
  v_tz       text;
  v_instr    uuid;
  v_time     boolean;
  r          record;
  v_start    timestamptz;
  v_taken    int;
  v_updated  int := 0;
  v_moved    int := 0;
  v_deleted  int := 0;
  v_kept     int := 0;
  v_notified int := 0;
  v_gen      jsonb;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_s from public.class_series where id = p_series for update;
  if not found then raise exception 'SERIES_NOT_FOUND'; end if;
  if not private.can_edit_class(v_s.org_id, v_s.instructor_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_s.valid_until is not null and v_s.valid_until < current_date then
    raise exception 'SERIES_NOT_FOUND' using hint = 'Ese horario ya fue dado de baja';
  end if;
  v_instr := coalesce(p_instructor, v_s.instructor_id);
  if v_instr <> v_s.instructor_id and not private.has_permission(v_s.org_id, 'schedule.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501', hint = 'Solo administración cambia el profesor de un horario';
  end if;
  perform private.series_validate(v_s.org_id, p_weekday, p_start_time, p_duration_min, p_capacity, p_room, v_instr, p_series);

  v_time := p_weekday <> v_s.weekday or p_start_time <> v_s.start_time or p_duration_min <> v_s.duration_min;
  update public.class_series
     set weekday = p_weekday, start_time = p_start_time, duration_min = p_duration_min,
         capacity = p_capacity, room_id = p_room, instructor_id = v_instr
   where id = p_series;
  select timezone into v_tz from public.organizations where id = v_s.org_id;

  for r in
    select cs.id, cs.starts_at, cs.series_slot,
           exists (select 1 from public.bookings b where b.session_id = cs.id
                    and b.status in ('booked', 'waitlisted', 'checked_in')) as busy
      from public.class_sessions cs
     where cs.series_id = p_series and cs.status = 'scheduled' and cs.starts_at > now()
     order by cs.starts_at
  loop
    select count(*) into v_taken from public.bookings
     where session_id = r.id and status in ('booked', 'checked_in', 'no_show');

    if not v_time or r.series_slot is not null then
      -- mismo horario (o clase movida a mano): solo profe, sala y cupo
      begin
        update public.class_sessions
           set instructor_id = v_instr, room_id = p_room, capacity = greatest(p_capacity, v_taken)
         where id = r.id;
        v_updated := v_updated + 1;
      exception when others then
        v_kept := v_kept + 1;
      end;
      continue;
    end if;

    if not r.busy then
      delete from public.class_sessions where id = r.id;   -- el generador la arma en el horario nuevo
      v_deleted := v_deleted + 1;
      continue;
    end if;

    -- mismo semana (lunes a domingo), nuevo día y hora
    v_start := ((date_trunc('week', r.starts_at at time zone v_tz))::date + (p_weekday - 1) + p_start_time) at time zone v_tz;
    if p_move_booked and v_start > now() then
      begin
        update public.class_sessions
           set starts_at = v_start, ends_at = v_start + make_interval(mins => p_duration_min),
               instructor_id = v_instr, room_id = p_room, capacity = greatest(p_capacity, v_taken)
         where id = r.id;
        update public.bookings set during = tstzrange(v_start, v_start + make_interval(mins => p_duration_min), '[)')
         where session_id = r.id;
        v_moved := v_moved + 1;
        if v_start <> r.starts_at then
          v_notified := v_notified + private.notify_session_change(r.id, 'moved', r.starts_at);
        end if;
      exception when others then
        v_kept := v_kept + 1;   -- choque (sala, profe o un anotado con otra clase): queda como estaba
      end;
    else
      v_kept := v_kept + 1;
    end if;
  end loop;

  select count(*) into v_taken from public.class_sessions where series_id = p_series;
  v_gen := public.generate_sessions(v_s.org_id, 4);
  return jsonb_build_object('updated', v_updated, 'moved', v_moved, 'deleted', v_deleted,
                            'kept_with_bookings', v_kept, 'notified', v_notified,
                            'created', (select count(*) from public.class_sessions where series_id = p_series) - v_taken);
end $$;
revoke execute on function public.update_series(uuid, int, time, int, int, uuid, uuid, boolean) from public, anon;
grant execute on function public.update_series(uuid, int, time, int, int, uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Buscador de socios para anotar en una clase (el profe no tiene members.read)
-- ---------------------------------------------------------------------
create or replace function public.class_member_search(p_session uuid, p_q text)
returns table (id uuid, name text, plan_name text, member_number int, plan_ok boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_s      public.class_sessions;
  v_term   text := btrim(regexp_replace(coalesce(p_q, ''), '[,()*%\\:_]', ' ', 'g'));
  v_digits text;
begin
  select * into v_s from public.class_sessions where class_sessions.id = p_session;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if not (private.has_permission(v_s.org_id, 'bookings.manage') or private.can_edit_class(v_s.org_id, v_s.instructor_id)) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if length(v_term) < 2 then return; end if;
  v_digits := regexp_replace(v_term, '[.\s-]', '', 'g');

  return query
  select m.id, btrim(m.first_name || ' ' || m.last_name), cur.plan_name, m.access_pin,
         coalesce(cur.status in ('active', 'trialing') and cur.current_period_end > now(), false)
    from public.members m
    left join lateral (
      select p.name as plan_name, ms.status::text as status, ms.current_period_end
        from public.membership_members mm
        join public.memberships ms on ms.id = mm.membership_id
        join public.membership_plans p on p.id = ms.plan_id
       where mm.member_id = m.id and ms.status <> 'canceled'
       order by (ms.status = 'expired'), ms.current_period_end desc
       limit 1
    ) cur on true
   where m.org_id = v_s.org_id and m.status <> 'archived'
     and case
           when v_digits ~ '^\d{1,6}$' then m.access_pin = v_digits::int
           when v_digits ~ '^\d{7,}$' then m.document_id like '%' || v_digits || '%'
           else (m.first_name || ' ' || m.last_name) ilike '%' || v_term || '%'
                or (m.last_name || ' ' || m.first_name) ilike '%' || v_term || '%'
         end
   order by m.first_name, m.last_name
   limit 8;
end $$;
revoke execute on function public.class_member_search(uuid, text) from public, anon;
grant execute on function public.class_member_search(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Control de socios del profe: quién viene a sus clases, plan y asistencia
-- ---------------------------------------------------------------------
create or replace function public.trainer_members(p_org uuid, p_days int default 60)
returns table (
  member_id          uuid,
  member_name        text,
  phone              text,
  medical_notes      text,
  member_status      text,
  is_my_client       boolean,
  plan_name          text,
  membership_status  text,
  current_period_end timestamptz,
  last_checkin_at    timestamptz,
  attended           int,
  no_shows           int,
  pending_marks      int,
  last_class_at      timestamptz,
  next_class_at      timestamptz,
  next_class_name    text
)
language sql stable security definer set search_path = '' as $$
  with me as (
    select s.id from public.staff s where s.org_id = p_org and s.user_id = auth.uid() and s.active
  ),
  sess as (
    select cs.id, cs.starts_at, cs.ends_at, ct.name
      from public.class_sessions cs
      join public.class_types ct on ct.id = cs.class_type_id
     where cs.org_id = p_org and cs.instructor_id in (select id from me) and cs.status <> 'canceled'
       and cs.starts_at > now() - make_interval(days => least(greatest(coalesce(p_days, 60), 7), 180))
       and cs.starts_at < now() + interval '15 days'
  ),
  bk as (
    select b.member_id, b.status, s.starts_at, s.ends_at, s.name
      from public.bookings b join sess s on s.id = b.session_id
     where b.status in ('booked', 'waitlisted', 'checked_in', 'no_show')
  ),
  ids as (
    select bk.member_id from bk
    union
    select tc.member_id from public.trainer_clients tc where tc.trainer_id in (select id from me)
  )
  select m.id,
         btrim(m.first_name || ' ' || m.last_name),
         m.phone, m.medical_notes, m.status::text,
         exists (select 1 from public.trainer_clients tc where tc.member_id = m.id and tc.trainer_id in (select id from me)),
         cur.plan_name, cur.status, cur.current_period_end,
         m.last_checkin_at,
         (select count(*) from bk where bk.member_id = m.id and bk.status = 'checked_in')::int,
         (select count(*) from bk where bk.member_id = m.id and bk.status = 'no_show')::int,
         (select count(*) from bk where bk.member_id = m.id and bk.status = 'booked' and bk.ends_at < now())::int,
         (select max(bk.starts_at) from bk where bk.member_id = m.id and bk.status = 'checked_in'),
         nx.starts_at, nx.name
    from ids
    join public.members m on m.id = ids.member_id and m.org_id = p_org and m.status <> 'archived'
    left join lateral (
      select p.name as plan_name, ms.status::text as status, ms.current_period_end
        from public.membership_members mm
        join public.memberships ms on ms.id = mm.membership_id
        join public.membership_plans p on p.id = ms.plan_id
       where mm.member_id = m.id and ms.status <> 'canceled'
       order by (ms.status = 'expired'), ms.current_period_end desc
       limit 1
    ) cur on true
    left join lateral (
      select bk.starts_at, bk.name from bk
       where bk.member_id = m.id and bk.status in ('booked', 'waitlisted') and bk.starts_at > now()
       order by bk.starts_at limit 1
    ) nx on true
   order by m.first_name, m.last_name
$$;
revoke execute on function public.trainer_members(uuid, int) from public, anon;
grant execute on function public.trainer_members(uuid, int) to authenticated;

-- ---------------------------------------------------------------------
-- 9. Mensajes predefinidos de WhatsApp
--    staff_id null = del gimnasio (los ve todo el equipo; los edita recepción/administración)
--    staff_id = profe → solo los ve y edita ese profe
-- ---------------------------------------------------------------------
create table if not exists public.message_templates (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  staff_id   uuid,
  label      text not null check (length(btrim(label)) between 1 and 40),
  body       text not null check (length(btrim(body)) between 1 and 1500),
  sort       int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (staff_id, org_id) references public.staff (id, org_id) on delete cascade
);
create index if not exists message_templates_org_idx on public.message_templates (org_id, staff_id, sort);
drop trigger if exists message_templates_touch on public.message_templates;
create trigger message_templates_touch before update on public.message_templates
  for each row execute function public.touch_updated_at();

alter table public.message_templates enable row level security;

drop policy if exists message_templates_select on public.message_templates;
create policy message_templates_select on public.message_templates for select to authenticated
  using (
    exists (select 1 from public.staff s
             where s.org_id = message_templates.org_id and s.user_id = (select auth.uid()) and s.active)
    and (staff_id is null
         or staff_id in (select s.id from public.staff s where s.user_id = (select auth.uid()) and s.active))
  );

drop policy if exists message_templates_write on public.message_templates;
create policy message_templates_write on public.message_templates for all to authenticated
  using (
    staff_id in (select s.id from public.staff s
                  where s.user_id = (select auth.uid()) and s.org_id = message_templates.org_id and s.active)
    or (staff_id is null and (select private.has_permission(org_id, 'members.write')))
  )
  with check (
    staff_id in (select s.id from public.staff s
                  where s.user_id = (select auth.uid()) and s.org_id = message_templates.org_id and s.active)
    or (staff_id is null and (select private.has_permission(org_id, 'members.write')))
  );
grant select, insert, update, delete on public.message_templates to authenticated;

-- Los de siempre, ahora editables (más los de clases). {nombre} {profe} {clase} {dia} {hora}
insert into public.message_templates (org_id, staff_id, label, body, sort)
select o.id, null, t.label, t.body, t.sort
  from public.organizations o
 cross join (values
   (10, 'Recordatorio de clase', E'¡Hola {nombre}! Te recuerdo la clase de {clase} del {dia} a las {hora}. ¡Te espero! 💪\n— {profe}'),
   (20, 'Cambio de horario', E'¡Hola {nombre}! Te aviso que la clase de {clase} pasa al {dia} a las {hora}. Tu lugar sigue reservado; si no podés, cancelá desde la app.\n— {profe}'),
   (30, 'Clase suspendida', E'¡Hola {nombre}! Lamentablemente la clase de {clase} del {dia} a las {hora} se suspende. Disculpá las molestias, ¡nos vemos en la próxima!\n— {profe}'),
   (40, 'Quedó un lugar', E'¡Hola {nombre}! Se liberó un lugar en {clase} del {dia} a las {hora}. Si querés venir, anotate desde la app. 🙌\n— {profe}'),
   (50, 'Rutina nueva', E'¡Hola {nombre}! Ya tenés tu rutina nueva en la app, en la pestaña Entrenar. Cualquier duda, consultame.\n— {profe}'),
   (60, 'Te extrañamos', E'¡Hola {nombre}! Hace unos días que no te vemos por el gimnasio. ¿Todo bien? Te esperamos para retomar 💪\n— {profe}'),
   (70, 'Plan vencido', E'¡Hola {nombre}! Te aviso que tu plan está vencido. Podés renovarlo desde la app (Pagar) o en recepción, así no perdés tu lugar en las clases.\n— {profe}'),
   (80, 'Ánimo', E'¡Vamos {nombre}! La constancia es la clave: cada entrenamiento suma. ¡Nos vemos en el gym! 🔥\n— {profe}'),
   (90, 'Felicitaciones', E'¡Felicitaciones {nombre}! Venís progresando muy bien. ¡Seguí así! 👏\n— {profe}')
 ) as t(sort, label, body)
 where not exists (select 1 from public.message_templates mt where mt.org_id = o.id);

-- ---------------------------------------------------------------------
-- 10. WhatsApp del profe: también a quien se anotó en sus clases
-- ---------------------------------------------------------------------
drop policy if exists message_outbox_insert on public.message_outbox;
create policy message_outbox_insert on public.message_outbox for insert to authenticated
  with check (
    status = 'manual'
    and channel = 'whatsapp'
    and sender_staff_id in (
      select s.id from public.staff s
       where s.user_id = (select auth.uid()) and s.org_id = message_outbox.org_id and s.active
    )
    and exists (select 1 from public.members m where m.id = member_id and m.org_id = message_outbox.org_id)
    and (
      member_id in (select private.my_client_ids())
      or (select private.has_permission(org_id, 'training.manage_all'))
      or (select private.has_permission(org_id, 'members.write'))
      or exists (select 1 from public.bookings b
                   join public.class_sessions cs on cs.id = b.session_id
                   join public.staff st on st.id = cs.instructor_id
                  where b.member_id = message_outbox.member_id and st.user_id = (select auth.uid())
                    and cs.org_id = message_outbox.org_id)
    )
  );
