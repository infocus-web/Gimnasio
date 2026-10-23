-- PEGAR TODO EN: Supabase > proyecto fdncorjgytskdjnlwqpe > SQL Editor > Run
begin;
-- =====================================================================
-- 0032 · Foto de los productos del mostrador
--
-- Bucket `productos` (PÚBLICO: son fotos de bebidas y suplementos, nada privado):
--   <org_id>/<product_id>-<n>.jpg   (JPEG cuadrado de 400×400, ≈30 KB)
--   ver:     cualquiera con el link (así se muestran sin links firmados)
--   subir / reemplazar / borrar: staff con billing.write de esa org
-- products.image_path guarda la ruta dentro del bucket (null = sin foto).
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('productos', 'productos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

alter table public.products add column if not exists image_path text
  check (image_path is null or length(image_path) <= 200);

-- ¿Puede editar productos de la org dueña de la carpeta? (la carpeta 1 es la org)
create or replace function private.product_file_allowed(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_parts text[] := storage.foldername(p_name);
begin
  if coalesce(array_length(v_parts, 1), 0) < 1 or v_parts[1] !~ '^[0-9a-f-]{36}$' then return false; end if;
  return private.has_permission(v_parts[1]::uuid, 'billing.write');
end $$;
revoke execute on function private.product_file_allowed(text) from public, anon;
grant execute on function private.product_file_allowed(text) to authenticated;

-- (el "ver" por API hace falta para reemplazar y borrar; el público entra por el link público)
drop policy if exists "productos: ver" on storage.objects;
drop policy if exists "productos: subir" on storage.objects;
drop policy if exists "productos: reemplazar" on storage.objects;
drop policy if exists "productos: borrar" on storage.objects;
create policy "productos: ver" on storage.objects for select to authenticated
  using (bucket_id = 'productos' and private.product_file_allowed(name));
create policy "productos: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'productos' and private.product_file_allowed(name));
create policy "productos: reemplazar" on storage.objects for update to authenticated
  using (bucket_id = 'productos' and private.product_file_allowed(name));
create policy "productos: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'productos' and private.product_file_allowed(name));

-- =====================================================================
-- 0033 · Costo y ganancia de los productos del mostrador (SOLO administradores)
--
-- Quién: dueño o administrador del gimnasio (con su segundo factor, como el resto
-- de lo sensible). NO alcanza con un permiso suelto: recepción y profes no ven
-- costos ni ganancias, ni por pantalla ni pidiéndolos directo a la base.
--
--   product_costs     costo actual de cada producto (lo carga el admin)
--   sale_item_costs   costo de cada renglón vendido, guardado AL VENDER: si después
--                     sube el costo, las ventas viejas conservan su ganancia real
--   record_sale()     igual que antes + guarda el costo si el producto lo tiene
--   product_profit_report(org, desde, hasta)  ventas, costo y ganancia por producto
--                     (solo ventas no anuladas; fechas en la zona horaria del gimnasio)
-- Membresías y cuotas no entran: esto es solo para productos.
-- =====================================================================

-- ¿Es dueño o administrador activo de este gimnasio?
create or replace function private.is_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
     and exists (select 1 from public.staff s
                  where s.org_id = p_org and s.user_id = auth.uid() and s.active
                    and s.role in ('owner', 'admin'))
$$;
revoke execute on function private.is_org_admin(uuid) from public, anon;
grant execute on function private.is_org_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Costo actual de cada producto
-- ---------------------------------------------------------------------
create table if not exists public.product_costs (
  product_id  uuid primary key,
  org_id      uuid not null,
  cost_cents  bigint not null check (cost_cents >= 0 and cost_cents <= 100000000000),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid(),
  foreign key (product_id, org_id) references public.products (id, org_id) on delete cascade
);
create index if not exists product_costs_org_idx on public.product_costs (org_id);
drop trigger if exists product_costs_touch on public.product_costs;
create trigger product_costs_touch before update on public.product_costs
  for each row execute function public.touch_updated_at();

alter table public.product_costs enable row level security;
drop policy if exists product_costs_admin on public.product_costs;
create policy product_costs_admin on public.product_costs for all to authenticated
  using ((select private.is_org_admin(org_id)))
  with check ((select private.is_org_admin(org_id)));
revoke all on public.product_costs from anon, authenticated;
grant select, insert, update, delete on public.product_costs to authenticated;

-- ---------------------------------------------------------------------
-- Costo de cada renglón vendido (foto del costo al momento de la venta)
-- ---------------------------------------------------------------------
create table if not exists public.sale_item_costs (
  sale_item_id     bigint primary key references public.sale_items (id) on delete cascade,
  org_id           uuid not null references public.organizations (id) on delete cascade,
  unit_cost_cents  bigint not null check (unit_cost_cents >= 0)
);
create index if not exists sale_item_costs_org_idx on public.sale_item_costs (org_id);

alter table public.sale_item_costs enable row level security;
drop policy if exists sale_item_costs_admin on public.sale_item_costs;
create policy sale_item_costs_admin on public.sale_item_costs for select to authenticated
  using ((select private.is_org_admin(org_id)));
revoke all on public.sale_item_costs from anon, authenticated;
grant select on public.sale_item_costs to authenticated;   -- se escribe solo desde record_sale()

-- ---------------------------------------------------------------------
-- Vender: igual que 0030 + guarda el costo de cada renglón
-- ---------------------------------------------------------------------
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
  v_item  bigint;
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
    values (v_sale, p_org, v_p.id, v_p.name, v_p.price_cents, v_it.qty, v_p.price_cents * v_it.qty)
    returning id into v_item;
    insert into public.sale_item_costs (sale_item_id, org_id, unit_cost_cents)
    select v_item, p_org, c.cost_cents from public.product_costs c where c.product_id = v_p.id;
    v_total := v_total + v_p.price_cents * v_it.qty;
  end loop;

  update public.sales set total_cents = v_total where id = v_sale;
  return jsonb_build_object('sale_id', v_sale, 'total_cents', v_total);
end $$;
revoke execute on function public.record_sale(uuid, jsonb, public.payment_provider, uuid, text) from public, anon;
grant execute on function public.record_sale(uuid, jsonb, public.payment_provider, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Reporte: ventas, costo y ganancia por producto entre dos fechas (inclusive)
--   revenue_cents     todo lo vendido del producto
--   cost_cents        costo de lo vendido CON costo conocido
--   profit_cents      ganancia de lo vendido CON costo conocido
--   *_no_cost         lo vendido cuando el producto todavía no tenía costo cargado
-- ---------------------------------------------------------------------
create or replace function public.product_profit_report(p_org uuid, p_from date, p_to date)
returns table (
  product_id          uuid,
  name                text,
  units               bigint,
  revenue_cents       bigint,
  cost_cents          bigint,
  profit_cents        bigint,
  units_no_cost       bigint,
  revenue_no_cost     bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare v_tz text;
begin
  if not private.is_org_admin(p_org) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_RANGE'; end if;
  if p_to - p_from > 366 then raise exception 'RANGE_TOO_LONG'; end if;
  select o.timezone into v_tz from public.organizations o where o.id = p_org;

  return query
  select si.product_id,
         coalesce(max(p.name), max(si.name))                                              as name,
         sum(si.quantity)::bigint                                                          as units,
         sum(si.subtotal_cents)::bigint                                                    as revenue_cents,
         coalesce(sum(c.unit_cost_cents * si.quantity), 0)::bigint                         as cost_cents,
         coalesce(sum(si.subtotal_cents - c.unit_cost_cents * si.quantity)
                    filter (where c.sale_item_id is not null), 0)::bigint                  as profit_cents,
         coalesce(sum(si.quantity) filter (where c.sale_item_id is null), 0)::bigint       as units_no_cost,
         coalesce(sum(si.subtotal_cents) filter (where c.sale_item_id is null), 0)::bigint as revenue_no_cost
    from public.sales s
    join public.sale_items si on si.sale_id = s.id
    left join public.sale_item_costs c on c.sale_item_id = si.id
    left join public.products p on p.id = si.product_id
   where s.org_id = p_org
     and s.status = 'completed'
     and s.sold_at >= (p_from::timestamp at time zone v_tz)
     and s.sold_at <  ((p_to + 1)::timestamp at time zone v_tz)
   group by si.product_id, case when si.product_id is null then si.name end
   order by 6 desc, 4 desc;
end $$;
revoke execute on function public.product_profit_report(uuid, date, date) from public, anon;
grant execute on function public.product_profit_report(uuid, date, date) to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261022230000','0032_product_images'), ('20261022230100','0033_product_costs') on conflict do nothing;
commit;
