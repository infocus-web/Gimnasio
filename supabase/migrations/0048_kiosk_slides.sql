-- =====================================================================
-- 0048 · Publicidad de la tablet del molinete
--
-- El administrador sube desde el panel (Panel → Pantallas) las imágenes
-- que la tablet pasa mientras nadie la usa.
-- Bucket `molinete` (PÚBLICO: son publicidades del gimnasio, nada privado):
--   <org_id>/<uuid>.jpg   (JPEG de hasta 1920 px de lado, ≈300 KB)
--   subir / borrar: staff con org.manage de esa org
-- kiosk_slides: el orden y si está activa. La tablet las lee por /api/access/turnstile/slides.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('molinete', 'molinete', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.kiosk_slides (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  image_path text not null check (length(image_path) <= 200),
  sort       integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists kiosk_slides_org_idx on public.kiosk_slides (org_id, sort);

alter table public.kiosk_slides enable row level security;
drop policy if exists kiosk_slides_manage on public.kiosk_slides;
create policy kiosk_slides_manage on public.kiosk_slides for all to authenticated
  using ((select private.has_permission(org_id, 'org.manage')))
  with check ((select private.has_permission(org_id, 'org.manage')));

-- ¿Puede manejar la publicidad de la org dueña de la carpeta? (la carpeta 1 es la org)
create or replace function private.kiosk_file_allowed(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_parts text[] := storage.foldername(p_name);
begin
  if coalesce(array_length(v_parts, 1), 0) < 1 or v_parts[1] !~ '^[0-9a-f-]{36}$' then return false; end if;
  return private.has_permission(v_parts[1]::uuid, 'org.manage');
end $$;

drop policy if exists "molinete: ver" on storage.objects;
drop policy if exists "molinete: subir" on storage.objects;
drop policy if exists "molinete: borrar" on storage.objects;
create policy "molinete: ver" on storage.objects for select to authenticated
  using (bucket_id = 'molinete' and private.kiosk_file_allowed(name));
create policy "molinete: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'molinete' and private.kiosk_file_allowed(name));
create policy "molinete: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'molinete' and private.kiosk_file_allowed(name));
revoke execute on function private.kiosk_file_allowed(text) from public, anon;
grant execute on function private.kiosk_file_allowed(text) to authenticated;
