-- =====================================================================
-- 0024 · Entrada a musculación con el QR de la app (tablet junto al molinete)
--
--   Tablet (pantalla /<gym>/molinete, vinculada al lector con una clave propia)
--     → lee el QR dinámico de la app del socio
--     → POST /api/access/turnstile → turnstile_scan():
--         valida el QR, aplica la regla de musculación, registra la entrada
--         y encola una orden "abrir" para ese lector
--     → el intermediario de la PC del gimnasio la toma en ~1 s y abre el
--       molinete con el relé del lector (la misma salida que usa la huella).
--
-- Regla de musculación: plan con sala libre vigente, cuenta sin deuda, no
-- congelado/archivado/pausado. Una reserva de clase NO abre el molinete
-- (las clases tienen acceso libre por otro lado).
-- Anti "pasar el QR": si el mismo socio entró por el molinete hace menos de
-- 3 minutos, no se vuelve a abrir (salvo la relectura inmediata del mismo QR).
-- Una orden "abrir" vieja (más de 20 s) no se ejecuta nunca, y una que no abrió no cuenta como entrada.
-- Si el molinete no tiene el intermediario conectado, el QR no se registra: pasa por recepción.
-- =====================================================================

alter table public.access_devices add column if not exists kiosk_token_hash text;
create unique index if not exists access_devices_kiosk_uidx on public.access_devices (kiosk_token_hash) where kiosk_token_hash is not null;

alter table public.access_commands drop constraint if exists access_commands_kind_check;
alter table public.access_commands add constraint access_commands_kind_check
  check (kind in ('user_put', 'user_del', 'bio_put', 'enroll', 'query', 'other', 'unlock'));
create index if not exists access_commands_unlock_idx on public.access_commands (device_id, id)
  where kind = 'unlock' and status = 'pending';

-- La cola normal (ADMS o intermediario) nunca se lleva las aperturas: van por su propio canal
create or replace function public.adms_poll(p_sn text, p_ip text, p_max_bytes int default 48000) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d      public.access_devices;
  c      record;
  v_out  jsonb := '[]'::jsonb;
  v_size int := 0;
begin
  d := private.adms_gate(p_sn, p_ip);
  if d.id is null or not d.active then return v_out; end if;
  if d.agent_token_hash is not null and current_setting('app.agent_call', true) is distinct from 'on' then
    return v_out;
  end if;
  -- Enviados hace rato sin respuesta: se reintentan (hasta 5 veces)
  update public.access_commands set status = 'pending'
   where device_id = d.id and status = 'sent' and kind <> 'unlock'
     and sent_at < now() - interval '5 minutes' and attempts < 5;
  update public.access_commands set status = 'error', return_code = -9999, done_at = now()
   where device_id = d.id and status = 'sent' and kind <> 'unlock'
     and sent_at < now() - interval '5 minutes' and attempts >= 5;

  for c in select id, command from public.access_commands
            where device_id = d.id and status = 'pending' and kind <> 'unlock'
            order by id limit 200 for update skip locked loop
    exit when v_size > 0 and v_size + length(c.command) > p_max_bytes;
    v_out := v_out || jsonb_build_object('id', c.id, 'cmd', c.command);
    v_size := v_size + length(c.command) + 16;
    update public.access_commands set status = 'sent', sent_at = now(), attempts = attempts + 1 where id = c.id;
  end loop;
  return v_out;
end $$;

-- Regla del molinete de musculación (sin reservas de clase)
create or replace function private.member_gym_allowed(p_member uuid, p_at timestamptz default now()) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select m.status not in ('frozen', 'archived', 'lead')
       and not coalesce((select ba.delinquent from public.billing_accounts ba where ba.id = m.billing_account_id), false)
       and exists (select 1 from public.membership_members mm
                     join public.memberships ms on ms.id = mm.membership_id
                     join public.membership_plans p on p.id = ms.plan_id
                     join public.billing_accounts ba on ba.id = ms.billing_account_id
                     join public.organizations o on o.id = ms.org_id
                    where mm.member_id = m.id and p.includes_open_gym
                      and ms.status in ('active', 'trialing')
                      and not ba.delinquent
                      and (ms.paused_until is null or ms.paused_until <= p_at)
                      and p_at >= ms.current_period_start - interval '1 day'
                      and p_at < ms.current_period_end + make_interval(days => o.grace_days))
      from public.members m where m.id = p_member
  ), false)
$$;
revoke execute on function private.member_gym_allowed(uuid, timestamptz) from public, anon, authenticated;

-- Panel: vincula una tablet al lector (genera el link; se muestra una sola vez)
create or replace function public.access_device_kiosk_token(p_device uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  d       public.access_devices;
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  d := private.access_device_for_admin(p_device);
  update public.access_devices
     set kiosk_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
         info = info || jsonb_build_object('kiosk_token_at', now())
   where id = d.id;
  return v_token;
end $$;
revoke execute on function public.access_device_kiosk_token(uuid) from public, anon;
grant execute on function public.access_device_kiosk_token(uuid) to authenticated;

-- Tablet del molinete (POST /api/access/turnstile, solo el servidor)
--   p_qr = texto del QR leído · p_qr null = latido · p_unlock = ¿abrió? (id devuelto al leer)
create or replace function public.turnstile_scan(p_kiosk_token text, p_qr text, p_unlock bigint default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d          public.access_devices;
  v_org      public.organizations;
  v_parts    text[];
  v_step     bigint;
  v_now_step bigint;
  m          public.members;
  v_allowed  boolean;
  v_reason   text;
  v_last     public.access_commands;
  v_online   boolean;
  v_cmd      public.access_commands;
  v_unlock   bigint;
begin
  if coalesce(p_kiosk_token, '') !~ '^[0-9a-f]{48}$' then return jsonb_build_object('status', 'unauthorized'); end if;
  select * into d from public.access_devices
   where kiosk_token_hash = encode(extensions.digest(p_kiosk_token, 'sha256'), 'hex');
  if not found then return jsonb_build_object('status', 'unauthorized'); end if;
  select * into v_org from public.organizations where id = d.org_id;

  -- Esta fila funciona también como candado: dos lecturas a la vez del mismo molinete se ordenan acá
  update public.access_devices set info = info || jsonb_build_object('kiosk_seen_at', now()) where id = d.id;
  v_online := d.active and d.agent_token_hash is not null
              and coalesce((d.info ->> 'agent_seen_at')::timestamptz > now() - interval '45 seconds', false);

  -- ¿Abrió? (la tablet pregunta hasta que el intermediario confirma)
  if p_unlock is not null then
    select * into v_cmd from public.access_commands where id = p_unlock and device_id = d.id and kind = 'unlock';
    return jsonb_build_object('status', 'ok', 'unlock',
      case when v_cmd.id is null then 'unknown' when v_cmd.status = 'ok' then 'opened'
           when v_cmd.status in ('error', 'superseded') then 'failed' else 'waiting' end);
  end if;

  if p_qr is null then      -- latido de la tablet (para mostrar si el molinete está conectado)
    return jsonb_build_object('status', 'ok', 'opener_online', v_online, 'device', d.name);
  end if;

  -- Mismo formato y firma que el QR de la app (get_checkin_token / checkin_scan)
  v_parts := string_to_array(trim(p_qr), '.');
  if coalesce(array_length(v_parts, 1), 0) <> 4 or v_parts[1] <> 'v1'
     or v_parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or v_parts[3] !~ '^[0-9]{1,12}$' then
    return jsonb_build_object('status', 'ok', 'allowed', false, 'reason', 'QR_INVALID', 'opener_online', v_online);
  end if;
  v_step     := v_parts[3]::bigint;
  v_now_step := floor(extract(epoch from now()) / v_org.qr_step_seconds)::bigint;
  if v_step not in (v_now_step, v_now_step - 1)
     or private.qr_signature(v_parts[2]::uuid, v_step) is distinct from v_parts[4] then
    return jsonb_build_object('status', 'ok', 'allowed', false, 'reason', 'QR_EXPIRED_OR_INVALID', 'opener_online', v_online);
  end if;
  select * into m from public.members where id = v_parts[2]::uuid and org_id = d.org_id;
  if not found then
    return jsonb_build_object('status', 'ok', 'allowed', false, 'reason', 'MEMBER_NOT_FOUND', 'opener_online', v_online);
  end if;

  -- Molinete sin intermediario conectado (o pausado): no se registra nada, que pase por recepción
  if not v_online then
    return jsonb_build_object('status', 'ok', 'allowed', false, 'reason', 'TURNSTILE_OFFLINE', 'opener_online', false,
                              'first_name', m.first_name);
  end if;

  v_allowed := private.member_gym_allowed(m.id);
  if not v_allowed then
    v_reason := case
      when m.status in ('frozen', 'archived') then 'MEMBER_' || upper(m.status::text)
      when coalesce((select ba.delinquent from public.billing_accounts ba where ba.id = m.billing_account_id), false) then 'PAYMENT_PAST_DUE'
      when exists (select 1 from public.membership_members mm join public.memberships ms on ms.id = mm.membership_id
                    join public.membership_plans p on p.id = ms.plan_id
                    where mm.member_id = m.id and p.includes_open_gym) then 'MEMBERSHIP_EXPIRED'
      when exists (select 1 from public.membership_members mm join public.memberships ms on ms.id = mm.membership_id
                    where mm.member_id = m.id and ms.status in ('active', 'trialing')) then 'PLAN_WITHOUT_GYM'
      else 'NO_ACTIVE_MEMBERSHIP' end;
  end if;

  -- Última apertura de este socio en este molinete que no falló (una que no abrió no cuenta)
  select c.* into v_last from public.access_commands c
   where c.device_id = d.id and c.kind = 'unlock' and c.member_id = m.id and c.status in ('pending', 'sent', 'ok')
     and c.created_at > now() - interval '3 minutes'
   order by c.id desc limit 1;

  if v_allowed and v_last.id is not null and v_last.created_at > now() - interval '60 seconds' then
    -- sigue frente a la cámara con el mismo QR: no se abre otra vez ni se registra nada
    return jsonb_build_object('status', 'ok', 'allowed', true, 'duplicate', true, 'opener_online', v_online,
                              'first_name', m.first_name, 'unlock_id', v_last.id);
  end if;
  if v_allowed and v_last.id is not null then
    v_allowed := false;
    v_reason  := 'RECENT_ENTRY';
  end if;

  -- Rechazos: uno solo por minuto por socio (la tablet relee el mismo QR mientras está frente a la cámara)
  if not v_allowed and exists (select 1 from public.checkins c where c.member_id = m.id and not c.allowed
                                 and c.method = 'qr' and c.location_id = d.location_id
                                 and c.created_at > now() - interval '60 seconds') then
    return jsonb_build_object('status', 'ok', 'allowed', false, 'reason', v_reason, 'opener_online', v_online,
                              'first_name', m.first_name);
  end if;

  perform set_config('app.access_sync', 'on', true);
  insert into public.checkins (org_id, location_id, member_id, method, allowed, reason, created_at)
  values (d.org_id, d.location_id, m.id, 'qr', v_allowed, v_reason, now());
  insert into public.domain_events (org_id, type, member_id, payload)
  values (d.org_id, case when v_allowed then 'checkin.allowed' else 'checkin.denied' end, m.id,
          jsonb_build_object('source', 'turnstile_qr', 'device_id', d.id, 'location_id', d.location_id, 'reason', v_reason));

  if v_allowed then
    update public.members set last_checkin_at = now() where id = m.id;
    v_unlock := private.access_queue(d.id, d.org_id, m.access_pin, m.id, 'unlock', 'UNLOCK 1');
  end if;
  -- (las aperturas viejas se limpian con el resto de la cola: access_cleanup, 30 días)

  return jsonb_build_object('status', 'ok', 'allowed', v_allowed, 'reason', v_reason, 'opener_online', v_online,
                            'first_name', m.first_name, 'unlock_id', v_unlock);
end $$;
revoke execute on function public.turnstile_scan(text, text, bigint) from public, anon, authenticated;
grant execute on function public.turnstile_scan(text, text, bigint) to service_role;

-- Intermediario: nueva acción "unlocks" (consulta rápida, cada ~1 s)
create or replace function public.agent_call(p_sn text, p_token text, p_ip text, p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d        public.access_devices;
  v_sn     text := upper(regexp_replace(coalesce(p_sn, ''), '[^A-Za-z0-9]', '', 'g'));
  v_ip     text;
  v_recs   jsonb;
  v_kept   jsonb := '[]'::jsonb;
  v_skip   jsonb := '[]'::jsonb;
  v_out    jsonb := '[]'::jsonb;
  r        jsonb;
  c        record;
  v_pin    int;
  v_res    jsonb;
begin
  select * into d from public.access_devices where serial_number = v_sn;
  if not found or d.agent_token_hash is null or coalesce(p_token, '') = ''
     or d.agent_token_hash <> encode(extensions.digest(p_token, 'sha256'), 'hex') then
    return jsonb_build_object('status', 'unauthorized');
  end if;

  -- Consulta rápida de aperturas: liviana, sin pasar por el portero de ADMS
  if p_action = 'unlocks' then
    update public.access_devices
       set last_seen_at = now(), info = info || jsonb_build_object('agent_seen_at', now())
     where id = d.id and coalesce((info ->> 'agent_seen_at')::timestamptz < now() - interval '15 seconds', true);
    -- Una apertura vieja no se ejecuta nunca (el socio ya se fue o pasó por recepción)
    update public.access_commands set status = 'superseded', return_code = -9998, done_at = now()
     where device_id = d.id and kind = 'unlock'
       and ((status = 'pending' and created_at < now() - interval '20 seconds')
         or (status = 'sent' and created_at < now() - interval '60 seconds'));  -- tomada pero sin respuesta
    if not d.active then
      return jsonb_build_object('status', 'inactive', 'commands', '[]'::jsonb, 'kiosk', d.kiosk_token_hash is not null);
    end if;
    for c in select id, command from public.access_commands
              where device_id = d.id and kind = 'unlock' and status = 'pending'
              order by id for update skip locked loop
      v_out := v_out || jsonb_build_object('id', c.id, 'cmd', c.command);
      update public.access_commands set status = 'sent', sent_at = now(), attempts = attempts + 1 where id = c.id;
    end loop;
    return jsonb_build_object('status', 'ok', 'commands', v_out, 'kiosk', d.kiosk_token_hash is not null);
  end if;

  perform set_config('app.agent_call', 'on', true);
  -- La clave identifica al lector: se usa la IP ya fijada para pasar el control de IP de ADMS
  v_ip := coalesce(d.trusted_ip, p_ip);
  update public.access_devices
     set trusted_ip = v_ip,
         info = info || jsonb_build_object('agent_seen_at', now(), 'agent_ip', left(coalesce(p_ip, ''), 64))
                     || case when p_action = 'hello'
                             then jsonb_build_object('agent', coalesce(p_payload -> 'info', '{}'::jsonb))
                             else '{}'::jsonb end
   where id = d.id;

  if p_action = 'hello' then
    return public.adms_hello(v_sn, v_ip, '{}'::jsonb) || jsonb_build_object('server_time', now());

  elsif p_action = 'poll' then
    return jsonb_build_object('status', case when d.active then 'ok' else 'inactive' end,
                              'commands', public.adms_poll(v_sn, v_ip, 200000));

  elsif p_action = 'results' then
    return jsonb_build_object('status', 'ok', 'updated', public.adms_results(v_sn, v_ip, coalesce(p_payload -> 'results', '[]'::jsonb)));

  elsif p_action = 'push' then
    v_recs := coalesce(p_payload -> 'records', '[]'::jsonb);
    if jsonb_typeof(v_recs) <> 'array' then return jsonb_build_object('status', 'bad_request'); end if;
    -- Huellas: solo de socios (las del sistema anterior no se copian a la nube)
    for r in select * from jsonb_array_elements(v_recs) loop
      if r ->> 'k' = 'bio' then
        v_pin := nullif(regexp_replace(coalesce(r ->> 'pin', ''), '\D', '', 'g'), '')::int;
        if v_pin is null then continue; end if;
        if not exists (select 1 from public.members m
                        where m.org_id = d.org_id and m.access_pin = v_pin and m.status <> 'archived')
           or exists (select 1 from public.access_device_users du      -- usuario cargado a mano, sin vincular
                       where du.device_id = d.id and du.pin = v_pin and not du.managed and du.member_id is null) then
          v_skip := v_skip || to_jsonb(v_pin);
          continue;
        end if;
      end if;
      v_kept := v_kept || r;
    end loop;
    v_res := public.adms_push(v_sn, v_ip, coalesce(p_payload ->> 'table', 'AGENT'), null, v_kept);
    return v_res || jsonb_build_object('skipped_bio_pins', v_skip);
  end if;

  return jsonb_build_object('status', 'bad_request');
end $$;
revoke execute on function public.agent_call(text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.agent_call(text, text, text, text, jsonb) to service_role;

-- La columna de la clave de la tablet tampoco sale del servidor
revoke select on public.access_devices from authenticated;
grant select (id, org_id, location_id, serial_number, name, active, trusted_ip, last_ip, pending_ip, pending_ip_at,
              last_seen_at, info, attlog_stamp, operlog_stamp, created_at)
  on public.access_devices to authenticated;
