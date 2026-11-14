-- =====================================================================
-- Evolution Platform v2 · 0057 · El profe puede cambiarle el nombre a SUS salas
--   · "Sus salas" = las salas donde tiene un horario fijo vigente o una clase próxima.
--   · Solo el nombre: capacidad, equipos y activar/desactivar siguen siendo de administración.
--   · Administración (schedule.manage) puede renombrar cualquier sala con esta misma función.
-- =====================================================================

create or replace function public.rename_room(p_room uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_r    public.rooms;
  v_me   uuid;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_name = '' then raise exception 'NAME_REQUIRED'; end if;
  if length(v_name) > 60 then raise exception 'ROOM_NAME_TOO_LONG'; end if;

  select * into v_r from public.rooms where id = p_room for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  if not private.has_permission(v_r.org_id, 'schedule.manage') then
    if not private.has_permission(v_r.org_id, 'schedule.own') then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    v_me := private.my_staff_id(v_r.org_id);
    if v_me is null or not (
         exists (select 1 from public.class_series s
                  where s.room_id = p_room and s.instructor_id = v_me
                    and (s.valid_until is null or s.valid_until >= current_date))
      or exists (select 1 from public.class_sessions cs
                  where cs.room_id = p_room and cs.instructor_id = v_me
                    and cs.status = 'scheduled' and cs.ends_at > now())
    ) then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  if exists (select 1 from public.rooms
              where location_id = v_r.location_id and lower(name) = lower(v_name) and id <> p_room) then
    raise exception 'ROOM_NAME_TAKEN';
  end if;

  update public.rooms set name = v_name where id = p_room;
end $$;

revoke execute on function public.rename_room(uuid, text) from public, anon;
grant execute on function public.rename_room(uuid, text) to authenticated;
