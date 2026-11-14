-- =====================================================================
-- Evolution Platform · 0056 · Débito automático de la cuota (Mercado Pago Suscripciones)
--
--   Suscripción SIN plan asociado y con pago pendiente (POST /preapproval, status=pending):
--   el socio autoriza su tarjeta UNA vez en Mercado Pago y MP cobra solo cada período.
--
--   mp_subscriptions            una fila por adhesión (id = external_reference en MP)
--   subscription_create         socio titular (o staff con billing.write) inicia la adhesión
--   subscription_set_preapproval guarda el id y el link que devolvió MP
--   subscription_sync           estado de la suscripción consultado a MP (solo service_role)
--   subscription_payment_settle cobro de una cuota consultado a MP (solo service_role):
--                               aprobado = record_payment_core (misma lógica que el cobro manual)
--   subscription_cancel         baja pedida por el socio o por recepción (después se cancela en MP)
--
--   Nunca se confía en el body del webhook: el servidor consulta a la API de MP y llama a estas funciones.
-- =====================================================================

create table if not exists public.mp_subscriptions (
  id                  uuid primary key default gen_random_uuid(),     -- = external_reference en Mercado Pago
  org_id              uuid not null references public.organizations (id) on delete cascade,
  billing_account_id  uuid not null,
  member_id           uuid not null,                                  -- titular que paga
  plan_id             uuid not null,
  amount_cents        bigint not null check (amount_cents > 0),
  currency            char(3) not null default 'ARS',
  frequency           int not null check (frequency > 0),
  frequency_type      text not null check (frequency_type in ('days', 'months')),
  payer_email         text not null check (length(payer_email) between 3 and 200),
  status              text not null default 'created'
                      check (status in ('created', 'pending', 'authorized', 'paused', 'cancelled')),
  mp_preapproval_id   text unique,
  init_point          text,
  start_date          timestamptz,                                    -- primer cobro (null = enseguida)
  next_payment_date   timestamptz,
  last_payment_at     timestamptz,
  last_failure_at     timestamptz,
  last_failure_detail text,
  failed_payment_ids  text[] not null default '{}',                   -- un solo aviso por cobro rechazado
  cancelled_at        timestamptz,
  cancelled_by        text check (cancelled_by in ('member', 'staff', 'mercadopago')),
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (billing_account_id, org_id) references public.billing_accounts (id, org_id) on delete cascade,
  foreign key (member_id, org_id) references public.members (id, org_id) on delete cascade,
  foreign key (plan_id, org_id) references public.membership_plans (id, org_id)
);
-- Una sola adhesión viva por cuenta (las pendientes viejas se cancelan al crear otra)
create unique index if not exists mp_subscriptions_live_idx on public.mp_subscriptions (billing_account_id)
  where status in ('created', 'pending', 'authorized', 'paused');
create index if not exists mp_subscriptions_org_idx on public.mp_subscriptions (org_id, status, updated_at desc);

drop trigger if exists mp_subscriptions_touch on public.mp_subscriptions;
create trigger mp_subscriptions_touch before update on public.mp_subscriptions
  for each row execute function public.touch_updated_at();

alter table public.mp_subscriptions enable row level security;
drop policy if exists mp_subscriptions_select on public.mp_subscriptions;
create policy mp_subscriptions_select on public.mp_subscriptions for select to authenticated
  using (
    (select private.has_permission(org_id, 'billing.read'))
    or (select private.is_payer(billing_account_id))
  );
revoke all on public.mp_subscriptions from anon, authenticated;
grant select on public.mp_subscriptions to authenticated;
grant select, insert, update on public.mp_subscriptions to service_role;

-- ---------------------------------------------------------------------
-- Iniciar la adhesión
--   · Socio: solo para sí mismo y si es el titular de su cuenta.
--   · Staff con billing.write: para cualquier socio de su gimnasio.
--   Plan: recurrente (mensual, semanal…) con precio; el vigente o uno público.
--   Si ya tiene un plan al día, el primer cobro es el día del vencimiento (no paga dos veces).
-- ---------------------------------------------------------------------
create or replace function public.subscription_create(p_member uuid, p_plan uuid default null, p_payer_email text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_m       public.members;
  v_payer   public.members;
  v_account uuid;
  v_staff   boolean;
  v_cur     public.memberships;
  v_plan    public.membership_plans;
  v_org     public.organizations;
  v_email   text;
  v_freq    int;
  v_ftype   text;
  v_start   timestamptz;
  v_id      uuid;
begin
  select * into v_m from public.members where id = p_member;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  v_staff := private.has_permission(v_m.org_id, 'billing.write');
  if not v_staff and (v_m.user_id is null or v_m.user_id is distinct from auth.uid() or v_m.status = 'archived') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_m.billing_account_id is null then
    insert into public.billing_accounts (org_id, payer_member_id, provider)
    values (v_m.org_id, v_m.id, 'cash') returning id into v_account;
    update public.members set billing_account_id = v_account where id = v_m.id;
    v_payer := v_m;
  else
    v_account := v_m.billing_account_id;
    select m.* into v_payer from public.billing_accounts ba join public.members m on m.id = ba.payer_member_id
     where ba.id = v_account;
    if not v_staff and v_payer.id <> v_m.id then
      raise exception 'NOT_PAYER' using hint = 'El plan lo paga el titular del grupo familiar.';
    end if;
  end if;

  if exists (select 1 from public.mp_subscriptions where billing_account_id = v_account and status in ('authorized', 'paused')) then
    raise exception 'SUBSCRIPTION_ACTIVE' using hint = 'Ya tiene el débito automático activo.';
  end if;

  select * into v_cur from public.memberships
   where billing_account_id = v_account and status in ('active', 'trialing', 'past_due', 'paused', 'expired')
   order by (status = 'expired'), current_period_end desc limit 1;

  p_plan := coalesce(p_plan, v_cur.plan_id);
  if p_plan is null then raise exception 'PLAN_REQUIRED'; end if;
  select * into v_plan from public.membership_plans
   where id = p_plan and org_id = v_m.org_id and active
     and (v_staff or is_public or id = v_cur.plan_id);
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  if v_plan.price_cents <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if v_plan.kind <> 'recurring' or v_plan.billing_interval is null then
    raise exception 'PLAN_NOT_RECURRING' using hint = 'El débito automático es solo para planes con renovación periódica.';
  end if;

  v_freq := case v_plan.billing_interval
              when 'day' then v_plan.interval_count
              when 'week' then v_plan.interval_count * 7
              when 'month' then v_plan.interval_count
              when 'year' then v_plan.interval_count * 12 end;
  v_ftype := case when v_plan.billing_interval in ('day', 'week') then 'days' else 'months' end;

  v_email := lower(btrim(coalesce(nullif(btrim(p_payer_email), ''), v_payer.email, '')));
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'EMAIL_REQUIRED' using hint = 'Hace falta el email de la cuenta de Mercado Pago.';
  end if;

  -- Mismo plan y al día: el primer débito cae el día del vencimiento
  if v_cur.id is not null and v_cur.plan_id = v_plan.id and v_cur.status <> 'expired'
     and v_cur.current_period_end > now() + interval '2 hours' then
    v_start := v_cur.current_period_end;
  end if;

  -- Adhesiones a medio hacer (nunca autorizadas) se descartan
  update public.mp_subscriptions
     set status = 'cancelled', cancelled_at = now(), cancelled_by = case when v_staff then 'staff' else 'member' end
   where billing_account_id = v_account and status in ('created', 'pending');

  select * into v_org from public.organizations where id = v_m.org_id;

  insert into public.mp_subscriptions (org_id, billing_account_id, member_id, plan_id, amount_cents, currency,
                                       frequency, frequency_type, payer_email, start_date)
  values (v_m.org_id, v_account, v_payer.id, v_plan.id, v_plan.price_cents, v_plan.currency,
          v_freq, v_ftype, v_email, v_start)
  returning id into v_id;

  return jsonb_build_object(
    'subscription_id', v_id, 'amount_cents', v_plan.price_cents, 'currency', v_plan.currency,
    'frequency', v_freq, 'frequency_type', v_ftype, 'start_date', v_start,
    'reason', left(v_plan.name || ' · ' || v_org.name, 200), 'payer_email', v_email,
    'plan_name', v_plan.name, 'org_slug', v_org.slug);
end $$;
revoke execute on function public.subscription_create(uuid, uuid, text) from public, anon;
grant execute on function public.subscription_create(uuid, uuid, text) to authenticated;

-- Guarda lo que devolvió Mercado Pago al crear la suscripción
create or replace function public.subscription_set_preapproval(p_sub uuid, p_preapproval_id text, p_init_point text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_init_point !~ '^https://' then raise exception 'INVALID_URL'; end if;
  update public.mp_subscriptions
     set mp_preapproval_id = left(p_preapproval_id, 120), init_point = left(p_init_point, 500), status = 'pending'
   where id = p_sub and status = 'created'
     and (created_by = auth.uid() or coalesce(auth.jwt() ->> 'role', '') = 'service_role');
  if not found then raise exception 'SUBSCRIPTION_NOT_FOUND'; end if;
end $$;
revoke execute on function public.subscription_set_preapproval(uuid, text, text) from public, anon;
grant execute on function public.subscription_set_preapproval(uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Estado de la suscripción consultado a la API de MP (webhook o vuelta del socio)
--   Devuelve action = 'cancel_remote' si acá ya se dio de baja y en MP sigue viva:
--   el servidor la cancela en MP (así nunca se le cobra a quien pidió la baja).
-- ---------------------------------------------------------------------
create or replace function public.subscription_sync(
  p_sub               uuid,
  p_preapproval_id    text,
  p_mp_status         text,
  p_next_payment_date timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_s   public.mp_subscriptions;
  v_new text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_s from public.mp_subscriptions where id = p_sub for update;
  if not found then raise exception 'SUBSCRIPTION_NOT_FOUND'; end if;
  if v_s.mp_preapproval_id is not null and v_s.mp_preapproval_id <> p_preapproval_id then
    raise exception 'PREAPPROVAL_MISMATCH';
  end if;

  v_new := case p_mp_status
             when 'authorized' then 'authorized'
             when 'paused' then 'paused'
             when 'cancelled' then 'cancelled'
             else 'pending' end;

  if v_s.status = 'cancelled' then
    update public.mp_subscriptions set mp_preapproval_id = coalesce(mp_preapproval_id, left(p_preapproval_id, 120))
     where id = v_s.id;
    return jsonb_build_object('status', 'cancelled', 'previous', 'cancelled',
                              'action', case when v_new <> 'cancelled' then 'cancel_remote' end);
  end if;

  update public.mp_subscriptions
     set status = v_new,
         mp_preapproval_id = coalesce(mp_preapproval_id, left(p_preapproval_id, 120)),
         next_payment_date = coalesce(p_next_payment_date, next_payment_date),
         cancelled_at = case when v_new = 'cancelled' then now() else cancelled_at end,
         cancelled_by = case when v_new = 'cancelled' then coalesce(cancelled_by, 'mercadopago') else cancelled_by end
   where id = v_s.id;

  if v_new <> v_s.status and v_new in ('authorized', 'cancelled') then
    insert into public.domain_events (org_id, type, member_id, payload)
    values (v_s.org_id, 'subscription.' || v_new, v_s.member_id,
            jsonb_build_object('subscription_id', v_s.id, 'preapproval_id', p_preapproval_id, 'plan_id', v_s.plan_id,
                               'amount_cents', v_s.amount_cents));
  end if;
  return jsonb_build_object('status', v_new, 'previous', v_s.status, 'member_id', v_s.member_id);
end $$;
revoke execute on function public.subscription_sync(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.subscription_sync(uuid, text, text, timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- Cobro de una cuota (consultado a la API de MP). Idempotente.
-- ---------------------------------------------------------------------
create or replace function public.subscription_payment_settle(
  p_sub           uuid,
  p_mp_payment_id text,
  p_mp_status     text,
  p_status_detail text,
  p_amount_cents  bigint,
  p_currency      text default 'ARS'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_s     public.mp_subscriptions;
  v_pay   uuid;
  v_res   jsonb;
  v_first boolean;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_mp_payment_id is null or p_mp_payment_id !~ '^\d{1,20}$' then raise exception 'INVALID_PAYMENT_ID'; end if;
  select * into v_s from public.mp_subscriptions where id = p_sub for update;
  if not found then raise exception 'SUBSCRIPTION_NOT_FOUND'; end if;

  if p_mp_status = 'approved' then
    select id into v_pay from public.payments where provider = 'mercadopago' and provider_payment_id = p_mp_payment_id;
    if v_pay is not null then
      return jsonb_build_object('status', 'approved', 'duplicate', true, 'payment_id', v_pay);
    end if;
    if p_amount_cents is null or p_amount_cents < v_s.amount_cents or upper(coalesce(p_currency, '')) <> v_s.currency then
      insert into public.domain_events (org_id, type, member_id, payload)
      values (v_s.org_id, 'payment.review', v_s.member_id,
              jsonb_build_object('subscription_id', v_s.id, 'mp_payment_id', p_mp_payment_id, 'reason', 'AMOUNT_MISMATCH',
                                 'expected_cents', v_s.amount_cents, 'amount_cents', p_amount_cents));
      return jsonb_build_object('status', 'review', 'reason', 'AMOUNT_MISMATCH');
    end if;

    v_res := private.record_payment_core(v_s.member_id, p_amount_cents, 'mercadopago', v_s.plan_id,
                                         'Débito automático · MP ' || p_mp_payment_id, true, p_mp_payment_id, false);
    update public.mp_subscriptions
       set last_payment_at = now(), last_failure_at = null, last_failure_detail = null
     where id = v_s.id;
    return jsonb_build_object('status', 'approved', 'duplicate', false, 'payment_id', (v_res ->> 'payment_id')::uuid,
                              'period_end', v_res ->> 'period_end', 'member_id', v_s.member_id);
  end if;

  if p_mp_status in ('rejected', 'cancelled') then
    v_first := not (p_mp_payment_id = any (v_s.failed_payment_ids));
    if v_first then
      update public.mp_subscriptions
         set failed_payment_ids = (failed_payment_ids || p_mp_payment_id)[greatest(1, cardinality(failed_payment_ids) - 18):],
             last_failure_at = now(), last_failure_detail = left(coalesce(p_status_detail, p_mp_status), 120)
       where id = v_s.id;
      -- Evento propio: no dispara "suspender reservas" (MP todavía reintenta el cobro)
      insert into public.domain_events (org_id, type, member_id, payload)
      values (v_s.org_id, 'subscription.payment_failed', v_s.member_id,
              jsonb_build_object('subscription_id', v_s.id, 'mp_payment_id', p_mp_payment_id,
                                 'amount_cents', v_s.amount_cents, 'reason', coalesce(p_status_detail, p_mp_status)));
    end if;
    return jsonb_build_object('status', 'rejected', 'first_notice', v_first, 'member_id', v_s.member_id);
  end if;

  if p_mp_status in ('refunded', 'charged_back') then
    update public.payments set status = 'refunded', note = concat_ws(' · ', note, 'Devuelto en Mercado Pago')
     where provider = 'mercadopago' and provider_payment_id = p_mp_payment_id and status = 'succeeded'
     returning id into v_pay;
    if v_pay is not null then
      -- Conservador: la cuenta queda morosa hasta que recepción lo revise
      update public.billing_accounts set delinquent = true where id = v_s.billing_account_id;
      insert into public.domain_events (org_id, type, member_id, payload)
      values (v_s.org_id, 'payment.refunded', v_s.member_id,
              jsonb_build_object('subscription_id', v_s.id, 'payment_id', v_pay, 'mp_payment_id', p_mp_payment_id,
                                 'mp_status', p_mp_status, 'action', 'account_blocked'));
    end if;
    return jsonb_build_object('status', 'refunded', 'payment_id', v_pay);
  end if;

  return jsonb_build_object('status', 'pending');
end $$;
revoke execute on function public.subscription_payment_settle(uuid, text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.subscription_payment_settle(uuid, text, text, text, bigint, text) to service_role;

-- ---------------------------------------------------------------------
-- Baja: el socio titular (desde la app) o staff con billing.write (desde el panel).
-- Se marca acá primero; el servidor la cancela en MP. Si MP no responde,
-- subscription_sync devuelve cancel_remote en el próximo aviso y se reintenta.
-- ---------------------------------------------------------------------
create or replace function public.subscription_cancel(p_sub uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_s     public.mp_subscriptions;
  v_staff boolean;
  v_self  boolean;
begin
  select * into v_s from public.mp_subscriptions where id = p_sub for update;
  if not found then raise exception 'SUBSCRIPTION_NOT_FOUND'; end if;
  v_staff := private.has_permission(v_s.org_id, 'billing.write');
  v_self := exists (select 1 from public.members where id = v_s.member_id and user_id = auth.uid());
  if not v_staff and not v_self then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if v_s.status = 'cancelled' then
    return jsonb_build_object('status', 'cancelled', 'preapproval_id', v_s.mp_preapproval_id, 'already', true);
  end if;

  update public.mp_subscriptions
     set status = 'cancelled', cancelled_at = now(), cancelled_by = case when v_self then 'member' else 'staff' end
   where id = v_s.id;
  if v_s.status in ('authorized', 'paused') then
    insert into public.domain_events (org_id, type, member_id, payload)
    values (v_s.org_id, 'subscription.cancelled', v_s.member_id,
            jsonb_build_object('subscription_id', v_s.id, 'preapproval_id', v_s.mp_preapproval_id,
                               'by', case when v_self then 'member' else 'staff' end));
  end if;
  return jsonb_build_object('status', 'cancelled', 'preapproval_id', v_s.mp_preapproval_id, 'already', false);
end $$;
revoke execute on function public.subscription_cancel(uuid) from public, anon;
grant execute on function public.subscription_cancel(uuid) to authenticated;
