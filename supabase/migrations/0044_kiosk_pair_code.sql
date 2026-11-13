-- Vincular la tablet del molinete escribiendo un código de 6 números (además del link / QR).
-- El panel genera el código (vale 15 minutos, un solo uso); la tablet lo canjea por su clave.
-- Contra adivinar: 5 intentos fallidos en el gimnasio anulan los códigos vigentes.

create or replace function public.access_device_kiosk_code(p_device uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  d      public.access_devices;
  v_code text := lpad((floor(random() * 1000000))::int::text, 6, '0');
begin
  d := private.access_device_for_admin(p_device);
  update public.access_devices
     set info = (info - 'kiosk_pair_fails') || jsonb_build_object(
           'kiosk_pair_hash', encode(extensions.digest(d.id::text || ':' || v_code, 'sha256'), 'hex'),
           'kiosk_pair_until', now() + interval '15 minutes')
   where id = d.id;
  return v_code;
end $$;

revoke all on function public.access_device_kiosk_code(uuid) from public, anon;
grant execute on function public.access_device_kiosk_code(uuid) to authenticated;

-- Lo llama el servidor (clave secreta) desde /api/access/turnstile/pair
create or replace function public.kiosk_pair_with_code(p_slug text, p_code text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org   uuid;
  d       public.access_devices;
  v_code  text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  select id into v_org from public.organizations where slug = p_slug;
  if v_org is null or length(v_code) <> 6 then return jsonb_build_object('status', 'invalid'); end if;

  select * into d from public.access_devices
   where org_id = v_org and active
     and (info ->> 'kiosk_pair_until')::timestamptz > now()
     and info ->> 'kiosk_pair_hash' = encode(extensions.digest(id::text || ':' || v_code, 'sha256'), 'hex')
   for update;

  if not found then
    -- intento fallido: suma en los códigos vigentes del gimnasio; al 5º se anulan
    update public.access_devices
       set info = case when coalesce((info ->> 'kiosk_pair_fails')::int, 0) + 1 >= 5
                       then info - 'kiosk_pair_hash' - 'kiosk_pair_until' - 'kiosk_pair_fails'
                       else info || jsonb_build_object('kiosk_pair_fails', coalesce((info ->> 'kiosk_pair_fails')::int, 0) + 1) end
     where org_id = v_org and info ? 'kiosk_pair_hash';
    return jsonb_build_object('status', 'invalid');
  end if;

  update public.access_devices
     set kiosk_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
         info = (info - 'kiosk_pair_hash' - 'kiosk_pair_until' - 'kiosk_pair_fails') || jsonb_build_object('kiosk_token_at', now())
   where id = d.id;
  return jsonb_build_object('status', 'ok', 'token', v_token);
end $$;

revoke all on function public.kiosk_pair_with_code(text, text) from public, anon, authenticated;
grant execute on function public.kiosk_pair_with_code(text, text) to service_role;
