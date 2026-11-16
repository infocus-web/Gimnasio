-- Cámaras de vigilancia en vivo (TP-Link Tapo C210 u otras con RTSP).
--
-- Cómo funciona:
--   * En la PC del gimnasio corre CamarasEvolution.exe (tools/camaras): toma la imagen de las cámaras
--     por la red local (go2rtc), la saca a internet por un túnel de Cloudflare y le avisa a la
--     plataforma cada minuto la dirección del túnel y la lista de cámaras (POST /api/cameras/agent).
--   * Delante de go2rtc hay un "portero" que solo deja pasar a quien trae un pase firmado y vigente.
--     El pase lo firma la base (camera_token) con la clave secreta del gimnasio, y solo para staff
--     con el permiso cameras.view. Sin pase no se ve nada aunque alguien conozca la dirección.
--   * La clave se genera en Panel → Configuración → Cámaras y se pega una sola vez en la PC.

insert into public.permissions (code, description)
values ('cameras.view', 'Ver las cámaras de vigilancia en vivo')
on conflict (code) do nothing;
insert into public.role_permissions (role, permission)
select 'admin', 'cameras.view'
where not exists (select 1 from public.role_permissions where role = 'admin' and permission = 'cameras.view');

create table if not exists public.camera_sites (
  org_id        uuid primary key references public.organizations(id) on delete cascade,
  tunnel_url    text,
  cameras       jsonb not null default '[]'::jsonb,   -- [{ "id": "cam1", "name": "Sala de musculación", "online": true }]
  agent_version text,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now()
);
alter table public.camera_sites enable row level security;
drop policy if exists camera_sites_select on public.camera_sites;
create policy camera_sites_select on public.camera_sites for select to authenticated
  using (private.has_permission(org_id, 'cameras.view') or private.has_permission(org_id, 'org.manage'));
grant select on public.camera_sites to authenticated;

create table if not exists private.camera_keys (
  org_id     uuid primary key references public.organizations(id) on delete cascade,
  secret     text not null unique,
  created_at timestamptz not null default now()
);

-- Genera (o regenera) la clave del programa de cámaras. Se muestra una sola vez.
create or replace function public.camera_key_create(p_org uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare v_secret text;
begin
  if not private.has_permission(p_org, 'org.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  v_secret := encode(extensions.gen_random_bytes(24), 'hex');
  insert into private.camera_keys (org_id, secret) values (p_org, v_secret)
  on conflict (org_id) do update set secret = excluded.secret, created_at = now();
  insert into public.camera_sites (org_id) values (p_org) on conflict (org_id) do nothing;
  return v_secret;
end $$;
revoke all on function public.camera_key_create(uuid) from public, anon;
grant execute on function public.camera_key_create(uuid) to authenticated;

-- Pase firmado para ver UNA cámara (vale p_minutes minutos para conectarse).
-- Formato: base64url(json).base64url(hmac_sha256(clave, base64url(json)))
create or replace function public.camera_token(p_org uuid, p_stream text, p_minutes int default 240)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_secret  text;
  v_payload text;
  v_sig     text;
begin
  if not private.has_permission(p_org, 'cameras.view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_stream !~ '^[a-z0-9_]{1,40}$' then raise exception 'BAD_STREAM'; end if;
  select secret into v_secret from private.camera_keys where org_id = p_org;
  if v_secret is null then raise exception 'NO_CAMERA_KEY'; end if;
  v_payload := rtrim(translate(replace(encode(convert_to(
                 jsonb_build_object('s', p_stream,
                                    'e', extract(epoch from now())::bigint + greatest(1, least(coalesce(p_minutes, 240), 720)) * 60)::text,
                 'utf8'), 'base64'), E'\n', ''), '+/', '-_'), '=');
  v_sig := rtrim(translate(replace(encode(extensions.hmac(v_payload, v_secret, 'sha256'), 'base64'), E'\n', ''), '+/', '-_'), '=');
  return v_payload || '.' || v_sig;
end $$;
revoke all on function public.camera_token(uuid, text, int) from public, anon;
grant execute on function public.camera_token(uuid, text, int) to authenticated;

-- Latido del programa de la PC (lo llama /api/cameras/agent con la clave secreta del servidor).
create or replace function public.camera_agent_hello(p_key text, p_url text, p_cameras jsonb, p_version text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare v_org uuid;
begin
  select org_id into v_org from private.camera_keys where secret = p_key;
  if v_org is null then return jsonb_build_object('status', 'unauthorized'); end if;
  if p_url is not null and p_url !~ '^https://[a-z0-9.-]+$' then
    return jsonb_build_object('status', 'bad_url');
  end if;
  if jsonb_typeof(coalesce(p_cameras, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_cameras, '[]'::jsonb)) > 32 then
    return jsonb_build_object('status', 'bad_cameras');
  end if;
  insert into public.camera_sites (org_id, tunnel_url, cameras, agent_version, last_seen_at)
  values (v_org, p_url, coalesce(p_cameras, '[]'::jsonb), left(p_version, 20), now())
  on conflict (org_id) do update
    set tunnel_url = excluded.tunnel_url, cameras = excluded.cameras,
        agent_version = excluded.agent_version, last_seen_at = now();
  return jsonb_build_object('status', 'ok');
end $$;
revoke all on function public.camera_agent_hello(text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.camera_agent_hello(text, text, jsonb, text) to service_role;
