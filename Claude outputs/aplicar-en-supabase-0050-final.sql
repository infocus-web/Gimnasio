-- PEGAR EN SUPABASE → SQL EDITOR → RUN: última parte de la migración 0050 (pizarras en la TV)
-- La TV pregunta (cada pocos segundos) si hay una pizarra en vivo
create or replace function public.tv_live(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  fs public.floor_settings;
  b  public.class_boards;
  v_name text;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{48}$' then return jsonb_build_object('status', 'unauthorized'); end if;
  select * into fs from public.floor_settings where tv_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found then return jsonb_build_object('status', 'unauthorized'); end if;
  if fs.live_board_id is null or fs.live_until is null or fs.live_until < now() then
    return jsonb_build_object('status', 'ok', 'live', null, 'server_now', now());
  end if;
  select * into b from public.class_boards where id = fs.live_board_id;
  select display_name into v_name from public.staff where id = b.staff_id;
  return jsonb_build_object('status', 'ok', 'server_now', now(), 'live', jsonb_build_object(
    'id', b.id, 'title', b.title, 'body', b.body, 'media', b.media, 'timer', b.timer,
    'timer_state', fs.live_timer, 'trainer', v_name, 'until', fs.live_until, 'updated_at', fs.updated_at));
end $$;
revoke all on function public.tv_live(text) from public, anon, authenticated;
grant execute on function public.tv_live(text) to service_role;

-- Archivos de las pizarras
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pizarras', 'pizarras', true, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.board_file_allowed(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_parts text[] := storage.foldername(p_name);
begin
  if coalesce(array_length(v_parts, 1), 0) < 2 or v_parts[1] !~ '^[0-9a-f-]{36}$' or v_parts[2] !~ '^[0-9a-f-]{36}$' then
    return false;
  end if;
  return v_parts[2]::uuid = private.my_staff_id(v_parts[1]::uuid) or private.can_manage_tv(v_parts[1]::uuid);
end $$;
revoke execute on function private.board_file_allowed(text) from public, anon;
grant execute on function private.board_file_allowed(text) to authenticated;

drop policy if exists "pizarras: ver" on storage.objects;
drop policy if exists "pizarras: subir" on storage.objects;
drop policy if exists "pizarras: borrar" on storage.objects;
create policy "pizarras: ver" on storage.objects for select to authenticated
  using (bucket_id = 'pizarras' and private.board_file_allowed(name));
create policy "pizarras: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'pizarras' and private.board_file_allowed(name));
create policy "pizarras: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'pizarras' and private.board_file_allowed(name));

-- Para el panel del profe: qué pizarra está en la TV ahora (cualquier persona del equipo)
create or replace function public.tv_board_live(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare fs public.floor_settings;
begin
  if private.my_staff_id(p_org) is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into fs from public.floor_settings where org_id = p_org;
  if not found or fs.live_board_id is null or fs.live_until is null or fs.live_until < now() then
    return jsonb_build_object('live', null, 'server_now', now(), 'tv_linked', coalesce(fs.tv_token_hash is not null, false));
  end if;
  return jsonb_build_object('server_now', now(), 'tv_linked', fs.tv_token_hash is not null, 'live', jsonb_build_object(
    'board_id', fs.live_board_id, 'until', fs.live_until, 'timer_state', fs.live_timer,
    'staff_id', (select staff_id from public.class_boards where id = fs.live_board_id)));
end $$;
revoke all on function public.tv_board_live(uuid) from public, anon;
grant execute on function public.tv_board_live(uuid) to authenticated;
