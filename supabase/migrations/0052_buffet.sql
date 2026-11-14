-- =====================================================================
-- 0052 · Buffet: publicidad, carta, menú del día y pedidos por encargo
--
-- El buffet lo maneja un concesionario (rol "buffet", 0051) con su propia cuenta del panel.
--   · Carta (buffet_items): lo que vende. "Siempre disponible" = se puede pedir cualquier día
--     (café, licuados); el resto solo los días que el vendedor lo pone en el menú.
--   · Menú del día (buffet_menu): platos/viandas de cada fecha, con precio y porciones opcionales.
--   · Pedidos (buffet_orders): el socio elige día de retiro, pide y paga online (Mercado Pago del
--     gimnasio) o al retirar. El vendedor lo marca listo y entregado.
--   · La plata online del buffet NO es del gimnasio: no se registra en payments ni en la caja.
--     Se ve en "Rendición" lo cobrado online y lo que ya se le pasó al concesionario (buffet_payouts).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Permiso
-- ---------------------------------------------------------------------
insert into public.permissions (code, description)
values ('buffet.manage', 'Manejar el buffet: carta, menú del día y pedidos')
on conflict (code) do nothing;

insert into public.role_permissions (role, permission)
select r::public.staff_role, 'buffet.manage' from unnest(array['admin', 'buffet']) r
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------
create table if not exists public.buffet_settings (
  org_id           uuid primary key references public.organizations (id) on delete cascade,
  enabled          boolean not null default false,
  name             text not null default 'Buffet' check (length(btrim(name)) between 1 and 60),
  tagline          text check (tagline is null or length(tagline) <= 120),
  description      text check (description is null or length(description) <= 600),
  cover_path       text check (cover_path is null or length(cover_path) <= 200),
  pickup_text      text check (pickup_text is null or length(pickup_text) <= 160),
  whatsapp         text check (whatsapp is null or length(whatsapp) <= 30),
  order_cutoff     time not null default '12:00',          -- pedidos para un día: hasta esta hora de ese día
  days_ahead       int not null default 6 check (days_ahead between 0 and 14),
  accept_online    boolean not null default true,
  accept_at_pickup boolean not null default true,
  updated_at       timestamptz not null default now(),
  check (accept_online or accept_at_pickup)
);

create table if not exists public.buffet_items (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  name             text not null check (length(btrim(name)) between 1 and 80),
  description      text check (description is null or length(description) <= 300),
  category         text not null default 'vianda'
                   check (category in ('vianda', 'sandwich', 'licuado', 'dulce', 'cafeteria', 'bebida', 'otro')),
  price_cents      bigint not null check (price_cents >= 0),
  image_path       text check (image_path is null or length(image_path) <= 200),
  always_available boolean not null default false,
  active           boolean not null default true,
  sort             int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, org_id)
);
create index if not exists buffet_items_org_idx on public.buffet_items (org_id, active, category, sort, name);

create table if not exists public.buffet_menu (
  org_id      uuid not null,
  menu_date   date not null,
  item_id     uuid not null,
  price_cents bigint check (price_cents is null or price_cents >= 0),   -- null = precio de la carta
  stock       int check (stock is null or stock between 0 and 10000),   -- porciones; null = sin límite
  sort        int not null default 0,
  primary key (org_id, menu_date, item_id),
  foreign key (item_id, org_id) references public.buffet_items (id, org_id) on delete cascade
);

create table if not exists public.buffet_orders (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  member_id     uuid,
  member_name   text not null,
  pickup_date   date not null,
  pickup_code   text not null check (pickup_code ~ '^[0-9]{4}$'),
  status        text not null check (status in ('pending_payment', 'confirmed', 'ready', 'delivered', 'cancelled')),
  pay_method    text not null check (pay_method in ('online', 'at_pickup')),
  total_cents   bigint not null check (total_cents > 0),
  currency      char(3) not null default 'ARS',
  note          text check (note is null or length(note) <= 200),
  intent_id     uuid,
  paid_at       timestamptz,
  paid_via      text check (paid_via is null or paid_via in ('mercadopago', 'cash', 'transfer', 'card', 'other')),
  refunded_at   timestamptz,
  ready_at      timestamptz,
  delivered_at  timestamptz,
  delivered_by  uuid,
  cancelled_at  timestamptz,
  cancelled_by  uuid,
  cancel_reason text check (cancel_reason is null or length(cancel_reason) <= 200),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, org_id),
  foreign key (member_id, org_id) references public.members (id, org_id) on delete set null (member_id)
);
create index if not exists buffet_orders_day_idx on public.buffet_orders (org_id, pickup_date, status);
create index if not exists buffet_orders_member_idx on public.buffet_orders (member_id, pickup_date desc);
create index if not exists buffet_orders_paid_idx on public.buffet_orders (org_id, paid_at) where paid_via = 'mercadopago';

create table if not exists public.buffet_order_items (
  id               bigint generated always as identity primary key,
  order_id         uuid not null,
  org_id           uuid not null,
  item_id          uuid,
  name             text not null,
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  quantity         int not null check (quantity between 1 and 20),
  subtotal_cents   bigint not null check (subtotal_cents >= 0),
  foreign key (order_id, org_id) references public.buffet_orders (id, org_id) on delete cascade,
  foreign key (item_id, org_id) references public.buffet_items (id, org_id) on delete set null (item_id)
);
create index if not exists buffet_order_items_order_idx on public.buffet_order_items (order_id);
create index if not exists buffet_order_items_item_idx on public.buffet_order_items (item_id);

-- Lo que el gimnasio ya le pasó al concesionario de lo cobrado online
create table if not exists public.buffet_payouts (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  paid_on      date not null,
  note         text check (note is null or length(note) <= 200),
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists buffet_payouts_org_idx on public.buffet_payouts (org_id, paid_on desc);

drop trigger if exists buffet_settings_touch on public.buffet_settings;
create trigger buffet_settings_touch before update on public.buffet_settings for each row execute function public.touch_updated_at();
drop trigger if exists buffet_items_touch on public.buffet_items;
create trigger buffet_items_touch before update on public.buffet_items for each row execute function public.touch_updated_at();
drop trigger if exists buffet_orders_touch on public.buffet_orders;
create trigger buffet_orders_touch before update on public.buffet_orders for each row execute function public.touch_updated_at();

-- Pago online de un pedido: misma tabla de intenciones de Mercado Pago (kind 'buffet')
alter table public.payment_intents drop constraint if exists payment_intents_kind_check;
alter table public.payment_intents add constraint payment_intents_kind_check
  check (kind in ('membership', 'day_pass', 'signup', 'buffet'));
alter table public.payment_intents add column if not exists buffet_order_id uuid
  references public.buffet_orders (id) on delete set null;
create index if not exists payment_intents_buffet_idx on public.payment_intents (buffet_order_id) where buffet_order_id is not null;

-- ---------------------------------------------------------------------
-- 3. RLS (las altas de pedidos y sus cambios van SOLO por funciones)
-- ---------------------------------------------------------------------
alter table public.buffet_settings enable row level security;
alter table public.buffet_items enable row level security;
alter table public.buffet_menu enable row level security;
alter table public.buffet_orders enable row level security;
alter table public.buffet_order_items enable row level security;
alter table public.buffet_payouts enable row level security;

drop policy if exists buffet_settings_rw on public.buffet_settings;
create policy buffet_settings_rw on public.buffet_settings for all to authenticated
  using ((select private.has_permission(org_id, 'buffet.manage')))
  with check ((select private.has_permission(org_id, 'buffet.manage')));
drop policy if exists buffet_items_rw on public.buffet_items;
create policy buffet_items_rw on public.buffet_items for all to authenticated
  using ((select private.has_permission(org_id, 'buffet.manage')))
  with check ((select private.has_permission(org_id, 'buffet.manage')));
drop policy if exists buffet_menu_rw on public.buffet_menu;
create policy buffet_menu_rw on public.buffet_menu for all to authenticated
  using ((select private.has_permission(org_id, 'buffet.manage')))
  with check ((select private.has_permission(org_id, 'buffet.manage')));

drop policy if exists buffet_orders_select on public.buffet_orders;
create policy buffet_orders_select on public.buffet_orders for select to authenticated
  using ((select private.has_permission(org_id, 'buffet.manage'))
         or member_id in (select m.id from public.members m where m.user_id = (select auth.uid())));
drop policy if exists buffet_order_items_select on public.buffet_order_items;
create policy buffet_order_items_select on public.buffet_order_items for select to authenticated
  using ((select private.has_permission(org_id, 'buffet.manage'))
         or exists (select 1 from public.buffet_orders o join public.members m on m.id = o.member_id
                     where o.id = order_id and m.user_id = (select auth.uid())));

drop policy if exists buffet_payouts_select on public.buffet_payouts;
create policy buffet_payouts_select on public.buffet_payouts for select to authenticated
  using ((select private.has_permission(org_id, 'buffet.manage')) or (select private.has_permission(org_id, 'billing.read')));
drop policy if exists buffet_payouts_insert on public.buffet_payouts;
create policy buffet_payouts_insert on public.buffet_payouts for insert to authenticated
  with check ((select private.has_permission(org_id, 'billing.write')));
drop policy if exists buffet_payouts_delete on public.buffet_payouts;
create policy buffet_payouts_delete on public.buffet_payouts for delete to authenticated
  using ((select private.has_permission(org_id, 'billing.write')));

revoke all on public.buffet_settings, public.buffet_items, public.buffet_menu, public.buffet_orders,
              public.buffet_order_items, public.buffet_payouts from anon, authenticated;
grant select, insert, update on public.buffet_settings to authenticated;
grant select, insert, update, delete on public.buffet_items, public.buffet_menu to authenticated;
grant select on public.buffet_orders, public.buffet_order_items to authenticated;
grant select, insert, delete on public.buffet_payouts to authenticated;
grant all on public.buffet_settings, public.buffet_items, public.buffet_menu, public.buffet_orders,
             public.buffet_order_items, public.buffet_payouts to service_role;

-- ---------------------------------------------------------------------
-- 4. Fotos: bucket público `buffet` → <org_id>/<item_id|portada>-<n>.jpg
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('buffet', 'buffet', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.buffet_file_allowed(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_parts text[] := storage.foldername(p_name);
begin
  if coalesce(array_length(v_parts, 1), 0) < 1 or v_parts[1] !~ '^[0-9a-f-]{36}$' then return false; end if;
  return private.has_permission(v_parts[1]::uuid, 'buffet.manage');
end $$;
revoke execute on function private.buffet_file_allowed(text) from public, anon;
grant execute on function private.buffet_file_allowed(text) to authenticated;

drop policy if exists "buffet: ver" on storage.objects;
drop policy if exists "buffet: subir" on storage.objects;
drop policy if exists "buffet: reemplazar" on storage.objects;
drop policy if exists "buffet: borrar" on storage.objects;
create policy "buffet: ver" on storage.objects for select to authenticated
  using (bucket_id = 'buffet' and private.buffet_file_allowed(name));
create policy "buffet: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'buffet' and private.buffet_file_allowed(name));
create policy "buffet: reemplazar" on storage.objects for update to authenticated
  using (bucket_id = 'buffet' and private.buffet_file_allowed(name));
create policy "buffet: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'buffet' and private.buffet_file_allowed(name));

-- ---------------------------------------------------------------------
-- 5. Disponibilidad
-- ---------------------------------------------------------------------
-- Porciones ya tomadas de un ítem para un día (los pedidos sin pagar reservan 30 minutos)
create or replace function private.buffet_taken(p_org uuid, p_date date, p_item uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(oi.quantity), 0)::int
    from public.buffet_order_items oi
    join public.buffet_orders o on o.id = oi.order_id
   where o.org_id = p_org and o.pickup_date = p_date and oi.item_id = p_item
     and (o.status in ('confirmed', 'ready', 'delivered')
          or (o.status = 'pending_payment' and o.created_at > now() - interval '30 minutes'))
$$;

-- ¿El gimnasio abre ese día? (sin horarios cargados = todos los días)
create or replace function private.buffet_day_open(p_org uuid, p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_array_length(o.opening_hours), 0) = 0
         or exists (select 1 from jsonb_array_elements(o.opening_hours) h
                     where (h ->> 'weekday')::int = extract(isodow from p_date)::int)
    from public.organizations o where o.id = p_org
$$;

-- Lo que se puede pedir un día: el menú de ese día + lo "siempre disponible" de la carta
create or replace function private.buffet_day_items(p_org uuid, p_date date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.j order by x.special desc, x.msort, x.cat, x.isort, x.name), '[]'::jsonb)
    from (
      select i.name, (bm.item_id is not null) as special, coalesce(bm.sort, 0) as msort, i.category as cat, i.sort as isort,
             jsonb_build_object(
               'item_id', i.id, 'name', i.name, 'description', i.description, 'category', i.category,
               'price_cents', coalesce(bm.price_cents, i.price_cents), 'image_path', i.image_path,
               'special', bm.item_id is not null, 'stock', bm.stock,
               'left', case when bm.stock is null then null
                            else greatest(0, bm.stock - private.buffet_taken(p_org, p_date, i.id)) end) as j
        from public.buffet_items i
        left join public.buffet_menu bm on bm.org_id = i.org_id and bm.item_id = i.id and bm.menu_date = p_date
       where i.org_id = p_org and i.active and (bm.item_id is not null or i.always_available)
    ) x
$$;

-- Carta + días con menú. Para la web pública (anónimo) y la app del socio. null = buffet apagado.
create or replace function public.buffet_public(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_o     public.organizations;
  v_s     public.buffet_settings;
  v_now   timestamp;
  v_today date;
  v_d     date;
  v_items jsonb;
  v_days  jsonb := '[]'::jsonb;
begin
  select * into v_o from public.organizations where slug = p_slug;
  if not found then return null; end if;
  select * into v_s from public.buffet_settings where org_id = v_o.id and enabled;
  if not found then return null; end if;
  v_now := now() at time zone v_o.timezone;
  v_today := v_now::date;
  for i in 0..v_s.days_ahead loop
    v_d := v_today + i;
    if private.buffet_day_open(v_o.id, v_d) then
      v_items := private.buffet_day_items(v_o.id, v_d);
      if jsonb_array_length(v_items) > 0 then
        v_days := v_days || jsonb_build_array(jsonb_build_object(
          'date', v_d, 'orderable', v_now < v_d + v_s.order_cutoff, 'items', v_items));
      end if;
    end if;
  end loop;
  return jsonb_build_object(
    'org_id', v_o.id, 'org_name', v_o.name, 'currency', v_o.currency, 'today', v_today,
    'name', v_s.name, 'tagline', v_s.tagline, 'description', v_s.description, 'cover_path', v_s.cover_path,
    'pickup_text', v_s.pickup_text, 'whatsapp', v_s.whatsapp, 'order_cutoff', to_char(v_s.order_cutoff, 'HH24:MI'),
    'accept_online', v_s.accept_online, 'accept_at_pickup', v_s.accept_at_pickup,
    'days', v_days,
    'carta', coalesce((select jsonb_agg(jsonb_build_object(
                         'item_id', i.id, 'name', i.name, 'description', i.description, 'category', i.category,
                         'price_cents', i.price_cents, 'image_path', i.image_path, 'always_available', i.always_available)
                         order by i.category, i.sort, i.name)
                         from public.buffet_items i where i.org_id = v_o.id and i.active), '[]'::jsonb));
end $$;
revoke execute on function public.buffet_public(text) from public;
grant execute on function public.buffet_public(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Pedido del socio
-- ---------------------------------------------------------------------
-- Intención de pago de Mercado Pago para un pedido (interna)
create or replace function private.buffet_new_intent(p_order public.buffet_orders, p_member public.members) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_org text; v_name text;
begin
  select o.name, coalesce(s.name, 'Buffet') into v_org, v_name
    from public.organizations o left join public.buffet_settings s on s.org_id = o.id where o.id = p_order.org_id;
  insert into public.payment_intents (org_id, kind, member_id, description, amount_cents, currency, source,
                                      buyer_email, buyer_name, buffet_order_id)
  values (p_order.org_id, 'buffet', p_member.id,
          left(v_name || ' · pedido ' || p_order.pickup_code || ' · ' || v_org, 200),
          p_order.total_cents, p_order.currency, 'member_app', p_member.email,
          trim(p_member.first_name || ' ' || p_member.last_name), p_order.id)
  returning id into v_id;
  update public.buffet_orders set intent_id = v_id where id = p_order.id;
  return v_id;
end $$;
revoke execute on function private.buffet_new_intent(public.buffet_orders, public.members) from public, anon, authenticated;

-- p_items = [{"item_id": "...", "quantity": 2}, ...] · p_pay = 'online' | 'at_pickup'
create or replace function public.buffet_place_order(p_member uuid, p_date date, p_items jsonb, p_pay text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_m      public.members;
  v_o      public.organizations;
  v_s      public.buffet_settings;
  v_now    timestamp;
  v_order  public.buffet_orders;
  v_line   record;
  v_item   public.buffet_items;
  v_menu   public.buffet_menu;
  v_price  bigint;
  v_total  bigint := 0;
  v_lines  jsonb := '[]'::jsonb;
  v_intent uuid;
begin
  select * into v_m from public.members where id = p_member and user_id = auth.uid() and status <> 'archived';
  if not found then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into v_o from public.organizations where id = v_m.org_id;
  select * into v_s from public.buffet_settings where org_id = v_o.id and enabled;
  if not found then raise exception 'BUFFET_CLOSED'; end if;

  v_now := now() at time zone v_o.timezone;
  if p_date is null or p_date < v_now::date or p_date > v_now::date + v_s.days_ahead
     or not private.buffet_day_open(v_o.id, p_date) then
    raise exception 'INVALID_DAY';
  end if;
  if v_now >= p_date + v_s.order_cutoff then
    raise exception 'ORDER_CUTOFF' using hint = to_char(v_s.order_cutoff, 'HH24:MI');
  end if;
  if p_pay is null or p_pay not in ('online', 'at_pickup')
     or (p_pay = 'online' and not v_s.accept_online) or (p_pay = 'at_pickup' and not v_s.accept_at_pickup) then
    raise exception 'PAY_METHOD_NOT_ALLOWED';
  end if;
  if (select count(*) from public.buffet_orders where member_id = v_m.id and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'TOO_MANY_ORDERS';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 15 then
    raise exception 'EMPTY_ORDER';
  end if;

  for v_line in
    select (e ->> 'item_id')::uuid as item_id, sum((e ->> 'quantity')::int)::int as qty
      from jsonb_array_elements(p_items) e
     group by 1 order by 1                       -- orden fijo: evita bloqueos cruzados
  loop
    if v_line.qty is null or v_line.qty < 1 or v_line.qty > 20 then raise exception 'INVALID_QUANTITY'; end if;
    -- Bloquea el ítem: dos pedidos a la vez no se llevan la última porción
    select * into v_item from public.buffet_items where id = v_line.item_id and org_id = v_o.id and active for update;
    if not found then raise exception 'ITEM_NOT_AVAILABLE'; end if;
    select * into v_menu from public.buffet_menu where org_id = v_o.id and menu_date = p_date and item_id = v_item.id;
    if not found then
      if not v_item.always_available then raise exception 'ITEM_NOT_AVAILABLE' using hint = v_item.name; end if;
      v_price := v_item.price_cents;
    else
      v_price := coalesce(v_menu.price_cents, v_item.price_cents);
      if v_menu.stock is not null and v_menu.stock - private.buffet_taken(v_o.id, p_date, v_item.id) < v_line.qty then
        raise exception 'OUT_OF_STOCK' using hint = v_item.name;
      end if;
    end if;
    v_total := v_total + v_price * v_line.qty;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('item_id', v_item.id, 'name', v_item.name,
                                                               'price', v_price, 'qty', v_line.qty));
  end loop;
  if v_total <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  insert into public.buffet_orders (org_id, member_id, member_name, pickup_date, pickup_code, status, pay_method,
                                    total_cents, currency, note)
  values (v_o.id, v_m.id, trim(v_m.first_name || ' ' || v_m.last_name), p_date,
          lpad(floor(random() * 10000)::int::text, 4, '0'),
          case when p_pay = 'online' then 'pending_payment' else 'confirmed' end, p_pay,
          v_total, v_o.currency, nullif(left(btrim(coalesce(p_note, '')), 200), ''))
  returning * into v_order;

  insert into public.buffet_order_items (order_id, org_id, item_id, name, unit_price_cents, quantity, subtotal_cents)
  select v_order.id, v_o.id, (l ->> 'item_id')::uuid, l ->> 'name', (l ->> 'price')::bigint, (l ->> 'qty')::int,
         (l ->> 'price')::bigint * (l ->> 'qty')::int
    from jsonb_array_elements(v_lines) l;

  if p_pay = 'online' then v_intent := private.buffet_new_intent(v_order, v_m); end if;

  return jsonb_build_object(
    'order_id', v_order.id, 'pickup_code', v_order.pickup_code, 'pickup_date', v_order.pickup_date,
    'status', v_order.status, 'total_cents', v_total, 'currency', v_o.currency, 'intent_id', v_intent,
    'title', coalesce(v_s.name, 'Buffet') || ' · pedido ' || v_order.pickup_code, 'org_name', v_o.name,
    'payer_email', v_m.email, 'payer_first_name', v_m.first_name, 'payer_last_name', v_m.last_name);
end $$;
revoke execute on function public.buffet_place_order(uuid, date, jsonb, text, text) from public, anon;
grant execute on function public.buffet_place_order(uuid, date, jsonb, text, text) to authenticated;

-- Pagar online un pedido todavía sin pagar (reintento, o el que eligió "al retirar" y ahora quiere pagar)
create or replace function public.buffet_order_pay_online(p_order uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_order public.buffet_orders; v_m public.members; v_s public.buffet_settings; v_intent uuid; v_org text;
begin
  select o.* into v_order from public.buffet_orders o join public.members m on m.id = o.member_id
   where o.id = p_order and m.user_id = auth.uid() for update of o;
  if not found then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into v_m from public.members where id = v_order.member_id;
  select * into v_s from public.buffet_settings where org_id = v_order.org_id and enabled;
  if not found then raise exception 'BUFFET_CLOSED'; end if;
  if not v_s.accept_online then raise exception 'PAY_METHOD_NOT_ALLOWED'; end if;
  if v_order.paid_at is not null then raise exception 'ALREADY_PAID'; end if;
  if v_order.status not in ('pending_payment', 'confirmed', 'ready') then raise exception 'ORDER_CLOSED'; end if;
  update public.buffet_orders set pay_method = 'online' where id = v_order.id;
  v_intent := private.buffet_new_intent(v_order, v_m);
  select name into v_org from public.organizations where id = v_order.org_id;
  return jsonb_build_object(
    'order_id', v_order.id, 'pickup_code', v_order.pickup_code, 'intent_id', v_intent,
    'total_cents', v_order.total_cents, 'currency', v_order.currency,
    'title', v_s.name || ' · pedido ' || v_order.pickup_code, 'org_name', v_org,
    'payer_email', v_m.email, 'payer_first_name', v_m.first_name, 'payer_last_name', v_m.last_name);
end $$;
revoke execute on function public.buffet_order_pay_online(uuid) from public, anon;
grant execute on function public.buffet_order_pay_online(uuid) to authenticated;

-- El socio cancela: solo sin pagar y antes del horario de corte (si ya pagó, lo habla con el buffet)
create or replace function public.buffet_cancel_my_order(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_order public.buffet_orders; v_tz text; v_cut time;
begin
  select o.* into v_order from public.buffet_orders o join public.members m on m.id = o.member_id
   where o.id = p_order and m.user_id = auth.uid() for update of o;
  if not found then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if v_order.paid_at is not null then raise exception 'PAID_CONTACT_BUFFET'; end if;
  if v_order.status not in ('pending_payment', 'confirmed') then raise exception 'ORDER_CLOSED'; end if;
  select o.timezone, s.order_cutoff into v_tz, v_cut
    from public.organizations o join public.buffet_settings s on s.org_id = o.id where o.id = v_order.org_id;
  if v_order.status = 'confirmed' and (now() at time zone v_tz) >= v_order.pickup_date + v_cut then
    raise exception 'ORDER_CUTOFF' using hint = to_char(v_cut, 'HH24:MI');
  end if;
  update public.buffet_orders
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = 'Cancelado por el socio'
   where id = v_order.id;
end $$;
revoke execute on function public.buffet_cancel_my_order(uuid) from public, anon;
grant execute on function public.buffet_cancel_my_order(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 7. El vendedor: listo / entregado (cobra si falta) / cancelar
-- ---------------------------------------------------------------------
create or replace function public.buffet_update_order(p_order uuid, p_action text, p_paid_via text default null, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_order public.buffet_orders;
begin
  select * into v_order from public.buffet_orders where id = p_order for update;
  if not found or not private.has_permission(v_order.org_id, 'buffet.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_action = 'ready' then
    if v_order.status not in ('confirmed', 'pending_payment') then raise exception 'ORDER_CLOSED'; end if;
    update public.buffet_orders set status = 'ready', ready_at = now() where id = v_order.id;
  elsif p_action = 'deliver' then
    if v_order.status not in ('confirmed', 'ready', 'pending_payment') then raise exception 'ORDER_CLOSED'; end if;
    if v_order.paid_at is null and (p_paid_via is null or p_paid_via not in ('cash', 'transfer', 'card', 'other')) then
      raise exception 'PAYMENT_REQUIRED';
    end if;
    update public.buffet_orders
       set status = 'delivered', delivered_at = now(), delivered_by = auth.uid(),
           paid_at = coalesce(paid_at, now()), paid_via = coalesce(paid_via, p_paid_via)
     where id = v_order.id;
  elsif p_action = 'undo_deliver' then
    -- Se tocó "entregado" por error (solo el mismo día)
    if v_order.status <> 'delivered' or v_order.delivered_at < now() - interval '12 hours' then raise exception 'ORDER_CLOSED'; end if;
    update public.buffet_orders
       set status = 'ready', delivered_at = null, delivered_by = null,
           paid_at = case when paid_via = 'mercadopago' then paid_at end,
           paid_via = case when paid_via = 'mercadopago' then paid_via end
     where id = v_order.id;
  elsif p_action = 'cancel' then
    if v_order.status in ('delivered', 'cancelled') then raise exception 'ORDER_CLOSED'; end if;
    update public.buffet_orders
       set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
           cancel_reason = coalesce(nullif(left(btrim(coalesce(p_reason, '')), 200), ''), 'Cancelado por el buffet')
     where id = v_order.id;
  else
    raise exception 'INVALID_ACTION';
  end if;
  return jsonb_build_object('refund_needed', p_action = 'cancel' and v_order.paid_via = 'mercadopago' and v_order.paid_at is not null);
end $$;
revoke execute on function public.buffet_update_order(uuid, text, text, text) from public, anon;
grant execute on function public.buffet_update_order(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Rendición: lo cobrado online (Mercado Pago del gimnasio) y lo ya pasado al concesionario
-- ---------------------------------------------------------------------
create or replace function public.buffet_report(p_org uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_tz text;
begin
  if not (private.has_permission(p_org, 'buffet.manage') or private.has_permission(p_org, 'billing.read')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select timezone into v_tz from public.organizations where id = p_org;
  return jsonb_build_object(
    'by_method', coalesce((select jsonb_object_agg(paid_via, total) from (
        select paid_via, sum(total_cents) as total from public.buffet_orders
         where org_id = p_org and paid_at is not null and refunded_at is null and status <> 'cancelled'
           and (paid_at at time zone v_tz)::date between p_from and p_to
         group by paid_via) t), '{}'::jsonb),
    'orders', (select count(*) from public.buffet_orders
                where org_id = p_org and status <> 'cancelled' and pickup_date between p_from and p_to),
    'delivered', (select count(*) from public.buffet_orders
                   where org_id = p_org and status = 'delivered' and pickup_date between p_from and p_to),
    'top_items', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'qty', qty, 'total_cents', total) order by qty desc)
        from (select oi.name, sum(oi.quantity) as qty, sum(oi.subtotal_cents) as total
                from public.buffet_order_items oi join public.buffet_orders o on o.id = oi.order_id
               where o.org_id = p_org and o.status <> 'cancelled' and o.pickup_date between p_from and p_to
               group by oi.name order by 2 desc limit 10) t), '[]'::jsonb),
    'online_total_all', (select coalesce(sum(total_cents), 0) from public.buffet_orders
                          where org_id = p_org and paid_via = 'mercadopago' and paid_at is not null and refunded_at is null),
    'payouts_total_all', (select coalesce(sum(amount_cents), 0) from public.buffet_payouts where org_id = p_org));
end $$;
revoke execute on function public.buffet_report(uuid, date, date) from public, anon;
grant execute on function public.buffet_report(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 9. Resultado de Mercado Pago para un pedido (lo llama payment_intent_settle)
--    Sin payments ni caja del gimnasio, y sin eventos de "pago fallido" (eso es para los planes).
-- ---------------------------------------------------------------------
create or replace function private.settle_buffet(
  p_i public.payment_intents, p_mp_payment_id text, p_mp_status text, p_status_detail text, p_amount_cents bigint, p_currency text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_new text; v_res jsonb; v_code text;
begin
  if p_mp_status = 'approved' then
    if p_i.status = 'approved' then
      if p_i.mp_payment_id = p_mp_payment_id then
        return jsonb_build_object('status', 'approved', 'duplicate', true, 'result', p_i.result);
      end if;
      insert into public.domain_events (org_id, type, member_id, payload)
      values (p_i.org_id, 'payment.review', p_i.member_id,
              jsonb_build_object('intent_id', p_i.id, 'mp_payment_id', p_mp_payment_id, 'reason', 'DUPLICATE_PAYMENT_FOR_INTENT',
                                 'amount_cents', p_amount_cents, 'buffet_order_id', p_i.buffet_order_id));
      return jsonb_build_object('status', 'review', 'reason', 'DUPLICATE_PAYMENT_FOR_INTENT');
    end if;
    -- Ya se pagó el pedido con otro link (dos intentos aprobados): a revisar, no se cobra dos veces
    if exists (select 1 from public.buffet_orders where id = p_i.buffet_order_id and paid_at is not null) then
      update public.payment_intents
         set status = 'review', mp_payment_id = p_mp_payment_id, mp_status = p_mp_status,
             mp_status_detail = left(p_status_detail, 120), settled_at = now()
       where id = p_i.id;
      insert into public.domain_events (org_id, type, member_id, payload)
      values (p_i.org_id, 'payment.review', p_i.member_id,
              jsonb_build_object('intent_id', p_i.id, 'mp_payment_id', p_mp_payment_id, 'reason', 'ORDER_ALREADY_PAID',
                                 'amount_cents', p_amount_cents, 'buffet_order_id', p_i.buffet_order_id));
      return jsonb_build_object('status', 'review', 'reason', 'ORDER_ALREADY_PAID');
    end if;
    if p_amount_cents is null or p_amount_cents < p_i.amount_cents or upper(coalesce(p_currency, '')) <> p_i.currency then
      update public.payment_intents
         set status = 'review', mp_payment_id = p_mp_payment_id, mp_status = p_mp_status,
             mp_status_detail = left(p_status_detail, 120), settled_at = now()
       where id = p_i.id;
      insert into public.domain_events (org_id, type, member_id, payload)
      values (p_i.org_id, 'payment.review', p_i.member_id,
              jsonb_build_object('intent_id', p_i.id, 'mp_payment_id', p_mp_payment_id, 'reason', 'AMOUNT_MISMATCH',
                                 'expected_cents', p_i.amount_cents, 'amount_cents', p_amount_cents));
      return jsonb_build_object('status', 'review', 'reason', 'AMOUNT_MISMATCH');
    end if;

    -- Pagó: el pedido queda confirmado (aunque lo hubiera cancelado sin pagar: si pagó, lo quiere)
    update public.buffet_orders
       set paid_at = now(), paid_via = 'mercadopago', pay_method = 'online',
           status = case when status in ('pending_payment', 'cancelled') then 'confirmed' else status end,
           cancelled_at = case when status = 'cancelled' then null else cancelled_at end,
           cancel_reason = case when status = 'cancelled' then null else cancel_reason end
     where id = p_i.buffet_order_id
    returning pickup_code into v_code;
    v_res := jsonb_build_object('buffet_order_id', p_i.buffet_order_id, 'pickup_code', v_code);
    update public.payment_intents
       set status = 'approved', mp_payment_id = p_mp_payment_id, mp_status = p_mp_status,
           mp_status_detail = left(p_status_detail, 120), result = v_res, settled_at = now()
     where id = p_i.id;
    return jsonb_build_object('status', 'approved', 'duplicate', false, 'result', v_res);
  end if;

  if p_mp_status in ('refunded', 'charged_back') then
    if p_i.status = 'approved' and p_i.mp_payment_id = p_mp_payment_id then
      update public.buffet_orders
         set refunded_at = now(),
             status = case when status = 'delivered' then status else 'cancelled' end,
             cancelled_at = case when status = 'delivered' then cancelled_at else coalesce(cancelled_at, now()) end,
             cancel_reason = case when status = 'delivered' then cancel_reason
                                  else coalesce(cancel_reason, 'Pago devuelto en Mercado Pago') end
       where id = p_i.buffet_order_id;
      update public.payment_intents
         set status = 'refunded', mp_status = p_mp_status,
             result = coalesce(result, '{}'::jsonb) || jsonb_build_object('refund', jsonb_build_object('at', now(), 'mp_status', p_mp_status))
       where id = p_i.id;
    end if;
    return jsonb_build_object('status', 'refunded');
  end if;

  if p_i.status in ('approved', 'refunded', 'review') then
    return jsonb_build_object('status', p_i.status, 'ignored', true);
  end if;
  v_new := case when p_mp_status = 'rejected' then 'rejected' when p_mp_status = 'cancelled' then 'cancelled' else 'pending' end;
  update public.payment_intents
     set status = v_new, mp_payment_id = p_mp_payment_id, mp_status = p_mp_status, mp_status_detail = left(p_status_detail, 120)
   where id = p_i.id;
  return jsonb_build_object('status', v_new);
end $$;
revoke execute on function private.settle_buffet(public.payment_intents, text, text, text, bigint, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 10. payment_intent_settle (0038) redefinida SOLO para derivar los pedidos del buffet. Resto idéntico.
-- ---------------------------------------------------------------------
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

  -- 0052: pedidos del buffet (plata del concesionario, circuito aparte)
  if v_i.kind = 'buffet' then
    return private.settle_buffet(v_i, p_mp_payment_id, p_mp_status, p_status_detail, p_amount_cents, p_currency);
  end if;

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
