-- =====================================================================
-- 0066 · Música: todo el equipo puede subir, ordenar y borrar temas
--
-- Antes (0065) solo administración (org.manage) subía la música. Ahora cualquier
-- persona del equipo del gimnasio (profes, recepción, administración) la maneja
-- desde su pantalla (Pizarra, Recepción, Pantallas).
-- =====================================================================

-- ¿Puede manejar la música de la org dueña de la carpeta? (carpeta 1 = org)
create or replace function private.music_file_allowed(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_parts text[] := storage.foldername(p_name);
begin
  if coalesce(array_length(v_parts, 1), 0) < 1 or v_parts[1] !~ '^[0-9a-f-]{36}$' then return false; end if;
  return private.is_org_staff(v_parts[1]::uuid) or private.has_permission(v_parts[1]::uuid, 'org.manage');
end $$;
revoke execute on function private.music_file_allowed(text) from public, anon;
grant execute on function private.music_file_allowed(text) to authenticated;

drop policy if exists "musica: ver" on storage.objects;
drop policy if exists "musica: subir" on storage.objects;
drop policy if exists "musica: borrar" on storage.objects;
create policy "musica: ver" on storage.objects for select to authenticated
  using (bucket_id = 'musica' and private.music_file_allowed(name));
create policy "musica: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'musica' and private.music_file_allowed(name));
create policy "musica: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'musica' and private.music_file_allowed(name));

drop policy if exists music_tracks_manage on public.music_tracks;
create policy music_tracks_manage on public.music_tracks for all to authenticated
  using ((select private.is_org_staff(org_id)) or (select private.has_permission(org_id, 'org.manage')))
  with check ((select private.is_org_staff(org_id)) or (select private.has_permission(org_id, 'org.manage')));
