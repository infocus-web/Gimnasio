-- =====================================================================
-- Evolution Platform v2 · 0054 · Buffet: categoría "Desayunos y meriendas"
--   + carta de Cafetería y Desayunos y meriendas (precios de nov 2026).
--   Se cargan como "siempre disponibles". Si un producto ya existe con el
--   mismo nombre y categoría, no se duplica.
-- =====================================================================

alter table public.buffet_items drop constraint if exists buffet_items_category_check;
alter table public.buffet_items add constraint buffet_items_category_check
  check (category in ('vianda', 'sandwich', 'licuado', 'dulce', 'cafeteria', 'desayuno', 'bebida', 'otro'));

insert into public.buffet_items (org_id, name, description, category, price_cents, sort, always_available, active)
select o.id, v.name, v.description, v.category, v.price_cents, v.sort, true, true
  from public.organizations o
 cross join (values
  ('Nescafé Dolce', null, 'cafeteria', 350000, 1),
  ('Nescafé Dolce doble', null, 'cafeteria', 550000, 2),
  ('Café o cortado', null, 'cafeteria', 280000, 3),
  ('Café con crema', null, 'cafeteria', 350000, 4),
  ('Jarrito', null, 'cafeteria', 350000, 5),
  ('Jarrito con crema', null, 'cafeteria', 420000, 6),
  ('Café doble', null, 'cafeteria', 500000, 7),
  ('Café doble con crema', null, 'cafeteria', 620000, 8),
  ('Café con leche', null, 'cafeteria', 450000, 9),
  ('Capuchino', 'Con leche, crema y cacao', 'cafeteria', 500000, 10),
  ('Té a elección', null, 'cafeteria', 350000, 11),
  ('Té con limón o leche', null, 'cafeteria', 400000, 12),
  ('Vaso de leche', 'Entera o descremada', 'cafeteria', 200000, 13),
  ('Tostadas de pan integral o blanco', 'Con queso blanco, mermelada y/o manteca', 'desayuno', 350000, 1),
  ('Yogur entero o descremado', 'Con cereales, avena, frutas de estación y pasas', 'desayuno', 800000, 2),
  ('Panqueque energético', 'Con avena, huevo, miel y manteca', 'desayuno', 700000, 3),
  ('Banana', null, 'desayuno', 200000, 4),
  ('Manzana', null, 'desayuno', 250000, 5),
  ('Naranja', null, 'desayuno', 200000, 6)
 ) as v(name, description, category, price_cents, sort)
 where o.slug = 'evolution'
   and not exists (select 1 from public.buffet_items i
                    where i.org_id = o.id and lower(i.name) = lower(v.name) and i.category = v.category);
