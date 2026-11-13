-- =====================================================================
-- 0050 · TV de la sala: vincular con código + pizarras de los profes
--
-- 1) Vincular la TV sin escribir links largos: la TV abre /<gym>/tv, muestra un código
--    de 6 números (vale 15 min) y el administrador lo escribe en Panel → Pantallas.
-- 2) Pizarras: cada profe prepara antes sus pizarras (texto de la clase, imágenes,
--    videos y temporizador). Al entrar a la clase toca "Mostrar en la TV"; desde el
--    celular maneja el temporizador; al terminar (o al sacarla) la TV vuelve a lo general.
--    Bucket `pizarras` (PÚBLICO: material de clase, nada privado): <org>/<staff>/<uuid>.<ext>
-- =====================================================================

-- ---------- 1) Vincular con código ----------
create table if not exists public.tv_pair_requests (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  code       text not null check (code ~ '^[0-9]{6}$'),
  nonce_hash text not null unique,
  token      text,
  expires_at timestamptz not null default now() + interval '15 minutes',
  created_at timestamptz not null default now()
);
create index if not exists tv_pair_requests_org_code_idx on public.tv_pair_requests (org_id, code);
alter table public.tv_pair_requests enable row level security; -- sin políticas: solo por las funciones

-- La TV pide un código (lo llama el servidor con la clave secreta)
create or replace function public.tv_pair_start(p_slug text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org   uuid;
  v_code  text;
  v_nonce text := encode(extensions.gen_random_bytes(24), 'hex');
  v_try   int := 0;
begin
  select id into v_org from public.organizations where slug = p_slug;
  if v_org is null then return jsonb_build_object('status', 'not_found'); end if;
  delete from public.tv_pair_requests where expires_at < now() - interval '1 hour';
  if (select count(*) from public.tv_pair_requests where org_id = v_org and expires_at > now()) >= 20 then
    return jsonb_build_object('status', 'busy');
  end if;
  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.tv_pair_requests where org_id = v_org and code = v_code and expires_at > now());
    v_try := v_try + 1;
    if v_try > 20 then return jsonb_build_object('status', 'busy'); end if;
  end loop;
  insert into public.tv_pair_requests (org_id, code, nonce_hash)
  values (v_org, v_code, encode(extensions.digest(v_nonce, 'sha256'), 'hex'));
  return jsonb_build_object('status', 'ok', 'code', v_code, 'nonce', v_nonce);
end $$;

-- La TV pregunta si ya la vincularon; si sí, recibe su clave (una sola vez)
create or replace function public.tv_pair_poll(p_nonce text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.tv_pair_requests;
begin
  if coalesce(p_nonce, '') !~ '^[0-9a-f]{48}$' then return jsonb_build_object('status', 'expired'); end if;
  select * into r from public.tv_pair_requests where nonce_hash = encode(extensions.digest(p_nonce, 'sha256'), 'hex');
  if not found or (r.token is null and r.expires_at < now()) then return jsonb_build_object('status', 'expired'); end if;
  if r.token is null then return jsonb_build_object('status', 'waiting'); end if;
  delete from public.tv_pair_requests where id = r.id;
  return jsonb_build_object('status', 'ok', 'token', r.token);
end $$;

-- El administrador escribe el código en el panel: la TV queda vinculada (reemplaza a la anterior)
create or replace function public.floor_tv_pair_claim(p_org uuid, p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r       public.tv_pair_requests;
  v_code  text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not private.can_manage_tv(p_org) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into r from public.tv_pair_requests
   where org_id = p_org and code = v_code and token is null and expires_at > now()
   order by created_at desc limit 1 for update;
  if not found then raise exception 'TV_CODE_INVALID'; end if;
  insert into public.floor_settings (org_id, tv_token_hash, tv_linked_at, tv_seen_at)
  values (p_org, encode(extensions.digest(v_token, 'sha256'), 'hex'), now(), null)
  on conflict (org_id) do update
     set tv_token_hash = excluded.tv_token_hash, tv_linked_at = now(), tv_seen_at = null, updated_at = now();
  update public.tv_pair_requests set token = v_token where id = r.id;
end $$;

revoke all on function public.tv_pair_start(text), public.tv_pair_poll(text) from public, anon, authenticated;
grant execute on function public.tv_pair_start(text), public.tv_pair_poll(text) to service_role;
revoke all on function public.floor_tv_pair_claim(uuid, text) from public, anon;
grant execute on function public.floor_tv_pair_claim(uuid, text) to authenticated;

-- ---------- 2) Pizarras de los profes ----------
create table if not exists public.class_boards (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  staff_id   uuid not null references public.staff (id) on delete cascade,
  title      text not null check (length(title) between 1 and 80),
  body       text check (body is null or length(body) <= 2000),
  media      jsonb not null default '[]' check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) <= 12),
  timer      jsonb check (timer is null or jsonb_typeof(timer) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists class_boards_staff_idx on public.class_boards (org_id, staff_id, updated_at desc);
alter table public.class_boards enable row level security;
drop policy if exists class_boards_own on public.class_boards;
create policy class_boards_own on public.class_boards for all to authenticated
  using (staff_id = (select private.my_staff_id(org_id)) or (select private.can_manage_tv(org_id)))
  with check (staff_id = (select private.my_staff_id(org_id)) or (select private.can_manage_tv(org_id)));

-- Lo que está en la TV ahora
alter table public.floor_settings
  add column if not exists live_board_id uuid references public.class_boards (id) on delete set null,
  add column if not exists live_until timestamptz,
  add column if not exists live_timer jsonb not null default '{"running": false, "elapsed_ms": 0}';

-- ¿Puede manejar esta pizarra? (es suya, o es administración)
create or replace function private.can_use_board(p_board uuid) returns public.class_boards
language plpgsql stable security definer set search_path = '' as $$
declare b public.class_boards;
begin
  select * into b from public.class_boards where id = p_board;
  if not found then raise exception 'BOARD_NOT_FOUND'; end if;
  if b.staff_id is distinct from private.my_staff_id(b.org_id) and not private.can_manage_tv(b.org_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return b;
end $$;
revoke execute on function private.can_use_board(uuid) from public, anon;
grant execute on function private.can_use_board(uuid) to authenticated;

-- Mostrar una pizarra en la TV durante p_minutes (reemplaza a la que hubiera)
create or replace function public.tv_board_show(p_board uuid, p_minutes int) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.class_boards := private.can_use_board(p_board);
begin
  insert into public.floor_settings (org_id, live_board_id, live_until, live_timer)
  values (b.org_id, b.id, now() + make_interval(mins => greatest(5, least(coalesce(p_minutes, 60), 240))),
          '{"running": false, "elapsed_ms": 0}')
  on conflict (org_id) do update
     set live_board_id = excluded.live_board_id, live_until = excluded.live_until,
         live_timer = excluded.live_timer, updated_at = now();
end $$;

-- Sacarla de la TV (el profe dueño o administración)
create or replace function public.tv_board_hide(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_board uuid;
begin
  select live_board_id into v_board from public.floor_settings where org_id = p_org;
  if v_board is not null then perform private.can_use_board(v_board);
  elsif private.my_staff_id(p_org) is null then raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.floor_settings set live_board_id = null, live_until = null, updated_at = now() where org_id = p_org;
end $$;

-- Temporizador de la pizarra en vivo: start | pause | reset
create or replace function public.tv_board_timer(p_org uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_board uuid;
  t       jsonb;
  v_el    bigint;
begin
  select live_board_id, live_timer into v_board, t from public.floor_settings where org_id = p_org;
  if v_board is null then raise exception 'BOARD_NOT_LIVE'; end if;
  perform private.can_use_board(v_board);
  v_el := coalesce((t ->> 'elapsed_ms')::bigint, 0);
  if p_action = 'start' and not coalesce((t ->> 'running')::boolean, false) then
    t := jsonb_build_object('running', true, 'elapsed_ms', v_el, 'started_at', now());
  elsif p_action = 'pause' and coalesce((t ->> 'running')::boolean, false) then
    t := jsonb_build_object('running', false,
           'elapsed_ms', v_el + (extract(epoch from now() - (t ->> 'started_at')::timestamptz) * 1000)::bigint);
  elsif p_action = 'reset' then
    t := jsonb_build_object('running', false, 'elapsed_ms', 0);
  end if;
  update public.floor_settings set live_timer = t, updated_at = now() where org_id = p_org;
  return t || jsonb_build_object('server_now', now());
end $$;

revoke all on function public.tv_board_show(uuid, int), public.tv_board_hide(uuid), public.tv_board_timer(uuid, text) from public, anon;
grant execute on function public.tv_board_show(uuid, int), public.tv_board_hide(uuid), public.tv_board_timer(uuid, text) to authenticated;

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
