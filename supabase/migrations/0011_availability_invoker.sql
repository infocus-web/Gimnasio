-- =====================================================================
-- Evolution Platform v2 · 0011 · La agenda respeta RLS (security_invoker)
-- El advisor de Supabase marca como ERROR las vistas SECURITY DEFINER.
-- Solución: la vista corre con los permisos de quien consulta (RLS normal
-- sobre sesiones, salas y staff) y solo el CONTEO de lugares se calcula en
-- una función privada, que devuelve números y nunca quién reservó.
-- =====================================================================
create or replace function private.session_counts(p_session_id uuid, out taken int, out waiting int)
language sql stable security definer set search_path = '' as $$
  select (count(*) filter (where status in ('booked', 'checked_in')))::int,
         (count(*) filter (where status = 'waitlisted'))::int
    from public.bookings
   where session_id = p_session_id
     and exists (select 1 from public.class_sessions s
                  where s.id = p_session_id and s.org_id in (select private.my_org_ids()))
$$;
revoke execute on function private.session_counts(uuid) from public, anon;
grant execute on function private.session_counts(uuid) to authenticated;

drop view if exists public.class_sessions_availability;
create view public.class_sessions_availability with (security_invoker = true) as
select s.id, s.org_id, s.class_type_id, ct.name as class_name, ct.color, s.room_id, r.name as room_name,
       s.instructor_id, st.display_name as instructor_name, s.starts_at, s.ends_at, s.status,
       s.capacity,
       s.capacity - c.taken             as spots_left,
       s.waitlist_capacity - c.waiting  as waitlist_left,
       ct.equipment_kind,
       (ct.equipment_kind is not null) as uses_equipment,
       st.photo_url as instructor_photo_url,
       s.booking_closes_min
  from public.class_sessions s
  join public.class_types ct on ct.id = s.class_type_id
  join public.rooms r        on r.id = s.room_id
  join public.staff st       on st.id = s.instructor_id
  cross join lateral private.session_counts(s.id) c;

revoke all on public.class_sessions_availability from anon;
grant select on public.class_sessions_availability to authenticated;
