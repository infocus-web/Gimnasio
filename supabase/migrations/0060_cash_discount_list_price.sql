-- Cambio de modelo: el precio del plan ES la cuota (ej. $66.000) y online (Mercado Pago) se cobra eso, sin recargo.
-- El descuento en efectivo (10%) lo aplica recepción al registrar el cobro en el panel (Socio → Registrar cobro):
-- efectivo = cuota / 1,10 redondeado a los $100 (66.000 → 60.000).
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
             else 0 end   -- 'cash_discount': online paga el precio del plan tal cual
      from public.online_sale_settings s where s.org_id = p_org), 0)
$$;

-- Las cuotas pasaron a ser el precio de lista (precio en efectivo + 10%) — aplicado el 16/11/2026
update public.membership_plans p
   set price_cents = (ceil(p.price_cents * 1.10 / 10000.0) * 10000)::bigint
  from public.organizations o
 where o.id = p.org_id and o.slug = 'evolution' and p.active and p.price_cents > 0;
