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
