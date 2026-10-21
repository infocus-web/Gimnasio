-- =====================================================================
-- 0025 · Eliminar un socio definitivamente (solo dueño/admin: org.manage)
--
-- Archivar (dar de baja) sigue siendo lo habitual: conserva pagos e historial.
-- Eliminar borra TODO lo del socio: ficha, plan, pagos y facturas de su cuenta,
-- reservas, entradas, rutinas, métricas y su huella/cara guardada; y lo saca
-- de los lectores (queda la orden de borrado en la cola).
--
-- Si es el que paga un grupo familiar con otros integrantes, primero hay que
-- quitar a los integrantes (o eliminarlos): no se borran pagos de otros.
-- Devuelve el usuario de la app para borrar si ya no lo usa nadie
-- (ni otro socio ni el staff): ese borrado lo hace el servidor.
-- =====================================================================

create or replace function public.member_delete(p_member uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m        public.members;
  v_ba     uuid;
  du       record;
  v_user   uuid;
begin
  select * into m from public.members where id = p_member;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  if not private.has_permission(m.org_id, 'org.manage') then raise exception 'FORBIDDEN'; end if;

  -- Cuenta de pago propia (él es el pagador)
  select id into v_ba from public.billing_accounts where org_id = m.org_id and payer_member_id = m.id;
  if v_ba is not null and exists (select 1 from public.members x where x.billing_account_id = v_ba and x.id <> m.id) then
    raise exception 'MEMBER_IS_PAYER';
  end if;

  -- Lectores: sacarlo de los que lo tienen cargado
  if m.access_pin is not null then
    for du in select device_id, pin from public.access_device_users
               where member_id = m.id and state = 'present' loop
      perform private.access_delete_user(du.device_id, du.pin);
    end loop;
    delete from public.access_templates where org_id = m.org_id and pin = m.access_pin;
  end if;
  update public.access_device_users set member_id = null, managed = false where member_id = m.id;
  update public.access_commands set member_id = null where member_id = m.id;

  -- Su cuenta de pago: pagos, facturas, planes y la cuenta
  if v_ba is not null then
    update public.members set billing_account_id = null where id = m.id;
    delete from public.payments where billing_account_id = v_ba;
    delete from public.invoices where billing_account_id = v_ba;
    delete from public.billing_accounts where id = v_ba;     -- planes e integrantes en cascada
  end if;

  delete from public.domain_events where member_id = m.id;
  delete from public.members where id = m.id;               -- reservas, entradas, rutinas, métricas en cascada

  -- ¿Su usuario de la app queda sin uso?
  if m.user_id is not null
     and not exists (select 1 from public.members x where x.user_id = m.user_id)
     and not exists (select 1 from public.staff s where s.user_id = m.user_id) then
    v_user := m.user_id;
  end if;
  return jsonb_build_object('deleted', true, 'orphan_user_id', v_user);
end $$;
revoke execute on function public.member_delete(uuid) from public, anon;
grant execute on function public.member_delete(uuid) to authenticated;

-- =====================================================================
-- Abrir el molinete a mano (recepción / dueño): una vuelta, por el intermediario
-- =====================================================================
create or replace function public.access_device_open(p_device uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  d    public.access_devices;
  v_id bigint;
begin
  d := private.access_device_for_admin(p_device, 'checkins.manage');
  if not d.active or d.agent_token_hash is null
     or not coalesce((d.info ->> 'agent_seen_at')::timestamptz > now() - interval '45 seconds', false) then
    raise exception 'TURNSTILE_OFFLINE';
  end if;
  v_id := private.access_queue(d.id, d.org_id, null, null, 'unlock', 'UNLOCK 1');
  insert into public.domain_events (org_id, type, payload)
  values (d.org_id, 'turnstile.manual_open', jsonb_build_object('device_id', d.id, 'by', auth.uid(), 'command_id', v_id));
  return v_id;
end $$;
revoke execute on function public.access_device_open(uuid) from public, anon;
grant execute on function public.access_device_open(uuid) to authenticated;
