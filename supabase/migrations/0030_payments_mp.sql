-- =====================================================================
-- Evolution Platform v2 · 0030 · Pagos y caja (agente C)
--   1. Cobro online con Mercado Pago (Checkout Pro):
--        payment_intents (intención de pago = external_reference de MP)
--        payment_intent_create / payment_intent_set_preference (panel y app)
--        payment_intent_settle (solo service_role: lo llama el webhook)
--        private.record_payment_core: MISMA lógica que record_payment (0018)
--   2. Venta en mostrador: products, sales, sale_items, record_sale, void_sale
--   3. Cierre de caja por turno: cash_closures, cash_shift_summary, cash_close_shift
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Núcleo del cobro, sin chequeo de permisos (lo usan record_payment-like
--    callers que YA validaron quién llama). Copia fiel de public.record_payment
--    y public.admin_assign_plan (0014/0018): mantener en sincronía.
-- ---------------------------------------------------------------------
create or replace function private.assign_plan_core(p_member uuid, p_plan uuid, p_start date default null)
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
  select * into v_plan from public.membership_plans where id = p_plan and org_id = v_m.org_id;
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

create or replace function private.record_payment_core(
  p_member              uuid,
  p_amount_cents        bigint,
  p_method              public.payment_provider,
  p_plan                uuid,
  p_note                text,
  p_renew               boolean,
  p_provider_payment_id text default null,
  p_require_active_plan boolean default true
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
  v_frozen   boolean := false;
  v_undo     jsonb := jsonb_build_object('extended', false);   -- datos para deshacer la renovación si MP devuelve el pago
begin
  select * into v_m from public.members where id = p_member;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  if p_amount_cents is null or p_amount_cents < 0 then raise exception 'INVALID_AMOUNT'; end if;

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
   for update;

  if p_renew then
    if p_plan is null then p_plan := v_cur.plan_id; end if;
    if p_plan is null then raise exception 'PLAN_REQUIRED'; end if;
    select * into v_plan from public.membership_plans
     where id = p_plan and org_id = v_m.org_id and (active or not p_require_active_plan);
    if not found then raise exception 'PLAN_NOT_FOUND'; end if;
    v_currency := v_plan.currency;
    v_today := private.org_midnight(v_m.org_id);

    if v_cur.id is not null and v_cur.plan_id = v_plan.id then
      v_start := greatest(v_cur.current_period_end, v_today);
      v_end := private.plan_period_end(v_plan, v_start);
      -- Congelamiento en curso: renovar NO lo corta (sigue 'paused' hasta paused_until; los días ya se sumaron al vencimiento)
      v_frozen := exists (select 1 from public.membership_freezes f where f.membership_id = v_cur.id and f.status = 'active');
      update public.memberships
         set current_period_start = case when v_cur.current_period_end < v_today then v_today else current_period_start end,
             current_period_end = v_end,
             status = case when v_frozen then 'paused'::public.membership_status else 'active'::public.membership_status end,
             credits_remaining = case when v_plan.kind = 'class_pack'
                                      then coalesce(credits_remaining, 0) + v_plan.class_credits else credits_remaining end,
             cancel_at_period_end = true
       where id = v_cur.id;
      v_ms := v_cur.id;
      v_undo := jsonb_build_object('extended', true, 'prev_period_start', v_cur.current_period_start,
                                   'prev_period_end', v_cur.current_period_end, 'prev_status', v_cur.status,
                                   'credits_added', case when v_plan.kind = 'class_pack' then v_plan.class_credits end);
    else
      v_ms := private.assign_plan_core(v_payer, v_plan.id, null);
      v_start := v_today;
      select current_period_end into v_end from public.memberships where id = v_ms;
    end if;
  end if;

  insert into public.invoices (org_id, billing_account_id, membership_id, status, amount_due_cents, amount_paid_cents,
                               currency, period_start, period_end, due_at, provider)
  values (v_m.org_id, v_account, v_ms, 'paid', p_amount_cents, p_amount_cents, v_currency, v_start, v_end, now(), p_method)
  returning id into v_invoice;

  insert into public.payments (org_id, billing_account_id, invoice_id, amount_cents, currency, provider,
                               provider_payment_id, status, paid_at, note)
  values (v_m.org_id, v_account, v_invoice, p_amount_cents, v_currency, p_method,
          p_provider_payment_id, 'succeeded', now(), nullif(btrim(p_note), ''))
  returning id into v_payment;

  update public.billing_accounts set delinquent = false where id = v_account and delinquent;

  return jsonb_build_object('payment_id', v_payment, 'membership_id', v_ms, 'period_end', v_end) || v_undo;
end $$;

-- record_payment (cobro manual, 0018) redefinida SOLO para agregar la misma guarda de congelamiento:
-- pagar durante un congelamiento activo no corta la pausa (si no, el socio entra igual y además
-- conserva los días devueltos al final del plan). Resto idéntico a 0018.
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
  v_frozen   boolean := false;
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
      -- (0030) Congelamiento en curso: renovar no lo corta, sigue 'paused' hasta paused_until
      v_frozen := exists (select 1 from public.membership_freezes f where f.membership_id = v_cur.id and f.status = 'active');
      update public.memberships
         set current_period_start = case when v_cur.current_period_end < v_today then v_today else current_period_start end,
             current_period_end = v_end,
             status = case when v_frozen then 'paused'::public.membership_status else 'active'::public.membership_status end,
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

-- Funciones internas: nadie las llama directo (solo otras security definer)
revoke execute on function private.assign_plan_core(uuid, uuid, date) from public, anon, authenticated;
revoke execute on function private.record_payment_core(uuid, bigint, public.payment_provider, uuid, text, boolean, text, boolean)
  from public, anon, authenticated;
grant execute on function private.record_payment_core(uuid, bigint, public.payment_provider, uuid, text, boolean, text, boolean) to service_role;

-- ---------------------------------------------------------------------
-- 1. Intenciones de pago online (Mercado Pago Checkout Pro)
-- ---------------------------------------------------------------------
create table if not exists public.payment_intents (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete cascade,
  kind               text not null default 'membership' check (kind in ('membership', 'day_pass')),
  billing_account_id uuid,
  member_id          uuid,                                   -- titular que paga (membresías)
  plan_id            uuid,
  description        text not null check (length(description) between 1 and 200),
  amount_cents       bigint not null check (amount_cents > 0),
  currency           char(3) not null default 'ARS',
  source             text not null check (source in ('member_app', 'admin_link', 'public')),
  status             text not null default 'created'
                     check (status in ('created', 'pending', 'approved', 'rejected', 'cancelled', 'refunded', 'review')),
  buyer_email        text,
  buyer_name         text,
  mp_preference_id   text,
  init_point         text,
  mp_payment_id      text,
  mp_status          text,
  mp_status_detail   text,
  payment_id         uuid references public.payments (id) on delete set null,
  result             jsonb,                                  -- respuesta de record_payment (vencimiento nuevo)
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  settled_at         timestamptz,
  foreign key (billing_account_id, org_id) references public.billing_accounts (id, org_id) on delete cascade,
  foreign key (member_id, org_id) references public.members (id, org_id) on delete cascade,
  foreign key (plan_id, org_id) references public.membership_plans (id, org_id),
  check (kind <> 'membership' or (member_id is not null and billing_account_id is not null and plan_id is not null))
);
create index if not exists payment_intents_org_idx on public.payment_intents (org_id, created_at desc);
create index if not exists payment_intents_account_idx on public.payment_intents (billing_account_id, created_at desc);
create index if not exists payment_intents_mp_payment_idx on public.payment_intents (mp_payment_id);

drop trigger if exists payment_intents_touch on public.payment_intents;
create trigger payment_intents_touch before update on public.payment_intents
  for each row execute function public.touch_updated_at();

alter table public.payment_intents enable row level security;
drop policy if exists payment_intents_select on public.payment_intents;
create policy payment_intents_select on public.payment_intents for select to authenticated
  using (
    (select private.has_permission(org_id, 'billing.read'))
    or (billing_account_id is not null and (select private.is_payer(billing_account_id)))
  );
revoke all on public.payment_intents from anon, authenticated;
grant select on public.payment_intents to authenticated;
grant select, insert, update on public.payment_intents to service_role;

-- Crea la intención de pago de un plan.
--   · Staff con billing.write: para cualquier socio de su gimnasio (link por WhatsApp).
--   · Socio: solo para sí mismo, si es el titular de su cuenta; plan vigente o un plan público.
create or replace function public.payment_intent_create(p_member uuid, p_plan uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_m       public.members;
  v_payer   public.members;
  v_account uuid;
  v_cur     uuid;
  v_plan    public.membership_plans;
  v_staff   boolean;
  v_id      uuid;
  v_org     public.organizations;
begin
  select * into v_m from public.members where id = p_member;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  v_staff := private.has_permission(v_m.org_id, 'billing.write');
  if not v_staff and (v_m.user_id is null or v_m.user_id is distinct from auth.uid() or v_m.status = 'archived') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- Se cobra siempre a la cuenta del titular
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

  select plan_id into v_cur from public.memberships
   where billing_account_id = v_account and status in ('active', 'trialing', 'past_due', 'paused', 'expired')
   order by (status = 'expired'), current_period_end desc limit 1;

  p_plan := coalesce(p_plan, v_cur);
  if p_plan is null then raise exception 'PLAN_REQUIRED'; end if;
  select * into v_plan from public.membership_plans
   where id = p_plan and org_id = v_m.org_id and active
     and (v_staff or is_public or id = v_cur);
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  if v_plan.price_cents <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  select * into v_org from public.organizations where id = v_m.org_id;

  insert into public.payment_intents (org_id, kind, billing_account_id, member_id, plan_id, description, amount_cents,
                                      currency, source, buyer_email, buyer_name)
  values (v_m.org_id, 'membership', v_account, v_payer.id, v_plan.id, left(v_plan.name || ' · ' || v_org.name, 200),
          v_plan.price_cents, v_plan.currency, case when v_staff and v_m.user_id is distinct from auth.uid() then 'admin_link' else 'member_app' end,
          v_payer.email, trim(v_payer.first_name || ' ' || v_payer.last_name))
  returning id into v_id;

  return jsonb_build_object(
    'intent_id', v_id, 'amount_cents', v_plan.price_cents, 'currency', v_plan.currency,
    'plan_id', v_plan.id, 'plan_name', v_plan.name, 'org_name', v_org.name, 'org_slug', v_org.slug,
    'payer_id', v_payer.id, 'payer_first_name', v_payer.first_name, 'payer_last_name', v_payer.last_name,
    'payer_email', v_payer.email, 'payer_phone', v_payer.phone);
end $$;
revoke execute on function public.payment_intent_create(uuid, uuid) from public, anon;
grant execute on function public.payment_intent_create(uuid, uuid) to authenticated;

-- Lo que ve el socio en "Pagar mi plan": si es titular, su plan actual y los planes que puede pagar
create or replace function public.member_payment_options(p_member uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_m      public.members;
  v_payer  uuid;
  v_cur    record;
begin
  select * into v_m from public.members where id = p_member and user_id = auth.uid() and status <> 'archived';
  if not found then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select payer_member_id into v_payer from public.billing_accounts where id = v_m.billing_account_id;
  select ms.plan_id, p.name, p.price_cents, p.currency, ms.status, ms.current_period_end into v_cur
    from public.memberships ms join public.membership_plans p on p.id = ms.plan_id
   where ms.billing_account_id = v_m.billing_account_id and ms.status in ('active', 'trialing', 'past_due', 'paused', 'expired')
   order by (ms.status = 'expired'), ms.current_period_end desc limit 1;
  return jsonb_build_object(
    'is_payer', v_payer is null or v_payer = v_m.id,
    'current', case when v_cur.plan_id is null then null else jsonb_build_object(
      'plan_id', v_cur.plan_id, 'name', v_cur.name, 'price_cents', v_cur.price_cents, 'currency', v_cur.currency,
      'status', v_cur.status, 'period_end', v_cur.current_period_end) end,
    'plans', coalesce((select jsonb_agg(jsonb_build_object('plan_id', p.id, 'name', p.name, 'description', p.description,
                                                         'price_cents', p.price_cents, 'currency', p.currency)
                                        order by p.sort, p.price_cents)
                         from public.membership_plans p
                        where p.org_id = v_m.org_id and p.active and p.price_cents > 0
                          and (p.is_public or p.id = v_cur.plan_id)), '[]'::jsonb));
end $$;
revoke execute on function public.member_payment_options(uuid) from public, anon;
grant execute on function public.member_payment_options(uuid) to authenticated;

-- Guarda la preferencia que devolvió Mercado Pago (solo quien creó la intención)
create or replace function public.payment_intent_set_preference(p_intent uuid, p_preference_id text, p_init_point text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_init_point !~ '^https://' then raise exception 'INVALID_URL'; end if;
  update public.payment_intents
     set mp_preference_id = left(p_preference_id, 120), init_point = left(p_init_point, 500)
   where id = p_intent and status = 'created'
     and (created_by = auth.uid() or coalesce(auth.jwt() ->> 'role', '') = 'service_role');
  if not found then raise exception 'INTENT_NOT_FOUND'; end if;
end $$;
revoke execute on function public.payment_intent_set_preference(uuid, text, text) from public, anon;
grant execute on function public.payment_intent_set_preference(uuid, text, text) to authenticated, service_role;

-- Resultado de un pago consultado a la API de Mercado Pago (NUNCA con datos del body del webhook).
-- Idempotente: el mismo pago aprobado dos veces = un solo cobro y una sola renovación.
create or replace function public.payment_intent_settle(
  p_intent        uuid,
  p_mp_payment_id text,
  p_mp_status     text,
  p_status_detail text,
  p_amount_cents  bigint,
  p_currency      text default 'ARS'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_i      public.payment_intents;
  v_pay    uuid;
  v_res    jsonb;
  v_new    text;
  v_ms     public.memberships;
  v_action text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_i from public.payment_intents where id = p_intent for update;
  if not found then raise exception 'INTENT_NOT_FOUND'; end if;

  -- Ya se registró este pago (reintento del webhook o vuelta del socio)
  if p_mp_status = 'approved' then
    select id into v_pay from public.payments where provider = 'mercadopago' and provider_payment_id = p_mp_payment_id;
    if v_pay is not null then
      return jsonb_build_object('status', 'approved', 'duplicate', true, 'payment_id', v_pay, 'result', v_i.result);
    end if;
  end if;
  -- Otro pago de MP ya aprobó esta intención (pagó dos veces el mismo link): no se renueva de nuevo
  if v_i.status = 'approved' and v_i.mp_payment_id is distinct from p_mp_payment_id and p_mp_status = 'approved' then
    insert into public.domain_events (org_id, type, member_id, payload)
    values (v_i.org_id, 'payment.review', v_i.member_id,
            jsonb_build_object('intent_id', v_i.id, 'mp_payment_id', p_mp_payment_id, 'reason', 'DUPLICATE_PAYMENT_FOR_INTENT',
                               'amount_cents', p_amount_cents));
    return jsonb_build_object('status', 'review', 'reason', 'DUPLICATE_PAYMENT_FOR_INTENT');
  end if;

  if p_mp_status = 'approved' then
    if v_i.status = 'approved' then
      return jsonb_build_object('status', 'approved', 'duplicate', true, 'payment_id', v_i.payment_id, 'result', v_i.result);
    end if;
    if p_amount_cents is null or p_amount_cents < v_i.amount_cents or upper(coalesce(p_currency, '')) <> v_i.currency then
      update public.payment_intents
         set status = 'review', mp_payment_id = p_mp_payment_id, mp_status = p_mp_status,
             mp_status_detail = left(p_status_detail, 120), settled_at = now()
       where id = v_i.id;
      insert into public.domain_events (org_id, type, member_id, payload)
      values (v_i.org_id, 'payment.review', v_i.member_id,
              jsonb_build_object('intent_id', v_i.id, 'mp_payment_id', p_mp_payment_id, 'reason', 'AMOUNT_MISMATCH',
                                 'expected_cents', v_i.amount_cents, 'amount_cents', p_amount_cents));
      return jsonb_build_object('status', 'review', 'reason', 'AMOUNT_MISMATCH');
    end if;

    if v_i.kind = 'membership' then
      v_res := private.record_payment_core(v_i.member_id, p_amount_cents, 'mercadopago', v_i.plan_id,
                                           'Pago online · MP ' || p_mp_payment_id, true, p_mp_payment_id, false);
      v_pay := (v_res ->> 'payment_id')::uuid;
    else
      v_res := private.settle_day_pass(v_i);   -- pase de un día comprado en la web
    end if;

    update public.payment_intents
       set status = 'approved', mp_payment_id = p_mp_payment_id, mp_status = p_mp_status,
           mp_status_detail = left(p_status_detail, 120), payment_id = v_pay, result = v_res, settled_at = now()
     where id = v_i.id;
    return jsonb_build_object('status', 'approved', 'duplicate', false, 'payment_id', v_pay, 'result', v_res);
  end if;

  -- Devuelto / contracargo de un pago ya registrado
  if p_mp_status in ('refunded', 'charged_back') then
    if v_i.status = 'approved' and v_i.mp_payment_id = p_mp_payment_id then
      update public.payments set status = 'refunded',
             note = concat_ws(' · ', note, 'Devuelto en Mercado Pago')
       where id = v_i.payment_id and status = 'succeeded';

      if v_i.kind = 'day_pass' then
        -- El pase comprado deja de servir (aunque tenga entradas sin usar)
        update public.day_passes set revoked_at = now() where id = v_i.day_pass_id and revoked_at is null;
        v_action := 'pass_revoked';
      else
        -- Se deshace la renovación SOLO si este pago extendió el mismo plan y nada cambió después
        -- (otro cobro, un congelamiento, un cambio de plan). Si no se puede calcular seguro: cuenta morosa
        -- (el molinete no deja pasar hasta que recepción lo revise y registre un cobro).
        select * into v_ms from public.memberships where id = (v_i.result ->> 'membership_id')::uuid for update;
        if coalesce((v_i.result ->> 'extended')::boolean, false)
           and v_ms.id is not null
           and v_ms.status in ('active', 'trialing', 'past_due', 'paused')
           and v_i.result ->> 'prev_period_end' is not null
           and v_ms.current_period_end = (v_i.result ->> 'period_end')::timestamptz then
          update public.memberships
             set current_period_start = (v_i.result ->> 'prev_period_start')::timestamptz,
                 current_period_end = (v_i.result ->> 'prev_period_end')::timestamptz,
                 credits_remaining = case when credits_remaining is not null and v_i.result ->> 'credits_added' is not null
                                          then greatest(0, credits_remaining - (v_i.result ->> 'credits_added')::int)
                                          else credits_remaining end,
                 status = case when status = 'active' and v_i.result ->> 'prev_status' = 'past_due'
                               then 'past_due'::public.membership_status else status end
           where id = v_ms.id;
          v_action := 'period_rolled_back';
        else
          update public.billing_accounts set delinquent = true where id = v_i.billing_account_id;
          v_action := 'account_blocked';
        end if;
      end if;

      update public.payment_intents
         set status = 'refunded', mp_status = p_mp_status,
             result = coalesce(result, '{}'::jsonb)
                      || jsonb_build_object('refund', jsonb_build_object('action', v_action, 'at', now(), 'mp_status', p_mp_status,
                                                                         'restored_period_end', case when v_action = 'period_rolled_back'
                                                                                                     then v_i.result -> 'prev_period_end' end))
       where id = v_i.id;
      insert into public.domain_events (org_id, type, member_id, payload)
      values (v_i.org_id, 'payment.refunded', v_i.member_id,
              jsonb_build_object('intent_id', v_i.id, 'kind', v_i.kind, 'payment_id', v_i.payment_id,
                                 'mp_payment_id', p_mp_payment_id, 'mp_status', p_mp_status, 'action', v_action,
                                 'day_pass_id', v_i.day_pass_id, 'membership_id', v_i.result ->> 'membership_id'));
    end if;
    return jsonb_build_object('status', 'refunded', 'action', v_action);
  end if;

  if v_i.status in ('approved', 'refunded', 'review') then
    return jsonb_build_object('status', v_i.status, 'ignored', true);   -- un estado viejo no pisa uno final
  end if;

  v_new := case when p_mp_status in ('rejected') then 'rejected'
                when p_mp_status in ('cancelled') then 'cancelled'
                else 'pending' end;               -- pending, in_process, authorized, in_mediation

  if v_new in ('rejected', 'cancelled') and v_i.status not in ('rejected', 'cancelled') then
    -- Evento directo (no un pago "failed": eso marcaría la cuenta como morosa por un intento con tarjeta)
    insert into public.domain_events (org_id, type, member_id, payload)
    values (v_i.org_id, 'payment.failed', v_i.member_id,
            jsonb_build_object('intent_id', v_i.id, 'mp_payment_id', p_mp_payment_id, 'provider', 'mercadopago',
                               'amount_cents', v_i.amount_cents, 'currency', v_i.currency,
                               'reason', coalesce(p_status_detail, p_mp_status)));
  end if;
  update public.payment_intents
     set status = v_new, mp_payment_id = p_mp_payment_id, mp_status = p_mp_status,
         mp_status_detail = left(p_status_detail, 120)
   where id = v_i.id;
  return jsonb_build_object('status', v_new);
end $$;
revoke execute on function public.payment_intent_settle(uuid, text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.payment_intent_settle(uuid, text, text, text, bigint, text) to service_role;

-- ---------------------------------------------------------------------
-- 2. Venta en mostrador
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 80),
  price_cents bigint not null check (price_cents >= 0),
  stock       int check (stock >= 0),             -- null = no se controla stock
  active      boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, org_id)
);
create index if not exists products_org_idx on public.products (org_id, active, sort, name);
drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

alter table public.products enable row level security;
drop policy if exists products_select on public.products;
create policy products_select on public.products for select to authenticated
  using ((select private.has_permission(org_id, 'billing.read')) or (select private.has_permission(org_id, 'billing.write')));
drop policy if exists products_insert on public.products;
create policy products_insert on public.products for insert to authenticated
  with check ((select private.has_permission(org_id, 'billing.write')));
drop policy if exists products_update on public.products;
create policy products_update on public.products for update to authenticated
  using ((select private.has_permission(org_id, 'billing.write')))
  with check ((select private.has_permission(org_id, 'billing.write')));
revoke all on public.products from anon, authenticated;
grant select, insert, update on public.products to authenticated;

create table if not exists public.sales (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  member_id    uuid,
  method       public.payment_provider not null,
  total_cents  bigint not null check (total_cents >= 0),
  status       text not null default 'completed' check (status in ('completed', 'voided')),
  note         text check (note is null or length(note) <= 300),
  sold_by      uuid default auth.uid(),
  sold_at      timestamptz not null default now(),
  voided_at    timestamptz,
  void_reason  text,
  unique (id, org_id),
  foreign key (member_id, org_id) references public.members (id, org_id) on delete set null (member_id)
);
create index if not exists sales_org_sold_idx on public.sales (org_id, sold_at desc);
create index if not exists sales_seller_idx on public.sales (org_id, sold_by, sold_at);

create table if not exists public.sale_items (
  id               bigint generated always as identity primary key,
  sale_id          uuid not null,
  org_id           uuid not null,
  product_id       uuid,
  name             text not null,
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  quantity         int not null check (quantity between 1 and 999),
  subtotal_cents   bigint not null check (subtotal_cents >= 0),
  foreign key (sale_id, org_id) references public.sales (id, org_id) on delete cascade,
  foreign key (product_id, org_id) references public.products (id, org_id) on delete set null (product_id)
);
create index if not exists sale_items_sale_idx on public.sale_items (sale_id);
create index if not exists sale_items_product_idx on public.sale_items (product_id);

alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales for select to authenticated
  using ((select private.has_permission(org_id, 'billing.read')) or sold_by = (select auth.uid()));
drop policy if exists sale_items_select on public.sale_items;
create policy sale_items_select on public.sale_items for select to authenticated
  using ((select private.has_permission(org_id, 'billing.read'))
         or exists (select 1 from public.sales s where s.id = sale_id and s.sold_by = (select auth.uid())));
revoke all on public.sales, public.sale_items from anon, authenticated;
grant select on public.sales, public.sale_items to authenticated;

-- Vende: p_items = [{"product_id": "...", "quantity": 2}, ...]. Descuenta stock (sin negativos).
create or replace function public.record_sale(
  p_org    uuid,
  p_items  jsonb,
  p_method public.payment_provider,
  p_member uuid default null,
  p_note   text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sale  uuid;
  v_total bigint := 0;
  v_it    record;
  v_p     public.products;
begin
  if not private.has_permission(p_org, 'billing.write') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_method = 'stripe' then raise exception 'INVALID_METHOD'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_SALE';
  end if;
  if p_member is not null and not exists (select 1 from public.members where id = p_member and org_id = p_org) then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  insert into public.sales (org_id, member_id, method, total_cents, note)
  values (p_org, p_member, p_method, 0, nullif(btrim(left(p_note, 300)), ''))
  returning id into v_sale;

  -- Mismo producto repetido se suma; orden fijo de bloqueo (sin deadlocks entre dos cajas)
  for v_it in
    select (e ->> 'product_id')::uuid as product_id, sum((e ->> 'quantity')::int)::int as qty
      from jsonb_array_elements(p_items) e
     group by 1 order by 1
  loop
    if v_it.qty is null or v_it.qty < 1 or v_it.qty > 999 then raise exception 'INVALID_QUANTITY'; end if;
    select * into v_p from public.products where id = v_it.product_id and org_id = p_org for update;
    if not found or not v_p.active then
      raise exception 'PRODUCT_NOT_FOUND' using hint = 'Uno de los productos no existe o está desactivado.';
    end if;
    if v_p.stock is not null then
      if v_p.stock < v_it.qty then
        raise exception 'OUT_OF_STOCK' using hint = format('No alcanza el stock de "%s" (quedan %s).', v_p.name, v_p.stock);
      end if;
      update public.products set stock = stock - v_it.qty where id = v_p.id;
    end if;
    insert into public.sale_items (sale_id, org_id, product_id, name, unit_price_cents, quantity, subtotal_cents)
    values (v_sale, p_org, v_p.id, v_p.name, v_p.price_cents, v_it.qty, v_p.price_cents * v_it.qty);
    v_total := v_total + v_p.price_cents * v_it.qty;
  end loop;

  update public.sales set total_cents = v_total where id = v_sale;
  return jsonb_build_object('sale_id', v_sale, 'total_cents', v_total);
end $$;
revoke execute on function public.record_sale(uuid, jsonb, public.payment_provider, uuid, text) from public, anon;
grant execute on function public.record_sale(uuid, jsonb, public.payment_provider, uuid, text) to authenticated;

-- Anular una venta cargada por error: devuelve el stock
create or replace function public.void_sale(p_sale uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_s public.sales;
begin
  select * into v_s from public.sales where id = p_sale for update;
  if not found then raise exception 'SALE_NOT_FOUND'; end if;
  if not private.has_permission(v_s.org_id, 'billing.write') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_s.status <> 'completed' then raise exception 'SALE_NOT_VOIDABLE'; end if;
  update public.products p set stock = p.stock + x.qty
    from (select product_id, sum(quantity)::int as qty from public.sale_items where sale_id = p_sale group by 1) x
   where p.id = x.product_id and p.stock is not null;
  update public.sales
     set status = 'voided', voided_at = now(), void_reason = coalesce(nullif(btrim(p_reason), ''), 'sin motivo')
   where id = p_sale;
end $$;
revoke execute on function public.void_sale(uuid, text) from public, anon;
grant execute on function public.void_sale(uuid, text) to authenticated;

-- Caja: ventas con quién vendió y a quién
create or replace view public.sale_ledger with (security_invoker = true) as
select s.id, s.org_id, s.sold_at, s.total_cents, s.method, s.status, s.note, s.member_id, s.sold_by, s.void_reason,
       trim(m.first_name || ' ' || m.last_name) as member_name,
       st.display_name as sold_by_name,
       (select string_agg(i.quantity || '× ' || i.name, ', ' order by i.id) from public.sale_items i where i.sale_id = s.id) as items_summary
  from public.sales s
  left join public.members m on m.id = s.member_id
  left join public.staff st on st.user_id = s.sold_by and st.org_id = s.org_id;
grant select on public.sale_ledger to authenticated;

-- ---------------------------------------------------------------------
-- 3. Cierre de caja por turno
-- ---------------------------------------------------------------------
create table if not exists public.cash_closures (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id) on delete cascade,
  staff_user_id       uuid not null,
  staff_name          text,
  period_from         timestamptz not null,
  period_to           timestamptz not null,
  totals              jsonb not null default '{}'::jsonb,   -- {"cash": {"payments": c, "sales": c, "total": c, "count": n}, ...}
  total_cents         bigint not null default 0,
  expected_cash_cents bigint not null default 0,
  counted_cash_cents  bigint not null check (counted_cash_cents >= 0),
  difference_cents    bigint not null,
  note                text check (note is null or length(note) <= 500),
  created_at          timestamptz not null default now(),
  check (period_to >= period_from)
);
create index if not exists cash_closures_org_idx on public.cash_closures (org_id, created_at desc);
create index if not exists cash_closures_staff_idx on public.cash_closures (org_id, staff_user_id, period_to desc);

alter table public.cash_closures enable row level security;
drop policy if exists cash_closures_select on public.cash_closures;
create policy cash_closures_select on public.cash_closures for select to authenticated
  using ((select private.has_permission(org_id, 'billing.read')) or staff_user_id = (select auth.uid()));
revoke all on public.cash_closures from anon, authenticated;
grant select on public.cash_closures to authenticated;

-- Lo cobrado por un usuario en (desde, hasta]: cuotas que registró + ventas que hizo, por medio de pago
create or replace function private.cash_shift_totals(p_org uuid, p_user uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with x as (
    select p.provider::text as method, p.amount_cents as payments, 0::bigint as sales, 1 as n
      from public.payments p
     where p.org_id = p_org and p.recorded_by = p_user and p.status = 'succeeded'
       and p.paid_at > p_from and p.paid_at <= p_to
    union all
    select s.method::text, 0, s.total_cents, 1
      from public.sales s
     where s.org_id = p_org and s.sold_by = p_user and s.status = 'completed'
       and s.sold_at > p_from and s.sold_at <= p_to
  )
  select coalesce(jsonb_object_agg(method, jsonb_build_object('payments', pay, 'sales', sal, 'total', pay + sal, 'count', n)), '{}'::jsonb)
    from (select method, sum(payments)::bigint as pay, sum(sales)::bigint as sal, sum(n)::int as n from x group by method) t
$$;
revoke execute on function private.cash_shift_totals(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function private.cash_shift_start(p_org uuid, p_user uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  -- Desde el último cierre de esa persona; si nunca cerró, desde las 00:00 de hoy
  select coalesce((select max(period_to) from public.cash_closures where org_id = p_org and staff_user_id = p_user),
                  private.org_midnight(p_org))
$$;
revoke execute on function private.cash_shift_start(uuid, uuid) from public, anon, authenticated;

create or replace function public.cash_shift_summary(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_from timestamptz;
  v_to   timestamptz := now();
begin
  if not private.has_permission(p_org, 'billing.write') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  v_from := private.cash_shift_start(p_org, auth.uid());
  return jsonb_build_object('from', v_from, 'to', v_to,
                            'totals', private.cash_shift_totals(p_org, auth.uid(), v_from, v_to));
end $$;
revoke execute on function public.cash_shift_summary(uuid) from public, anon;
grant execute on function public.cash_shift_summary(uuid) to authenticated;

-- Cierra el turno hasta p_to (el momento que vio en pantalla, para no sumar cobros que no contó)
create or replace function public.cash_close_shift(p_org uuid, p_counted_cash_cents bigint, p_note text default null,
                                                   p_to timestamptz default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_from     timestamptz;
  v_to       timestamptz;
  v_totals   jsonb;
  v_expected bigint;
  v_total    bigint;
  v_id       uuid;
begin
  if not private.has_permission(p_org, 'billing.write') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_counted_cash_cents is null or p_counted_cash_cents < 0 then raise exception 'INVALID_AMOUNT'; end if;
  -- Dos clics seguidos de la misma persona: el segundo espera y arranca donde terminó el primero
  perform pg_advisory_xact_lock(hashtextextended('cash_close:' || p_org::text || ':' || auth.uid()::text, 0));

  v_from := private.cash_shift_start(p_org, auth.uid());
  v_to := least(coalesce(p_to, now()), now());
  if v_to <= v_from then raise exception 'SHIFT_ALREADY_CLOSED'; end if;

  v_totals := private.cash_shift_totals(p_org, auth.uid(), v_from, v_to);
  v_expected := coalesce((v_totals -> 'cash' ->> 'total')::bigint, 0);
  select coalesce(sum((value ->> 'total')::bigint), 0) into v_total from jsonb_each(v_totals);

  insert into public.cash_closures (org_id, staff_user_id, staff_name, period_from, period_to, totals, total_cents,
                                    expected_cash_cents, counted_cash_cents, difference_cents, note)
  values (p_org, auth.uid(),
          (select display_name from public.staff where org_id = p_org and user_id = auth.uid()),
          v_from, v_to, v_totals, v_total, v_expected, p_counted_cash_cents, p_counted_cash_cents - v_expected,
          nullif(btrim(left(p_note, 500)), ''))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'from', v_from, 'to', v_to, 'totals', v_totals, 'total_cents', v_total,
                            'expected_cash_cents', v_expected, 'counted_cash_cents', p_counted_cash_cents,
                            'difference_cents', p_counted_cash_cents - v_expected);
end $$;
revoke execute on function public.cash_close_shift(uuid, bigint, text, timestamptz) from public, anon;
grant execute on function public.cash_close_shift(uuid, bigint, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Pase de un día comprado online (web pública) · usa private.issue_day_pass (0029)
-- ---------------------------------------------------------------------
create table if not exists public.online_sale_settings (
  org_id                uuid primary key references public.organizations (id) on delete cascade,
  day_pass_enabled      boolean not null default false,
  day_pass_price_cents  bigint not null default 0 check (day_pass_price_cents >= 0),
  day_pass_days         int not null default 1 check (day_pass_days between 1 and 31),
  day_pass_entries      int not null default 1 check (day_pass_entries between 1 and 60),
  updated_at            timestamptz not null default now(),
  check (not day_pass_enabled or day_pass_price_cents > 0)
);
drop trigger if exists online_sale_settings_touch on public.online_sale_settings;
create trigger online_sale_settings_touch before update on public.online_sale_settings
  for each row execute function public.touch_updated_at();
alter table public.online_sale_settings enable row level security;
drop policy if exists online_sale_settings_select on public.online_sale_settings;
create policy online_sale_settings_select on public.online_sale_settings for select to authenticated
  using ((select private.has_permission(org_id, 'billing.read')));
drop policy if exists online_sale_settings_write on public.online_sale_settings;
create policy online_sale_settings_write on public.online_sale_settings for all to authenticated
  using ((select private.has_permission(org_id, 'billing.write')))
  with check ((select private.has_permission(org_id, 'billing.write')));
revoke all on public.online_sale_settings from anon, authenticated;
grant select, insert, update on public.online_sale_settings to authenticated;

alter table public.payment_intents add column if not exists day_pass_id uuid;
alter table public.payment_intents add column if not exists email_sent_at timestamptz;

-- Oferta pública (sin login): ¿se vende el pase online? ¿a cuánto?
create or replace function public.public_day_pass_offer(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('org_id', o.id, 'org_name', o.name, 'slug', o.slug,
                            'enabled', coalesce(s.day_pass_enabled, false), 'price_cents', s.day_pass_price_cents,
                            'days', s.day_pass_days, 'entries', s.day_pass_entries)
    from public.organizations o
    left join public.online_sale_settings s on s.org_id = o.id
   where o.slug = p_slug
$$;
revoke execute on function public.public_day_pass_offer(text) from public;
grant execute on function public.public_day_pass_offer(text) to anon, authenticated;

-- Intención de compra de un pase (web pública). El pase se emite recién cuando MP aprueba.
create or replace function public.payment_intent_create_day_pass(p_slug text, p_name text, p_email text,
                                                                 p_phone text default null, p_document text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_o  public.organizations;
  v_s  public.online_sale_settings;
  v_id uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  select * into v_o from public.organizations where slug = p_slug;
  if not found then raise exception 'ORG_NOT_FOUND'; end if;
  select * into v_s from public.online_sale_settings where org_id = v_o.id;
  if not found or not v_s.day_pass_enabled then raise exception 'DAY_PASS_NOT_FOR_SALE'; end if;
  if length(btrim(coalesce(p_name, ''))) not between 2 and 120 then raise exception 'NAME_REQUIRED'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200 then raise exception 'EMAIL_INVALID'; end if;
  -- Freno anti abuso: pocas compras abiertas por email por hora
  if (select count(*) from public.payment_intents
       where org_id = v_o.id and kind = 'day_pass' and buyer_email = v_email
         and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'TOO_MANY_ATTEMPTS';
  end if;
  -- …y por gimnasio: como mucho 30 compras web sin pagar creadas en 10 minutos (evita llenar la tabla
  -- cambiando el email). Dos pedidos a la vez se ordenan con el lock para no pasar el tope.
  perform pg_advisory_xact_lock(hashtextextended('day_pass_public:' || v_o.id::text, 0));
  if (select count(*) from public.payment_intents
       where org_id = v_o.id and source = 'public' and status in ('created', 'pending')
         and created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'DAY_PASS_BUSY'
      using hint = 'Hay muchas compras en curso en este momento. Probá de nuevo en unos minutos o comprá el pase en recepción.';
  end if;

  insert into public.payment_intents (org_id, kind, description, amount_cents, currency, source, buyer_email, buyer_name, result)
  values (v_o.id, 'day_pass', left('Pase por día · ' || v_o.name, 200), v_s.day_pass_price_cents, 'ARS', 'public',
          v_email, btrim(p_name),
          jsonb_build_object('phone', left(nullif(btrim(coalesce(p_phone, '')), ''), 40),
                             'document', left(nullif(regexp_replace(coalesce(p_document, ''), '\D', '', 'g'), ''), 15)))
  returning id into v_id;
  return jsonb_build_object('intent_id', v_id, 'amount_cents', v_s.day_pass_price_cents, 'currency', 'ARS',
                            'org_name', v_o.name, 'org_slug', v_o.slug, 'days', v_s.day_pass_days);
end $$;
revoke execute on function public.payment_intent_create_day_pass(text, text, text, text, text) from public;
grant execute on function public.payment_intent_create_day_pass(text, text, text, text, text) to anon, authenticated;

-- La intención pública no tiene "created_by": la preferencia la guarda el servidor (service_role)
-- (payment_intent_set_preference ya lo permite con service_role).

-- Emisión del pase al aprobarse (lo llama payment_intent_settle)
create or replace function private.settle_day_pass(p_intent public.payment_intents) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_s    public.online_sale_settings;
  v_pass public.day_passes;
begin
  select * into v_s from public.online_sale_settings where org_id = p_intent.org_id;
  v_pass := private.issue_day_pass(
    p_intent.org_id, 'day', p_intent.buyer_name, p_intent.result ->> 'phone', p_intent.buyer_email,
    p_intent.result ->> 'document', now(), private.local_day_start(p_intent.org_id, coalesce(v_s.day_pass_days, 1)),
    coalesce(v_s.day_pass_entries, 1), p_intent.amount_cents, 'mercadopago', null, null, null);
  update public.payment_intents set day_pass_id = v_pass.id where id = p_intent.id;
  return coalesce(p_intent.result, '{}'::jsonb)
         || jsonb_build_object('pass_id', v_pass.id, 'code', v_pass.code, 'valid_until', v_pass.valid_until);
end $$;
revoke execute on function private.settle_day_pass(public.payment_intents) from public, anon, authenticated;
