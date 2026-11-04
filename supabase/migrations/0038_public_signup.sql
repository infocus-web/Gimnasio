-- =====================================================================
-- 0038 · Inscripción online desde la web (/<gym>/inscripcion)
--   La persona completa sus datos, elige un plan y paga con Mercado Pago.
--   La ficha de socio se crea SOLO cuando el pago se aprueba (no quedan fichas
--   basura de gente que no pagó). Al aprobarse:
--     · se crea el socio (o se usa el que ya tenga ese DNI/email sin plan vigente),
--     · se registra el cobro y se le activa el plan (misma lógica que un cobro manual),
--     · el servidor le manda la invitación por email para entrar a la app.
--   Requiere: 0030 (pagos MP).
-- =====================================================================

alter table public.payment_intents drop constraint if exists payment_intents_kind_check;
alter table public.payment_intents add constraint payment_intents_kind_check
  check (kind in ('membership', 'day_pass', 'signup'));

-- Planes que se pueden contratar online (públicos, activos, con precio)
create or replace function public.public_signup_plans(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'org_name', o.name,
    'slug', o.slug,
    'plans', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', p.id, 'name', p.name, 'description', p.description, 'price_cents', p.price_cents,
                         'currency', p.currency, 'billing_interval', p.billing_interval, 'interval_count', p.interval_count,
                         'kind', p.kind, 'class_credits', p.class_credits) order by p.sort, p.price_cents)
                         from public.membership_plans p
                        where p.org_id = o.id and p.active and p.is_public and p.price_cents > 0
                          and p.kind <> 'trial'), '[]'::jsonb))
    from public.organizations o where o.slug = lower(coalesce(p_slug, ''))
$$;
revoke execute on function public.public_signup_plans(text) from public;
grant execute on function public.public_signup_plans(text) to anon, authenticated;

-- Crea la intención de pago de una inscripción (sin cuenta, desde la web)
create or replace function public.payment_intent_create_signup(
  p_slug text, p_plan uuid, p_first_name text, p_last_name text, p_email text,
  p_phone text default null, p_document text default null, p_birth_date date default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_o     public.organizations;
  v_plan  public.membership_plans;
  v_id    uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_doc   text := nullif(regexp_replace(coalesce(p_document, ''), '\D', '', 'g'), '');
  v_m     public.members;
begin
  select * into v_o from public.organizations where slug = lower(coalesce(p_slug, ''));
  if not found then raise exception 'ORG_NOT_FOUND'; end if;
  select * into v_plan from public.membership_plans
   where id = p_plan and org_id = v_o.id and active and is_public and price_cents > 0 and kind <> 'trial';
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  if length(btrim(coalesce(p_first_name, ''))) not between 2 and 60 then raise exception 'FIRST_NAME_REQUIRED'; end if;
  if length(btrim(coalesce(p_last_name, ''))) not between 2 and 60 then raise exception 'LAST_NAME_REQUIRED'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200 then raise exception 'EMAIL_INVALID'; end if;
  if v_doc is null or length(v_doc) not between 6 and 10 then raise exception 'DOCUMENT_INVALID'; end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 8 then raise exception 'PHONE_INVALID'; end if;
  if p_birth_date is not null and (p_birth_date > current_date - interval '12 years' or p_birth_date < date '1920-01-01') then
    raise exception 'BIRTH_DATE_INVALID';
  end if;

  -- ¿Ya es socio? Si tiene plan vigente, que renueve desde la app (no una ficha nueva)
  select m.* into v_m from public.members m
   where m.org_id = v_o.id and m.status <> 'archived' and (m.document_id = v_doc or lower(m.email) = v_email)
   order by (m.document_id = v_doc) desc limit 1;
  if found and exists (select 1 from public.memberships ms
                        where ms.billing_account_id = v_m.billing_account_id
                          and ms.status in ('active', 'trialing', 'past_due', 'paused')) then
    raise exception 'ALREADY_MEMBER';
  end if;

  -- Frenos anti abuso (como el pase por día)
  if (select count(*) from public.payment_intents
       where org_id = v_o.id and kind = 'signup' and buyer_email = v_email and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'TOO_MANY_ATTEMPTS';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('day_pass_public:' || v_o.id::text, 0));
  if (select count(*) from public.payment_intents
       where org_id = v_o.id and source = 'public' and status in ('created', 'pending')
         and created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'SIGNUP_BUSY';
  end if;

  insert into public.payment_intents (org_id, kind, plan_id, description, amount_cents, currency, source, buyer_email, buyer_name, result)
  values (v_o.id, 'signup', v_plan.id, left('Inscripción · ' || v_plan.name || ' · ' || v_o.name, 200),
          v_plan.price_cents, v_plan.currency, 'public', v_email,
          left(btrim(p_first_name) || ' ' || btrim(p_last_name), 120),
          jsonb_build_object('first_name', left(btrim(p_first_name), 60), 'last_name', left(btrim(p_last_name), 60),
                             'phone', left(btrim(p_phone), 40), 'document', v_doc, 'birth_date', p_birth_date))
  returning id into v_id;
  return jsonb_build_object('intent_id', v_id, 'amount_cents', v_plan.price_cents, 'currency', v_plan.currency,
                            'plan_name', v_plan.name, 'org_name', v_o.name, 'org_slug', v_o.slug);
end $$;
revoke execute on function public.payment_intent_create_signup(text, uuid, text, text, text, text, text, date) from public;
grant execute on function public.payment_intent_create_signup(text, uuid, text, text, text, text, text, date) to anon, authenticated;

-- Alta del socio + cobro al aprobarse el pago (lo llama payment_intent_settle)
create or replace function private.settle_signup(p_intent public.payment_intents, p_amount_cents bigint, p_mp_payment_id text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r        jsonb := coalesce(p_intent.result, '{}'::jsonb);
  v_doc    text := r ->> 'document';
  v_email  text := lower(p_intent.buyer_email);
  v_m      public.members;
  v_new    boolean := false;
  v_res    jsonb;
  v_user   uuid;
  v_acc    uuid;
begin
  -- Si ya existe la ficha (vino antes, o recepción la cargó mientras pagaba) se usa esa
  select m.* into v_m from public.members m
   where m.org_id = p_intent.org_id and m.status <> 'archived' and (m.document_id = v_doc or lower(m.email) = v_email)
   order by (m.document_id = v_doc) desc, m.created_at limit 1;
  if not found then
    insert into public.members (org_id, first_name, last_name, email, phone, document_id, birth_date, home_location_id, tags)
    values (p_intent.org_id, r ->> 'first_name', coalesce(r ->> 'last_name', ''), v_email, r ->> 'phone', v_doc,
            nullif(r ->> 'birth_date', '')::date,
            (select id from public.locations where org_id = p_intent.org_id and active order by created_at limit 1),
            array['web'])
    returning * into v_m;
    v_new := true;
  else
    update public.members
       set email = coalesce(email, v_email), phone = coalesce(phone, r ->> 'phone'),
           document_id = coalesce(document_id, v_doc),
           birth_date = coalesce(birth_date, nullif(r ->> 'birth_date', '')::date),
           status = case when status = 'lead' then 'active'::public.member_status else status end
     where id = v_m.id
    returning * into v_m;
  end if;

  v_res := private.record_payment_core(v_m.id, p_amount_cents, 'mercadopago', p_intent.plan_id,
                                       'Inscripción online · MP ' || p_mp_payment_id, true, p_mp_payment_id, false);

  select billing_account_id into v_acc from public.members where id = v_m.id;
  update public.payment_intents set member_id = v_m.id, billing_account_id = v_acc where id = p_intent.id;

  -- Si ya tenía usuario con ese email (por ejemplo, de otro gimnasio), queda vinculado ya
  if v_m.user_id is null then
    select id into v_user from auth.users where lower(email) = v_email limit 1;
    if v_user is not null then perform private.link_user_by_email(v_user, v_email, p_intent.org_id); end if;
  end if;

  insert into public.domain_events (org_id, type, member_id, payload)
  values (p_intent.org_id, 'member.signup_online', v_m.id,
          jsonb_build_object('intent_id', p_intent.id, 'plan_id', p_intent.plan_id, 'new_member', v_new,
                             'amount_cents', p_amount_cents));

  return r || v_res || jsonb_build_object('member_id', v_m.id, 'new_member', v_new, 'email', v_email,
                                          'has_account', v_m.user_id is not null or v_user is not null);
end $$;
revoke execute on function private.settle_signup(public.payment_intents, bigint, text) from public, anon, authenticated;

-- payment_intent_settle (0030) redefinida SOLO para sumar el caso 'signup'. Resto idéntico.
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
    elsif v_i.kind = 'signup' then
      v_res := private.settle_signup(v_i, p_amount_cents, p_mp_payment_id);   -- inscripción nueva desde la web
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
