-- =====================================================================
-- 0037 · "Hoy en el gimnasio" en la web pública
--   Lo mismo que muestra la TV de la sala, pero SIN datos de socios:
--   mensaje del gimnasio, cuánta gente hay ahora y las clases que siguen hoy
--   con lugares libres. Nada de ranking ni cumpleaños.
--   Se prende/apaga en Panel → Máquinas → Pantalla de TV ("Mostrar también en la web").
-- =====================================================================

alter table public.floor_settings add column if not exists web_enabled boolean not null default true;

-- Ajustes de la TV: ahora incluye web_enabled
create or replace function public.floor_tv_settings(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v public.floor_settings;
begin
  if not private.can_manage_tv(p_org) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into v from public.floor_settings where org_id = p_org;
  return jsonb_build_object('linked', v.tv_token_hash is not null, 'linked_at', v.tv_linked_at, 'seen_at', v.tv_seen_at,
                            'ranking_enabled', coalesce(v.ranking_enabled, true), 'message', v.message,
                            'web_enabled', coalesce(v.web_enabled, true));
end $$;

-- Guardar: se reemplaza la versión de 3 parámetros (si quedaran las dos, la llamada sería ambigua)
drop function if exists public.floor_tv_save(uuid, boolean, text);
create or replace function public.floor_tv_save(p_org uuid, p_ranking boolean, p_message text, p_web boolean default true)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_manage_tv(p_org) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if length(coalesce(p_message, '')) > 280 then raise exception 'MESSAGE_TOO_LONG'; end if;
  insert into public.floor_settings (org_id, ranking_enabled, message, web_enabled)
  values (p_org, coalesce(p_ranking, true), nullif(btrim(coalesce(p_message, '')), ''), coalesce(p_web, true))
  on conflict (org_id) do update
     set ranking_enabled = excluded.ranking_enabled, message = excluded.message,
         web_enabled = excluded.web_enabled, updated_at = now();
end $$;
revoke execute on function public.floor_tv_save(uuid, boolean, text, boolean) from public, anon;
grant execute on function public.floor_tv_save(uuid, boolean, text, boolean) to authenticated;

-- Datos públicos de hoy (sin login). Nunca devuelve nombres de socios.
create or replace function public.public_today(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org   public.organizations;
  v_fs    public.floor_settings;
  v_today date;
  v_occ   jsonb;
begin
  select * into v_org from public.organizations where slug = lower(coalesce(p_slug, ''));
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select * into v_fs from public.floor_settings where org_id = v_org.id;
  if found and not v_fs.web_enabled then return jsonb_build_object('status', 'off'); end if;

  v_today := (now() at time zone v_org.timezone)::date;
  begin
    v_occ := private.gym_occupancy_calc(v_org.id);
  exception when others then
    v_occ := null;
  end;

  return jsonb_build_object(
    'status', 'ok',
    'timezone', v_org.timezone,
    'server_time', now(),
    'message', v_fs.message,
    'people', (v_occ ->> 'people')::int,
    'level', v_occ ->> 'level',
    'classes', (select coalesce(jsonb_agg(x order by x.starts_at), '[]'::jsonb) from (
        select s.starts_at, s.ends_at, ct.name, ct.color, st.display_name as instructor, r.name as room,
               greatest(s.capacity - (select count(*) from public.bookings b
                                       where b.session_id = s.id and b.status in ('booked', 'checked_in'))::int, 0) as spots,
               s.capacity
          from public.class_sessions s
          join public.class_types ct on ct.id = s.class_type_id
          join public.staff st on st.id = s.instructor_id
          join public.rooms r on r.id = s.room_id
         where s.org_id = v_org.id and s.status = 'scheduled'
           and s.starts_at >= v_today::timestamp at time zone v_org.timezone
           and s.starts_at < (v_today + 1)::timestamp at time zone v_org.timezone
           and s.ends_at > now()
         order by s.starts_at limit 8) x)
  );
end $$;
revoke execute on function public.public_today(text) from public;
grant execute on function public.public_today(text) to anon, authenticated;
