-- =====================================================================
-- Evolution Platform v2 · 0043 · "Hoy en Evolution": id de cada clase
--   El botón "Anotarme" de la web abre esa clase en la app (/app/clases?clase=<id>).
-- =====================================================================

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
        select s.id, s.starts_at, s.ends_at, ct.name, ct.color, st.display_name as instructor, r.name as room,
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
