-- =====================================================================
-- 0023 · Intermediario en la PC del gimnasio (lectores sin "nube completa")
--
-- Algunos lectores (ej. ZKTeco MB360) se conectan a la nube pero rechazan
-- las órdenes (cargar/borrar usuarios). Esos se manejan por la red local
-- (puerto 4370) desde un programa en una PC del gimnasio: tools/zk-agent.
--
-- El programa usa la MISMA lógica que ADMS (cola de comandos, reconciliador,
-- registro de entradas): lee la cola con adms_poll, informa con adms_results
-- y sube usuarios/huellas/entradas con adms_push. Solo cambia la puerta:
--   · se identifica con número de serie + una clave propia del lector
--     (se genera en Panel → Accesos y se guarda hasheada);
--   · como la clave ya identifica, no se fija la IP pública (el módem del
--     gimnasio puede cambiarla sin que se corte el servicio).
-- Las plantillas de huella solo se guardan si el número pertenece a un socio
-- (los usuarios del sistema anterior quedan solo en el lector hasta que se
-- vinculen con su socio).
-- =====================================================================

alter table public.access_devices add column if not exists agent_token_hash text;

-- La columna nunca sale del servidor (ni hash): se lista lo visible para el panel
revoke select on public.access_devices from authenticated;
grant select (id, org_id, location_id, serial_number, name, active, trusted_ip, last_ip, pending_ip, pending_ip_at,
              last_seen_at, info, attlog_stamp, operlog_stamp, created_at)
  on public.access_devices to authenticated;

-- Si el lector tiene intermediario, la cola es solo para él: aunque el lector siga
-- conectado a la nube (ADMS), no se lleva comandos que después rechazaría.
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
   where device_id = d.id and status = 'sent' and sent_at < now() - interval '5 minutes' and attempts < 5;
  update public.access_commands set status = 'error', return_code = -9999, done_at = now()
   where device_id = d.id and status = 'sent' and sent_at < now() - interval '5 minutes' and attempts >= 5;

  for c in select id, command from public.access_commands
            where device_id = d.id and status = 'pending' order by id limit 200 for update skip locked loop
    exit when v_size > 0 and v_size + length(c.command) > p_max_bytes;
    v_out := v_out || jsonb_build_object('id', c.id, 'cmd', c.command);
    v_size := v_size + length(c.command) + 16;
    update public.access_commands set status = 'sent', sent_at = now(), attempts = attempts + 1 where id = c.id;
  end loop;
  return v_out;
end $$;

-- Panel: genera (o reemplaza) la clave del intermediario. Se muestra una sola vez.
create or replace function public.access_device_agent_token(p_device uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  d       public.access_devices;
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  d := private.access_device_for_admin(p_device);
  update public.access_devices
     set agent_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
         info = info || jsonb_build_object('agent_token_at', now())
   where id = d.id;
  return v_token;
end $$;
revoke execute on function public.access_device_agent_token(uuid) from public, anon;
grant execute on function public.access_device_agent_token(uuid) to authenticated;

-- Puerta única del intermediario (POST /api/access/agent, solo el servidor)
--   p_action: hello | push | poll | results
--   p_payload:
--     hello   {"info": {...}}                       → como adms_hello
--     push    {"table": "USERINFO"|"FP"|"ATTLOG", "records": [...]}  (mismo formato que adms_push)
--     poll    {}                                     → [{"id":..,"cmd":".."}]
--     results {"results": [{"id":..,"ret":..}]}
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
  r        jsonb;
  v_pin    int;
  v_res    jsonb;
begin
  select * into d from public.access_devices where serial_number = v_sn;
  if not found or d.agent_token_hash is null or coalesce(p_token, '') = ''
     or d.agent_token_hash <> encode(extensions.digest(p_token, 'sha256'), 'hex') then
    return jsonb_build_object('status', 'unauthorized');
  end if;

  perform set_config('app.agent_call', 'on', true);
  -- La clave identifica al lector: se usa la IP ya fijada para pasar el control de IP de ADMS
  v_ip := coalesce(d.trusted_ip, p_ip);
  update public.access_devices
     set trusted_ip = v_ip, pending_ip = null, pending_ip_at = null,
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
        if v_pin is null or not exists (select 1 from public.members m
                                         where m.org_id = d.org_id and m.access_pin = v_pin and m.status <> 'archived') then
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
