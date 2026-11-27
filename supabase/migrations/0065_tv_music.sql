-- =====================================================================
-- 0065 · Música en la TV de la sala
--
-- Administración sube MP3/M4A (Panel → Pantallas → Música). La TV los pasa en orden
-- (o aleatorio) por sus parlantes. Cualquier persona del equipo (profes, recepción,
-- administración) la maneja desde el panel: reproducir, pausar, siguiente, anterior,
-- elegir tema, volumen y aleatorio.
--   bucket `musica` (público, como la publicidad): <org_id>/<uuid>.mp3 | .m4a
--   music_tracks: la lista (orden, activo)
--   floor_settings.music: estado pedido desde el panel
--       { playing, volume 0-100, shuffle, seq, cmd: next|prev|track, track_id }
--     cada orden de cambio de tema suma 1 a seq; la TV la aplica una sola vez.
--   floor_settings.music_now: el tema que la TV está pasando (lo informa la TV)
-- La TV lee y avisa por tv_music() (solo el servidor, con la clave de la TV).
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('musica', 'musica', true, 26214400, array['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Subir / borrar: quien maneja la publicidad (org.manage), carpeta 1 = org
drop policy if exists "musica: ver" on storage.objects;
drop policy if exists "musica: subir" on storage.objects;
drop policy if exists "musica: borrar" on storage.objects;
create policy "musica: ver" on storage.objects for select to authenticated
  using (bucket_id = 'musica' and private.kiosk_file_allowed(name));
create policy "musica: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'musica' and private.kiosk_file_allowed(name));
create policy "musica: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'musica' and private.kiosk_file_allowed(name));

create table if not exists public.music_tracks (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  path       text not null check (length(path) <= 200),
  title      text not null check (length(title) between 1 and 120),
  duration_s integer check (duration_s is null or duration_s between 0 and 86400),
  sort       integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists music_tracks_org_idx on public.music_tracks (org_id, sort);

-- ¿Es del equipo de este gimnasio? (profes, recepción, administración)
create or replace function private.is_org_staff(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.my_staff_id(p_org) is not null
$$;
revoke execute on function private.is_org_staff(uuid) from public, anon;
grant execute on function private.is_org_staff(uuid) to authenticated;

alter table public.music_tracks enable row level security;
drop policy if exists music_tracks_read on public.music_tracks;
drop policy if exists music_tracks_manage on public.music_tracks;
create policy music_tracks_read on public.music_tracks for select to authenticated
  using ((select private.is_org_staff(org_id)) or (select private.has_permission(org_id, 'org.manage')));
create policy music_tracks_manage on public.music_tracks for all to authenticated
  using ((select private.has_permission(org_id, 'org.manage')))
  with check ((select private.has_permission(org_id, 'org.manage')));

alter table public.floor_settings
  add column if not exists music jsonb not null
    default '{"playing": false, "volume": 70, "shuffle": false, "seq": 0, "cmd": null, "track_id": null}'::jsonb,
  add column if not exists music_now uuid;

-- Panel: estado de la música + tema que suena
create or replace function public.music_status(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  fs public.floor_settings;
  v_title text;
begin
  if not (private.is_org_staff(p_org) or private.has_permission(p_org, 'org.manage')) then raise exception 'FORBIDDEN'; end if;
  select * into fs from public.floor_settings where org_id = p_org;
  if fs.music_now is not null then
    select title into v_title from public.music_tracks where id = fs.music_now and org_id = p_org;
  end if;
  return coalesce(fs.music, '{"playing": false, "volume": 70, "shuffle": false, "seq": 0}'::jsonb)
    || jsonb_build_object('now_id', fs.music_now, 'now_title', v_title, 'tv_linked', fs.tv_token_hash is not null,
                          'tv_seen_at', fs.tv_seen_at);
end $$;
revoke all on function public.music_status(uuid) from public, anon;
grant execute on function public.music_status(uuid) to authenticated;

-- Panel: órdenes  play | pause | next | prev | track (p_value = id) | volume (0-100) | shuffle (true/false)
create or replace function public.music_control(p_org uuid, p_action text, p_value text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m jsonb;
  v_track uuid;
begin
  if not (private.is_org_staff(p_org) or private.has_permission(p_org, 'org.manage')) then raise exception 'FORBIDDEN'; end if;
  insert into public.floor_settings (org_id) values (p_org) on conflict (org_id) do nothing;
  select music into m from public.floor_settings where org_id = p_org for update;
  m := coalesce(m, '{}'::jsonb);
  if p_action = 'play' then
    m := m || jsonb_build_object('playing', true);
  elsif p_action = 'pause' then
    m := m || jsonb_build_object('playing', false);
  elsif p_action in ('next', 'prev') then
    m := m || jsonb_build_object('playing', true, 'cmd', p_action, 'track_id', null,
                                 'seq', coalesce((m ->> 'seq')::int, 0) + 1);
  elsif p_action = 'track' then
    begin
      v_track := p_value::uuid;
    exception when others then
      raise exception 'TRACK_NOT_FOUND';
    end;
    if not exists (select 1 from public.music_tracks where id = v_track and org_id = p_org) then
      raise exception 'TRACK_NOT_FOUND';
    end if;
    m := m || jsonb_build_object('playing', true, 'cmd', 'track', 'track_id', v_track,
                                 'seq', coalesce((m ->> 'seq')::int, 0) + 1);
  elsif p_action = 'volume' then
    m := m || jsonb_build_object('volume', greatest(0, least(100, coalesce(nullif(p_value, '')::int, 70))));
  elsif p_action = 'shuffle' then
    m := m || jsonb_build_object('shuffle', p_value = 'true');
  else
    raise exception 'BAD_ACTION';
  end if;
  update public.floor_settings set music = m, updated_at = now() where org_id = p_org;
  return m;
end $$;
revoke all on function public.music_control(uuid, text, text) from public, anon;
grant execute on function public.music_control(uuid, text, text) to authenticated;

-- TV: lee el estado, informa el tema que suena y recibe la lista solo cuando cambió (p_list_v)
create or replace function public.tv_music(p_token text, p_list_v text, p_now uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  fs public.floor_settings;
  v_list_v text;
  v_tracks jsonb;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{48}$' then return jsonb_build_object('status', 'unauthorized'); end if;
  select * into fs from public.floor_settings where tv_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found then return jsonb_build_object('status', 'unauthorized'); end if;
  if p_now is distinct from fs.music_now
     and (p_now is null or exists (select 1 from public.music_tracks where id = p_now and org_id = fs.org_id)) then
    update public.floor_settings set music_now = p_now where org_id = fs.org_id;
  end if;
  select md5(coalesce(string_agg(id::text || ':' || title, ',' order by sort, created_at), ''))
    into v_list_v from public.music_tracks where org_id = fs.org_id and active;
  if p_list_v is distinct from v_list_v then
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'path', path, 'title', title) order by sort, created_at), '[]'::jsonb)
      into v_tracks from public.music_tracks where org_id = fs.org_id and active;
  end if;
  return jsonb_build_object('status', 'ok', 'music', fs.music, 'list_v', v_list_v, 'tracks', v_tracks);
end $$;
revoke all on function public.tv_music(text, text, uuid) from public, anon, authenticated;
grant execute on function public.tv_music(text, text, uuid) to service_role;
