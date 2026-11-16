-- Recargo por pagar con Mercado Pago.
-- El precio del plan es el de efectivo / recepción. Si el socio paga online (link, app, inscripción web,
-- débito automático) se le suma el recargo que el gimnasio configura en Pagos → Online:
--   * monto fijo (ej. $5.000), o
--   * porcentaje (redondeado hacia arriba a los $100).
-- Pase diario, buffet y tienda NO llevan recargo.

alter table public.online_sale_settings
  add column if not exists mp_surcharge_mode text not null default 'none'
    check (mp_surcharge_mode in ('none', 'fixed', 'percent')),
  add column if not exists mp_surcharge_fixed_cents bigint not null default 0 check (mp_surcharge_fixed_cents >= 0),
  add column if not exists mp_surcharge_pct numeric(5,2) not null default 0 check (mp_surcharge_pct >= 0 and mp_surcharge_pct <= 50);

-- Recargo en centavos para un importe base
create or replace function private.mp_surcharge(p_org uuid, p_base bigint)
returns bigint
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce((
    select case s.mp_surcharge_mode
             when 'fixed' then s.mp_surcharge_fixed_cents
             when 'percent' then (ceil(p_base * s.mp_surcharge_pct / 100.0 / 10000.0) * 10000)::bigint
             else 0 end
      from public.online_sale_settings s where s.org_id = p_org), 0)
$$;

-- Lo que leen la web pública y la app para mostrar los dos precios
create or replace function public.mp_surcharge_info(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce((
    select jsonb_build_object('mode', s.mp_surcharge_mode, 'fixed_cents', s.mp_surcharge_fixed_cents, 'pct', s.mp_surcharge_pct)
      from public.organizations o join public.online_sale_settings s on s.org_id = o.id
     where o.slug = lower(coalesce(p_slug, ''))),
    jsonb_build_object('mode', 'none', 'fixed_cents', 0, 'pct', 0))
$$;
revoke all on function public.mp_surcharge_info(text) from public;
grant execute on function public.mp_surcharge_info(text) to anon, authenticated;

-- Reescribe las funciones de cobro tal como están en la base, sumando el recargo.
create or replace function pg_temp.patch(p_fn regprocedure, p_from text, p_to text)
returns void language plpgsql as $$
declare v_def text; v_n int;
begin
  v_def := pg_get_functiondef(p_fn);
  v_n := (length(v_def) - length(replace(v_def, p_from, ''))) / length(p_from);
  if v_n <> 1 then raise exception '% : se esperaba 1 coincidencia y hay %', p_fn, v_n; end if;
  execute replace(v_def, p_from, p_to);
end $$;

-- App del socio + link de recepción
select pg_temp.patch('public.payment_intent_create(uuid,uuid)'::regprocedure,
  'else v_plan.price_cents end;',
  'else v_plan.price_cents end;
  v_amount := v_amount + private.mp_surcharge(v_plan.org_id, v_amount);');

-- Link de pago del profe
select pg_temp.patch('public.trainer_payment_intent_create(uuid,uuid)'::regprocedure,
  'else v_plan.price_cents end;',
  'else v_plan.price_cents end;
  v_amount := v_amount + private.mp_surcharge(v_plan.org_id, v_amount);');

-- Inscripción online
select pg_temp.patch('public.payment_intent_create_signup(text,uuid,text,text,text,text,text,date,text,text)'::regprocedure,
  '  insert into public.payment_intents (org_id, kind, plan_id, description',
  '  v_amount := v_amount + private.mp_surcharge(v_o.id, v_amount);

  insert into public.payment_intents (org_id, kind, plan_id, description');

-- Débito automático
select pg_temp.patch('public.subscription_create(uuid,uuid,text)'::regprocedure,
  '  v_id      uuid;
begin',
  '  v_id      uuid;
  v_amount  bigint;
begin');
select pg_temp.patch('public.subscription_create(uuid,uuid,text)'::regprocedure,
  '  select * into v_org from public.organizations where id = v_m.org_id;',
  '  select * into v_org from public.organizations where id = v_m.org_id;
  v_amount := v_plan.price_cents + private.mp_surcharge(v_m.org_id, v_plan.price_cents);');
select pg_temp.patch('public.subscription_create(uuid,uuid,text)'::regprocedure,
  'values (v_m.org_id, v_account, v_payer.id, v_plan.id, v_plan.price_cents, v_plan.currency,',
  'values (v_m.org_id, v_account, v_payer.id, v_plan.id, v_amount, v_plan.currency,');
select pg_temp.patch('public.subscription_create(uuid,uuid,text)'::regprocedure,
  '''amount_cents'', v_plan.price_cents,',
  '''amount_cents'', v_amount,');
