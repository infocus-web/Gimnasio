-- Descuento por pagar en efectivo (Evolution: 10%).
-- El precio cargado en cada plan es el de EFECTIVO. Online (Mercado Pago) se cobra precio + %,
-- redondeado hacia arriba a los $100 (ej. $60.000 → $66.000). Al socio se le muestra como
-- "10% off abonando en efectivo". Se configura en Pagos → Online → Descuento en efectivo.
alter table public.online_sale_settings drop constraint if exists online_sale_settings_mp_surcharge_mode_check;
alter table public.online_sale_settings add constraint online_sale_settings_mp_surcharge_mode_check
  check (mp_surcharge_mode in ('none', 'fixed', 'percent', 'cash_discount'));

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
             when 'cash_discount' then (ceil(p_base * s.mp_surcharge_pct / 100.0 / 10000.0) * 10000)::bigint
             else 0 end
      from public.online_sale_settings s where s.org_id = p_org), 0)
$$;

insert into public.online_sale_settings (org_id, mp_surcharge_mode, mp_surcharge_pct)
select id, 'cash_discount', 10 from public.organizations where slug = 'evolution'
on conflict (org_id) do update set mp_surcharge_mode = 'cash_discount', mp_surcharge_pct = 10;
