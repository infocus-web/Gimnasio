-- =====================================================================
-- 0039 · "Traé a un amigo/a": 3 promos (se activan y configuran en
--   Panel → Comunicación → Referidos). El amigo/a tiene que ser una persona
--   NUEVA (sin ficha en el gimnasio, por DNI y email) y se inscribe online con
--   el código del socio (link /<gym>/inscripcion?ref=CODIGO). Elige una:
--     1. cross   · Actividades cruzadas: cada uno paga su plan y además puede
--                  reservar las clases de la actividad del otro, mientras los
--                  dos tengan el plan al día. (Musculación no se cruza.)
--     2. duo     · Precio de a dos: los dos pagan su plan con X% de descuento
--                  mientras los dos tengan el plan al día.
--     3. welcome · Bienvenida: el amigo/a paga su primer mes con X% de
--                  descuento y, al pagar, los dos ganan los días del programa
--                  de referidos (0028, Comunicación → Reglas).
--   Requiere: 0028, 0030, 0038.
-- =====================================================================

create table if not exists public.friend_promo_settings (
  org_id               uuid primary key references public.organizations (id) on delete cascade,
  cross_enabled        boolean not null default true,
  duo_enabled          boolean not null default true,
  duo_discount_pct     int not null default 15 check (duo_discount_pct between 1 and 90),
  welcome_enabled      boolean not null default true,
  welcome_discount_pct int not null default 20 check (welcome_discount_pct between 0 and 100),
  updated_at           timestamptz not null default now()
);
alter table public.friend_promo_settings enable row level security;
revoke all on public.friend_promo_settings from anon, authenticated;

create table if not exists public.friend_pairs (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete cascade,
  referrer_member_id uuid not null references public.members (id) on delete cascade,
  friend_member_id   uuid not null unique references public.members (id) on delete cascade,
  kind               text not null check (kind in ('cross', 'duo', 'welcome')),
  ended_at           timestamptz,          -- recepción puede cortar la promo a mano
  created_at         timestamptz not null default now(),
  check (referrer_member_id <> friend_member_id)
);
create index if not exists friend_pairs_referrer on public.friend_pairs (referrer_member_id) where ended_at is null;
create index if not exists friend_pairs_org on public.friend_pairs (org_id, created_at desc);
alter table public.friend_pairs enable row level security;
drop policy if exists friend_pairs_select on public.friend_pairs;
create policy friend_pairs_select on public.friend_pairs for select to authenticated
  using ((select private.has_permission(org_id, 'members.read')) or (select private.has_permission(org_id, 'members.write')));
revoke all on public.friend_pairs from anon, authenticated;
grant select on public.friend_pairs to authenticated;

-- Ajustes (con valores por defecto si el gimnasio nunca los guardó)
create or replace function private.friend_promo(p_org uuid) returns public.friend_promo_settings
language sql stable security definer set search_path = '' as $$
  select coalesce((select s from public.friend_promo_settings s where s.org_id = p_org),
                  row(p_org, true, true, 15, true, 20, now())::public.friend_promo_settings)
$$;

-- ¿El socio tiene un plan al día ahora?
create or replace function private.member_plan_ok(p_member uuid, p_at timestamptz default now()) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membership_members mm
      join public.memberships ms on ms.id = mm.membership_id
      join public.billing_accounts ba on ba.id = ms.billing_account_id
     where mm.member_id = p_member and ms.status in ('active', 'trialing')
       and ms.current_period_end > p_at and not ba.delinquent)
$$;

-- Compañero/a de promo vigente de un socio (si la promo de ese tipo está activa en el gimnasio)
create or replace function private.friend_partner(p_member uuid, p_kind text) returns uuid
language sql stable security definer set search_path = '' as $$
  select case when fp.referrer_member_id = p_member then fp.friend_member_id else fp.referrer_member_id end
    from public.friend_pairs fp
   where fp.kind = p_kind and fp.ended_at is null
     and (fp.referrer_member_id = p_member or fp.friend_member_id = p_member)
   order by fp.created_at limit 1
$$;

-- 2 · Descuento "de a dos" que le corresponde hoy a un socio (0 si no aplica)
create or replace function private.duo_discount_pct(p_member uuid) returns int
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_s public.friend_promo_settings; v_partner uuid;
begin
  if p_member is null then return 0; end if;
  select org_id into v_org from public.members where id = p_member;
  v_s := private.friend_promo(v_org);
  if not v_s.duo_enabled then return 0; end if;
  v_partner := private.friend_partner(p_member, 'duo');
  if v_partner is null or not private.member_plan_ok(v_partner) then return 0; end if;
  return v_s.duo_discount_pct;
end $$;

-- 1 · ¿Puede reservar este tipo de clase gracias a la actividad de su compañero/a?
create or replace function private.cross_allows(p_member uuid, p_class_type uuid, p_at timestamptz) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_partner uuid;
begin
  select org_id into v_org from public.members where id = p_member;
  if not (private.friend_promo(v_org)).cross_enabled then return false; end if;
  v_partner := private.friend_partner(p_member, 'cross');
  if v_partner is null then return false; end if;
  return exists (
    select 1 from public.membership_members mm
      join public.memberships ms on ms.id = mm.membership_id
      join public.billing_accounts ba on ba.id = ms.billing_account_id
      join public.plan_class_types pct on pct.plan_id = ms.plan_id and pct.class_type_id = p_class_type
     where mm.member_id = v_partner and ms.status in ('active', 'trialing')
       and ms.current_period_end > greatest(p_at, now()) and not ba.delinquent);
end $$;

revoke execute on function private.friend_promo(uuid), private.member_plan_ok(uuid, timestamptz), private.friend_partner(uuid, text),
                           private.duo_discount_pct(uuid), private.cross_allows(uuid, uuid, timestamptz) from public, anon, authenticated;

-- Reservas: además de lo que permite su plan, la actividad del compañero/a (promo 1). Resto idéntico a 0006.
create or replace function private.resolve_membership_for_class(p_member uuid, p_org uuid, p_class_type uuid, p_at timestamp with time zone, p_tz text)
 returns public.memberships
 language plpgsql stable security definer set search_path = ''
as $function$
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
    if p_at >= r.current_period_end and not (r.kind = 'recurring' and not r.cancel_at_period_end) then
      v_reason := 'MEMBERSHIP_EXPIRES_BEFORE_CLASS'; continue;
    end if;
    if p_at < r.current_period_start then
      continue;
    end if;
    if p_at > now() + make_interval(days => r.booking_window_days) then
      v_reason := 'OUTSIDE_BOOKING_WINDOW'; continue;
    end if;
    if r.restricted and not r.allows_type and not private.cross_allows(p_member, p_class_type, p_at) then
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
end $function$;

-- Código de un socio para la inscripción online: quién recomienda y qué promos hay (sin datos sensibles)
create or replace function public.public_referral_lookup(p_slug text, p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_o    public.organizations;
  v_ref  public.members;
  v_s    public.friend_promo_settings;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_days int;
begin
  select * into v_o from public.organizations where slug = lower(coalesce(p_slug, ''));
  if not found or v_code = '' then return jsonb_build_object('valid', false); end if;
  select m.* into v_ref from public.member_referral_codes c join public.members m on m.id = c.member_id
   where c.org_id = v_o.id and c.code = v_code and m.status <> 'archived';
  if not found or not private.member_plan_ok(v_ref.id) then return jsonb_build_object('valid', false); end if;
  v_s := private.friend_promo(v_o.id);
  select coalesce(referral_reward_days, 15) into v_days from public.engagement_settings where org_id = v_o.id;
  return jsonb_build_object(
    'valid', true,
    'code', v_code,
    'referrer', private.short_name(v_ref.first_name, v_ref.last_name),
    -- actividades del plan del socio (para explicar la promo cruzada)
    'referrer_activities', coalesce((select jsonb_agg(distinct ct.name)
        from public.membership_members mm join public.memberships ms on ms.id = mm.membership_id
        join public.plan_class_types pct on pct.plan_id = ms.plan_id join public.class_types ct on ct.id = pct.class_type_id
       where mm.member_id = v_ref.id and ms.status in ('active', 'trialing') and ct.name <> 'Musculación'), '[]'::jsonb),
    'promos', jsonb_build_object(
      'cross', v_s.cross_enabled,
      'duo', case when v_s.duo_enabled then v_s.duo_discount_pct end,
      'welcome', case when v_s.welcome_enabled then jsonb_build_object('pct', v_s.welcome_discount_pct, 'days', coalesce(v_days, 15)) end));
end $$;
revoke execute on function public.public_referral_lookup(text, text) from public;
grant execute on function public.public_referral_lookup(text, text) to anon, authenticated;

-- Inscripción online (0038) + código de amigo/a y promo elegida
drop function if exists public.payment_intent_create_signup(text, uuid, text, text, text, text, text, date);
create or replace function public.payment_intent_create_signup(
  p_slug text, p_plan uuid, p_first_name text, p_last_name text, p_email text,
  p_phone text default null, p_document text default null, p_birth_date date default null,
  p_ref_code text default null, p_promo text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_o      public.organizations;
  v_plan   public.membership_plans;
  v_id     uuid;
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_doc    text := nullif(regexp_replace(coalesce(p_document, ''), '\D', '', 'g'), '');
  v_m      public.members;
  v_s      public.friend_promo_settings;
  v_ref    public.members;
  v_code   text := nullif(upper(regexp_replace(coalesce(p_ref_code, ''), '[^A-Za-z0-9]', '', 'g')), '');
  v_pct    int := 0;
  v_amount bigint;
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

  select m.* into v_m from public.members m
   where m.org_id = v_o.id and m.status <> 'archived' and (m.document_id = v_doc or lower(m.email) = v_email)
   order by (m.document_id = v_doc) desc limit 1;
  if found and exists (select 1 from public.memberships ms
                        where ms.billing_account_id = v_m.billing_account_id
                          and ms.status in ('active', 'trialing', 'past_due', 'paused')) then
    raise exception 'ALREADY_MEMBER';
  end if;

  v_amount := v_plan.price_cents;
  if v_code is not null then
    if p_promo not in ('cross', 'duo', 'welcome') then raise exception 'PROMO_REQUIRED'; end if;
    select m.* into v_ref from public.member_referral_codes c join public.members m on m.id = c.member_id
     where c.org_id = v_o.id and c.code = v_code and m.status <> 'archived';
    if not found or not private.member_plan_ok(v_ref.id) then raise exception 'REFERRAL_CODE_NOT_FOUND'; end if;
    -- El amigo/a tiene que ser nuevo: ninguna ficha (ni de ex socio) con ese DNI o email
    if exists (select 1 from public.members m where m.org_id = v_o.id and (m.document_id = v_doc or lower(m.email) = v_email)) then
      raise exception 'FRIEND_NOT_NEW';
    end if;
    v_s := private.friend_promo(v_o.id);
    if (p_promo = 'cross' and not v_s.cross_enabled) or (p_promo = 'duo' and not v_s.duo_enabled)
       or (p_promo = 'welcome' and not v_s.welcome_enabled) then
      raise exception 'PROMO_NOT_AVAILABLE';
    end if;
    v_pct := case p_promo when 'duo' then v_s.duo_discount_pct when 'welcome' then v_s.welcome_discount_pct else 0 end;
    v_amount := round(v_plan.price_cents * (100 - v_pct) / 100.0)::bigint;
    if v_amount <= 0 then v_amount := 1; end if;   -- MP no cobra $0
  end if;

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
  values (v_o.id, 'signup', v_plan.id,
          left('Inscripción · ' || v_plan.name || case when v_pct > 0 then ' (-' || v_pct || '%)' else '' end || ' · ' || v_o.name, 200),
          v_amount, v_plan.currency, 'public', v_email,
          left(btrim(p_first_name) || ' ' || btrim(p_last_name), 120),
          jsonb_build_object('first_name', left(btrim(p_first_name), 60), 'last_name', left(btrim(p_last_name), 60),
                             'phone', left(btrim(p_phone), 40), 'document', v_doc, 'birth_date', p_birth_date)
          || case when v_code is not null
                  then jsonb_build_object('ref_code', v_code, 'referrer_id', v_ref.id, 'promo', p_promo, 'discount_pct', v_pct,
                                          'list_price_cents', v_plan.price_cents)
                  else '{}'::jsonb end)
  returning id into v_id;
  return jsonb_build_object('intent_id', v_id, 'amount_cents', v_amount, 'currency', v_plan.currency, 'discount_pct', v_pct,
                            'plan_name', v_plan.name, 'org_name', v_o.name, 'org_slug', v_o.slug);
end $$;
revoke execute on function public.payment_intent_create_signup(text, uuid, text, text, text, text, text, date, text, text) from public;
grant execute on function public.payment_intent_create_signup(text, uuid, text, text, text, text, text, date, text, text) to anon, authenticated;

-- Alta al aprobarse el pago (0038) + promo del amigo/a
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
  v_ref    uuid := nullif(r ->> 'referrer_id', '')::uuid;
  v_promo  text := r ->> 'promo';
  v_rid    uuid;
begin
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
                                       'Inscripción online · MP ' || p_mp_payment_id
                                       || case when v_promo is not null then ' · promo amigo/a (' || v_promo || ')' else '' end,
                                       true, p_mp_payment_id, false);

  select billing_account_id into v_acc from public.members where id = v_m.id;
  update public.payment_intents set member_id = v_m.id, billing_account_id = v_acc where id = p_intent.id;

  -- Promo "Traé a un amigo/a" (solo si la ficha es nueva: así no se puede usar dos veces)
  if v_ref is not null and v_new and v_ref <> v_m.id then
    insert into public.friend_pairs (org_id, referrer_member_id, friend_member_id, kind)
    values (p_intent.org_id, v_ref, v_m.id, v_promo)
    on conflict (friend_member_id) do nothing;
    if v_promo = 'welcome' and not exists (select 1 from public.referrals where referred_member_id = v_m.id) then
      insert into public.referrals (org_id, referrer_member_id, referred_member_id, code, created_by)
      values (p_intent.org_id, v_ref, v_m.id, coalesce(r ->> 'ref_code', 'WEB'), null)
      returning id into v_rid;
      perform private.referral_reward(v_rid);   -- ya pagó: los dos suman sus días
    end if;
    insert into public.domain_events (org_id, type, member_id, payload)
    values (p_intent.org_id, 'member.friend_promo', v_m.id,
            jsonb_build_object('referrer_id', v_ref, 'promo', v_promo, 'intent_id', p_intent.id));
  end if;

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

-- Panel: ver / guardar las promos y cortar una pareja
create or replace function public.friend_promo_admin(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_s public.friend_promo_settings;
begin
  if not private.engagement_can_manage(p_org) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  v_s := private.friend_promo(p_org);
  return jsonb_build_object(
    'settings', jsonb_build_object('cross_enabled', v_s.cross_enabled, 'duo_enabled', v_s.duo_enabled,
                                   'duo_discount_pct', v_s.duo_discount_pct, 'welcome_enabled', v_s.welcome_enabled,
                                   'welcome_discount_pct', v_s.welcome_discount_pct),
    'pairs', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select fp.id, fp.kind, fp.created_at, fp.ended_at,
               fp.referrer_member_id as referrer_id, btrim(a.first_name || ' ' || a.last_name) as referrer,
               fp.friend_member_id as friend_id, btrim(b.first_name || ' ' || b.last_name) as friend,
               fp.ended_at is null and private.member_plan_ok(a.id) and private.member_plan_ok(b.id) as active
          from public.friend_pairs fp
          join public.members a on a.id = fp.referrer_member_id
          join public.members b on b.id = fp.friend_member_id
         where fp.org_id = p_org
         order by fp.created_at desc limit 100) x), '[]'::jsonb));
end $$;
revoke execute on function public.friend_promo_admin(uuid) from public, anon;
grant execute on function public.friend_promo_admin(uuid) to authenticated;

create or replace function public.friend_promo_save(p_org uuid, p_cross boolean, p_duo boolean, p_duo_pct int,
                                                    p_welcome boolean, p_welcome_pct int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.engagement_can_manage(p_org) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_duo_pct not between 1 and 90 or p_welcome_pct not between 0 and 100 then raise exception 'RULES_OUT_OF_RANGE'; end if;
  insert into public.friend_promo_settings (org_id, cross_enabled, duo_enabled, duo_discount_pct, welcome_enabled, welcome_discount_pct)
  values (p_org, coalesce(p_cross, false), coalesce(p_duo, false), p_duo_pct, coalesce(p_welcome, false), p_welcome_pct)
  on conflict (org_id) do update
     set cross_enabled = excluded.cross_enabled, duo_enabled = excluded.duo_enabled, duo_discount_pct = excluded.duo_discount_pct,
         welcome_enabled = excluded.welcome_enabled, welcome_discount_pct = excluded.welcome_discount_pct, updated_at = now();
end $$;
revoke execute on function public.friend_promo_save(uuid, boolean, boolean, int, boolean, int) from public, anon;
grant execute on function public.friend_promo_save(uuid, boolean, boolean, int, boolean, int) to authenticated;

create or replace function public.friend_pair_end(p_pair uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select org_id into v_org from public.friend_pairs where id = p_pair;
  if v_org is null or not private.engagement_can_manage(v_org) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update public.friend_pairs set ended_at = now() where id = p_pair and ended_at is null;
end $$;
revoke execute on function public.friend_pair_end(uuid) from public, anon;
grant execute on function public.friend_pair_end(uuid) to authenticated;

-- Pagos online del socio (0030) con el descuento "de a dos". Resto idéntico.
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
  v_pct     int;
  v_amount  bigint;
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
  v_pct := private.duo_discount_pct(v_payer.id);
  v_amount := case when v_pct > 0 then round(v_plan.price_cents * (100 - v_pct) / 100.0)::bigint else v_plan.price_cents end;

  select * into v_org from public.organizations where id = v_m.org_id;

  insert into public.payment_intents (org_id, kind, billing_account_id, member_id, plan_id, description, amount_cents,
                                      currency, source, buyer_email, buyer_name)
  values (v_m.org_id, 'membership', v_account, v_payer.id, v_plan.id,
          left(v_plan.name || case when v_pct > 0 then ' (promo de a dos -' || v_pct || '%)' else '' end || ' · ' || v_org.name, 200),
          v_amount, v_plan.currency, case when v_staff and v_m.user_id is distinct from auth.uid() then 'admin_link' else 'member_app' end,
          v_payer.email, trim(v_payer.first_name || ' ' || v_payer.last_name))
  returning id into v_id;

  return jsonb_build_object(
    'intent_id', v_id, 'amount_cents', v_amount, 'discount_pct', v_pct, 'currency', v_plan.currency,
    'plan_id', v_plan.id, 'plan_name', v_plan.name, 'org_name', v_org.name, 'org_slug', v_org.slug,
    'payer_id', v_payer.id, 'payer_first_name', v_payer.first_name, 'payer_last_name', v_payer.last_name,
    'payer_email', v_payer.email, 'payer_phone', v_payer.phone);
end $$;
revoke execute on function public.payment_intent_create(uuid, uuid) from public, anon;
grant execute on function public.payment_intent_create(uuid, uuid) to authenticated;

create or replace function public.member_payment_options(p_member uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_pct    int;
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
  v_pct := private.duo_discount_pct(coalesce(v_payer, v_m.id));
  return jsonb_build_object(
    'discount_pct', v_pct,
    'is_payer', v_payer is null or v_payer = v_m.id,
    'current', case when v_cur.plan_id is null then null else jsonb_build_object(
      'plan_id', v_cur.plan_id, 'name', v_cur.name,
      'price_cents', round(v_cur.price_cents * (100 - v_pct) / 100.0)::bigint, 'list_price_cents', v_cur.price_cents, 'currency', v_cur.currency,
      'status', v_cur.status, 'period_end', v_cur.current_period_end) end,
    'plans', coalesce((select jsonb_agg(jsonb_build_object('plan_id', p.id, 'name', p.name, 'description', p.description,
                                                         'price_cents', round(p.price_cents * (100 - v_pct) / 100.0)::bigint,
                                                         'list_price_cents', p.price_cents, 'currency', p.currency)
                                        order by p.sort, p.price_cents)
                         from public.membership_plans p
                        where p.org_id = v_m.org_id and p.active and p.price_cents > 0
                          and (p.is_public or p.id = v_cur.plan_id)), '[]'::jsonb));
end $$;
revoke execute on function public.member_payment_options(uuid) from public, anon;
grant execute on function public.member_payment_options(uuid) to authenticated;
