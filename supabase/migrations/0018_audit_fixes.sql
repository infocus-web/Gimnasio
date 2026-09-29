-- =====================================================================
-- Evolution Platform v2 · 0018 · Correcciones de la auditoría
--   1. Profes/recepción pueden registrar asistencia y entradas (members_guard)
--   2. Profes sin acceso a la recepción (no ven notas médicas de todos)
--   3. Teléfono y DNI del staff: solo para quien gestiona el equipo
--   4. Nadie puede borrar cuentas, membresías, facturas ni pagos (solo anular)
--   5. record_payment bloquea la membresía (sin carreras) · end_series respeta check-ins
--   6. El profe sigue viendo a quien marcó "no vino"
--   7. Membresías vencidas pasan a 'expired' todas las noches (+ días de gracia)
--   8. Índices de claves foráneas faltantes
-- =====================================================================

-- 1 ------------------------------------------------------------------
create or replace function public.members_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     or current_setting('app.linking_user', true) = 'on'
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
     or new.last_checkin_at is distinct from old.last_checkin_at then
    raise exception 'FIELD_NOT_EDITABLE_BY_MEMBER';
  end if;
  return new;
end $$;

-- 2 ------------------------------------------------------------------
delete from public.role_permissions where role = 'trainer' and permission = 'checkins.manage';

-- 3 ------------------------------------------------------------------
revoke select on public.staff from authenticated, anon;
grant select (id, org_id, user_id, role, display_name, bio, photo_url, active, created_at) on public.staff to authenticated;

create or replace function public.staff_contacts(p_org uuid)
returns table (staff_id uuid, phone text, document_id text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.phone, s.document_id from public.staff s
   where s.org_id = p_org and private.has_permission(p_org, 'staff.manage')
$$;
revoke execute on function public.staff_contacts(uuid) from public, anon;
grant execute on function public.staff_contacts(uuid) to authenticated;

-- 4 ------------------------------------------------------------------
drop policy if exists billing_accounts_write on public.billing_accounts;
create policy billing_accounts_insert on public.billing_accounts for insert to authenticated
  with check ((select private.has_permission(org_id, 'billing.write')));
create policy billing_accounts_update on public.billing_accounts for update to authenticated
  using ((select private.has_permission(org_id, 'billing.write')))
  with check ((select private.has_permission(org_id, 'billing.write')));

drop policy if exists memberships_write on public.memberships;
create policy memberships_insert on public.memberships for insert to authenticated
  with check ((select private.has_permission(org_id, 'billing.write')));
create policy memberships_update on public.memberships for update to authenticated
  using ((select private.has_permission(org_id, 'billing.write')))
  with check ((select private.has_permission(org_id, 'billing.write')));

drop policy if exists invoices_write on public.invoices;
create policy invoices_insert on public.invoices for insert to authenticated
  with check ((select private.has_permission(org_id, 'billing.write')));
create policy invoices_update on public.invoices for update to authenticated
  using ((select private.has_permission(org_id, 'billing.write')))
  with check ((select private.has_permission(org_id, 'billing.write')));

revoke delete on public.billing_accounts, public.memberships, public.invoices, public.payments from authenticated;

alter table public.payments drop constraint payments_billing_account_id_org_id_fkey,
  add constraint payments_billing_account_id_org_id_fkey
  foreign key (billing_account_id, org_id) references public.billing_accounts (id, org_id) on delete restrict;
alter table public.invoices drop constraint invoices_billing_account_id_org_id_fkey,
  add constraint invoices_billing_account_id_org_id_fkey
  foreign key (billing_account_id, org_id) references public.billing_accounts (id, org_id) on delete restrict;

-- 5 ------------------------------------------------------------------
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
   order by current_period_end desc limit 1
   for update;                                  -- dos cobros simultáneos no pisan la misma extensión

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
     and not exists (select 1 from public.bookings b where b.session_id = cs.id and b.status in ('booked', 'waitlisted', 'checked_in'));
  get diagnostics v_del = row_count;
  select count(*) into v_kept from public.class_sessions
   where series_id = p_series and starts_at > now() and status = 'scheduled';
  return jsonb_build_object('deleted', v_del, 'kept_with_bookings', v_kept);
end $$;

-- 6 ------------------------------------------------------------------
drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated
  using (
    (select private.has_permission(org_id, 'members.read'))
    or id in (select private.actable_member_ids())
    or id in (select private.my_client_ids())
    or exists (select 1 from public.bookings b
                 join public.class_sessions s on s.id = b.session_id
                 join public.staff st on st.id = s.instructor_id
                where b.member_id = members.id and st.user_id = (select auth.uid())
                  and b.status in ('booked', 'waitlisted', 'checked_in', 'no_show'))
  );

-- 7 ------------------------------------------------------------------
create or replace function public.expire_memberships() returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  with gone as (
    update public.memberships ms
       set status = 'expired'
      from public.organizations o
     where o.id = ms.org_id
       and ms.status in ('active', 'trialing')
       and ms.cancel_at_period_end
       and ms.current_period_end < now() - make_interval(days => o.grace_days)
    returning ms.id, ms.org_id, ms.billing_account_id
  ), ev as (
    insert into public.domain_events (org_id, type, member_id, payload)
    select g.org_id, 'membership.expired', ba.payer_member_id, jsonb_build_object('membership_id', g.id)
      from gone g join public.billing_accounts ba on ba.id = g.billing_account_id
    returning 1
  )
  select count(*) into v_n from gone;
  return v_n;
end $$;
revoke execute on function public.expire_memberships() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $c$select cron.schedule('expire-memberships', '10 6 * * *', 'select public.expire_memberships()')$c$;
  end if;
end $$;

-- El directorio muestra también la última membresía vencida (para "Vencidos")
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
     where mm.member_id = m.id and ms.status <> 'canceled'
     order by (ms.status = 'expired'), ms.current_period_end desc
     limit 1
  ) cur on true;

-- 8 ------------------------------------------------------------------
create index if not exists checkins_booking_idx        on public.checkins (booking_id);
create index if not exists checkins_location_idx       on public.checkins (location_id);
create index if not exists payments_invoice_idx        on public.payments (invoice_id);
create index if not exists invoices_membership_idx     on public.invoices (membership_id);
create index if not exists bookings_membership_all_idx on public.bookings (membership_id);
create index if not exists memberships_plan_idx        on public.memberships (plan_id);
create index if not exists class_sessions_type_idx     on public.class_sessions (class_type_id);
