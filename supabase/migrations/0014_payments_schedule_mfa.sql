-- =====================================================================
-- Evolution Platform v2 · 0014 · Cobros, agenda y 2FA
--   · 2FA: dueño y administradores solo tienen permisos con sesión AAL2
--     (la exigencia vive en la base, no solo en la pantalla)
--   · Membresías cobradas en mostrador: vencen (no se renuevan solas)
--   · record_payment: registra el cobro y renueva / extiende el plan
--   · payment_ledger: caja con nombre del socio, plan y quién cobró
--   · generate_sessions: crea las clases desde la grilla semanal (+ pg_cron)
--   · cancel_session / end_series / apply_series_to_future
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 2FA obligatorio para owner/admin
-- ---------------------------------------------------------------------
create or replace function private.has_permission(p_org uuid, p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
             when s.role in ('owner', 'admin') and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then false
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

-- staff_guard también exige AAL2 al owner para tocar roles
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
  if v_my_role in ('owner', 'admin') and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'MFA_REQUIRED';
  end if;

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

-- ¿El usuario logueado necesita 2FA en este gimnasio? (lo usa el panel)
create or replace function public.my_staff_role(p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select role::text from public.staff where org_id = p_org and user_id = auth.uid() and active
$$;
revoke execute on function public.my_staff_role(uuid) from public, anon;
grant execute on function public.my_staff_role(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Planes cobrados en mostrador: vencen al final del período
-- ---------------------------------------------------------------------
update public.memberships set cancel_at_period_end = true
 where provider in ('cash', 'transfer', 'card_terminal', 'other') and not cancel_at_period_end;

create or replace function private.plan_period_end(p_plan public.membership_plans, p_start timestamptz)
returns timestamptz
language sql immutable set search_path = '' as $$
  select case p_plan.kind
           when 'recurring'  then p_start + (p_plan.interval_count || ' ' || p_plan.billing_interval)::interval
           when 'class_pack' then p_start + make_interval(days => coalesce(p_plan.credits_valid_days, 30))
           when 'trial'      then p_start + make_interval(days => 7)
           else p_start + interval '1 day'
         end
$$;

create or replace function private.org_midnight(p_org uuid, p_day date default null) returns timestamptz
language sql stable set search_path = '' as $$
  select (coalesce(p_day, (now() at time zone o.timezone)::date))::timestamp at time zone o.timezone
    from public.organizations o where o.id = p_org
$$;

create or replace function public.admin_assign_plan(p_member uuid, p_plan uuid, p_start date default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_m       public.members;
  v_plan    public.membership_plans;
  v_account uuid;
  v_start   timestamptz;
  v_ms      uuid;
begin
  select * into v_m from public.members where id = p_member;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  if not private.has_permission(v_m.org_id, 'billing.write') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_plan from public.membership_plans where id = p_plan and org_id = v_m.org_id and active;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;

  if v_m.billing_account_id is null then
    insert into public.billing_accounts (org_id, payer_member_id, provider)
    values (v_m.org_id, v_m.id, 'cash') returning id into v_account;
    update public.members set billing_account_id = v_account where id = v_m.id;
  else
    select id into v_account from public.billing_accounts
     where id = v_m.billing_account_id and payer_member_id = v_m.id;
    if v_account is null then raise exception 'NOT_PAYER'; end if;
  end if;

  v_start := private.org_midnight(v_m.org_id, p_start);

  update public.memberships
     set status = 'canceled', canceled_at = now()
   where billing_account_id = v_account and status in ('active', 'trialing', 'past_due', 'paused');

  insert into public.memberships (org_id, plan_id, billing_account_id, status, started_at, current_period_start,
                                  current_period_end, credits_remaining, provider, cancel_at_period_end)
  values (v_m.org_id, v_plan.id, v_account, 'active', v_start, v_start, private.plan_period_end(v_plan, v_start),
          v_plan.class_credits, 'cash', true)
  returning id into v_ms;

  insert into public.membership_members (membership_id, member_id, org_id)
  select v_ms, x.id, v_m.org_id
    from public.members x
   where x.billing_account_id = v_account and x.status <> 'archived'
   order by (x.id <> v_m.id), x.created_at;

  return v_ms;
end $$;

-- ---------------------------------------------------------------------
-- 3. Registrar un cobro (y renovar)
-- ---------------------------------------------------------------------
alter table public.payments add column if not exists note text;

create or replace function public.record_payment(
  p_member       uuid,
  p_amount_cents bigint,
  p_method       public.payment_provider,
  p_plan         uuid default null,
  p_note         text default null,
  p_renew        boolean default true
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_m        public.members;
  v_payer    uuid;
  v_account  uuid;
  v_plan     public.membership_plans;
  v_cur      public.memberships;
  v_today    timestamptz;
  v_start    timestamptz;
  v_end      timestamptz;
  v_ms       uuid;
  v_invoice  uuid;
  v_payment  uuid;
  v_currency char(3) := 'ARS';
begin
  select * into v_m from public.members where id = p_member;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  if not private.has_permission(v_m.org_id, 'billing.write') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_amount_cents is null or p_amount_cents < 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_method in ('stripe', 'mercadopago') and p_note is null then
    p_note := 'Registrado manualmente';
  end if;

  -- Se cobra siempre a la cuenta del titular (aunque se opere desde la ficha de un hijo)
  if v_m.billing_account_id is null then
    insert into public.billing_accounts (org_id, payer_member_id, provider)
    values (v_m.org_id, v_m.id, 'cash') returning id into v_account;
    update public.members set billing_account_id = v_account where id = v_m.id;
    v_payer := v_m.id;
  else
    select id, payer_member_id into v_account, v_payer from public.billing_accounts where id = v_m.billing_account_id;
  end if;

  select * into v_cur from public.memberships
   where billing_account_id = v_account and status in ('active', 'trialing', 'past_due', 'paused')
   order by current_period_end desc limit 1;

  if p_renew then
    if p_plan is null then p_plan := v_cur.plan_id; end if;
    if p_plan is null then raise exception 'PLAN_REQUIRED'; end if;
    select * into v_plan from public.membership_plans where id = p_plan and org_id = v_m.org_id and active;
    if not found then raise exception 'PLAN_NOT_FOUND'; end if;
    v_currency := v_plan.currency;
    v_today := private.org_midnight(v_m.org_id);

    if v_cur.id is not null and v_cur.plan_id = v_plan.id then
      -- Mismo plan: se extiende desde el vencimiento (o desde hoy si ya venció)
      v_start := greatest(v_cur.current_period_end, v_today);
      v_end := private.plan_period_end(v_plan, v_start);
      update public.memberships
         set current_period_start = case when v_cur.current_period_end < v_today then v_today else current_period_start end,
             current_period_end = v_end,
             status = 'active',
             credits_remaining = case when v_plan.kind = 'class_pack'
                                      then coalesce(credits_remaining, 0) + v_plan.class_credits else credits_remaining end,
             cancel_at_period_end = true
       where id = v_cur.id;
      v_ms := v_cur.id;
    else
      -- Plan nuevo o distinto: arranca hoy y reemplaza al anterior
      v_ms := public.admin_assign_plan(v_payer, v_plan.id, null);
      v_start := v_today;
      select current_period_end into v_end from public.memberships where id = v_ms;
    end if;
  end if;

  insert into public.invoices (org_id, billing_account_id, membership_id, status, amount_due_cents, amount_paid_cents,
                               currency, period_start, period_end, due_at, provider)
  values (v_m.org_id, v_account, v_ms, 'paid', p_amount_cents, p_amount_cents, v_currency, v_start, v_end, now(), p_method)
  returning id into v_invoice;

  insert into public.payments (org_id, billing_account_id, invoice_id, amount_cents, currency, provider, status, paid_at, note)
  values (v_m.org_id, v_account, v_invoice, p_amount_cents, v_currency, p_method, 'succeeded', now(), nullif(btrim(p_note), ''))
  returning id into v_payment;

  update public.billing_accounts set delinquent = false where id = v_account and delinquent;

  return jsonb_build_object('payment_id', v_payment, 'membership_id', v_ms, 'period_end', v_end);
end $$;
revoke execute on function public.record_payment(uuid, bigint, public.payment_provider, uuid, text, boolean) from public, anon;
grant execute on function public.record_payment(uuid, bigint, public.payment_provider, uuid, text, boolean) to authenticated;

-- Anular un cobro cargado por error (no toca la membresía: se ajusta a mano)
create or replace function public.void_payment(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_p public.payments;
begin
  select * into v_p from public.payments where id = p_payment for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if not private.has_permission(v_p.org_id, 'billing.write') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_p.status <> 'succeeded' then raise exception 'PAYMENT_NOT_VOIDABLE'; end if;
  update public.payments
     set status = 'canceled', note = concat_ws(' · ', note, 'Anulado: ' || coalesce(nullif(btrim(p_reason), ''), 'sin motivo'))
   where id = p_payment;
  update public.invoices set status = 'void' where id = v_p.invoice_id;
end $$;
revoke execute on function public.void_payment(uuid, text) from public, anon;
grant execute on function public.void_payment(uuid, text) to authenticated;

create or replace view public.payment_ledger with (security_invoker = true) as
select p.id, p.org_id, p.paid_at, p.created_at, p.amount_cents, p.currency, p.provider, p.status, p.note,
       p.billing_account_id,
       m.id  as payer_member_id,
       trim(m.first_name || ' ' || m.last_name) as payer_name,
       pl.name as plan_name,
       i.period_end,
       st.display_name as recorded_by_name
  from public.payments p
  join public.billing_accounts ba on ba.id = p.billing_account_id
  join public.members m on m.id = ba.payer_member_id
  left join public.invoices i on i.id = p.invoice_id
  left join public.memberships ms on ms.id = i.membership_id
  left join public.membership_plans pl on pl.id = ms.plan_id
  left join public.staff st on st.user_id = p.recorded_by and st.org_id = p.org_id;
grant select on public.payment_ledger to authenticated;

-- ---------------------------------------------------------------------
-- 4. Agenda: generador de clases desde la grilla semanal
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
    if p_org is null or not private.has_permission(p_org, 'schedule.manage') then
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
      if v_start > now() then
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

-- Cancelar una clase: libera reservas, devuelve créditos y avisa (outbox)
create or replace function public.cancel_session(p_session uuid, p_reason text default null) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.class_sessions;
  v_n int;
begin
  select * into v_s from public.class_sessions where id = p_session for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if not private.has_permission(v_s.org_id, 'schedule.manage') then
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
  return v_n;
end $$;
revoke execute on function public.cancel_session(uuid, text) from public, anon;
grant execute on function public.cancel_session(uuid, text) to authenticated;

-- Dar de baja un horario de la grilla: borra las clases futuras sin reservas
create or replace function public.end_series(p_series uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_s    public.class_series;
  v_del  int;
  v_kept int;
begin
  select * into v_s from public.class_series where id = p_series for update;
  if not found then raise exception 'SERIES_NOT_FOUND'; end if;
  if not private.has_permission(v_s.org_id, 'schedule.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.class_series set valid_until = current_date - 1 where id = p_series;

  delete from public.class_sessions cs
   where cs.series_id = p_series and cs.starts_at > now() and cs.status = 'scheduled'
     and not exists (select 1 from public.bookings b where b.session_id = cs.id and b.status in ('booked', 'waitlisted'));
  get diagnostics v_del = row_count;
  select count(*) into v_kept from public.class_sessions
   where series_id = p_series and starts_at > now() and status = 'scheduled';
  return jsonb_build_object('deleted', v_del, 'kept_with_bookings', v_kept);
end $$;
revoke execute on function public.end_series(uuid) from public, anon;
grant execute on function public.end_series(uuid) to authenticated;

-- Cambios de profe / sala / cupo en la grilla se aplican a las clases futuras
create or replace function public.apply_series_to_future(p_series uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.class_series;
  v_n int := 0;
  r   record;
begin
  select * into v_s from public.class_series where id = p_series;
  if not found then raise exception 'SERIES_NOT_FOUND'; end if;
  if not private.has_permission(v_s.org_id, 'schedule.manage') then
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

-- Lista de la clase (recepción / profe / admin) con nombre y equipo
create or replace view public.session_roster with (security_invoker = true) as
select b.id as booking_id, b.org_id, b.session_id, b.member_id, b.status, b.waitlist_position, b.source, b.created_at,
       trim(m.first_name || ' ' || m.last_name) as member_name, m.phone, m.medical_notes,
       e.label as equipment_label
  from public.bookings b
  join public.members m on m.id = b.member_id
  left join public.equipment e on e.id = b.equipment_id;
grant select on public.session_roster to authenticated;
