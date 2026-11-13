-- Vender productos del mostrador sin ver la caja ni los pagos.
-- Permiso nuevo "sales.write": solo la pantalla Vender (registrar una venta).
-- Recepción y administradores lo tienen siempre. Los profes NO: el administrador
-- se lo habilita a cada uno desde Panel → Equipo (excepción en staff_permission_overrides).
insert into public.permissions (code, description)
values ('sales.write', 'Vender productos en el mostrador (sin ver la caja ni los pagos)')
on conflict (code) do nothing;

insert into public.role_permissions (role, permission)
select r::public.staff_role, 'sales.write' from unnest(array['admin', 'staff']) r
on conflict do nothing;

-- Catálogo: quien vende tiene que ver los productos (el costo está en otra tabla, solo admin)
drop policy if exists products_select on public.products;
create policy products_select on public.products for select using (
  (select private.has_permission(products.org_id, 'billing.read'))
  or (select private.has_permission(products.org_id, 'billing.write'))
  or (select private.has_permission(products.org_id, 'sales.write'))
);

create or replace function public.record_sale(p_org uuid, p_items jsonb, p_method payment_provider, p_member uuid default null, p_note text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_sale  uuid;
  v_total bigint := 0;
  v_it    record;
  v_p     public.products;
  v_item  bigint;
begin
  if not (private.has_permission(p_org, 'billing.write') or private.has_permission(p_org, 'sales.write')) then
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
end $function$;
