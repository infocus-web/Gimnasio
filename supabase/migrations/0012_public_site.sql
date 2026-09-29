-- =====================================================================
-- Evolution Platform v2 · 0012 · Web pública del gimnasio
--   · organizations.public_profile: textos, fotos y contacto de la web
--     (se completa con lo que había en la v1)
--   · Salas + grilla semanal (class_series) desde los horarios de la v1
--   · public_gym_profile(slug): lo único que ve un visitante sin login.
--     Devuelve solo información comercial pública; nada de socios.
-- =====================================================================

alter table public.organizations
  add column if not exists public_profile jsonb not null default '{}'::jsonb;

-- Textos y fotos de la v1 → perfil público
update public.organizations o
   set public_profile = jsonb_strip_nulls(jsonb_build_object(
         'tagline',      s.tagline,
         'hero_kicker',  s.hero_kicker,
         'hero_text',    s.hero_text,
         'hero_image',   s.hero_url,
         'about_title',  s.about_title,
         'about_text',   s.about_text,
         'about_images', to_jsonb(array_remove(array[s.about_image_url, s.about_image2_url], null)),
         'gallery',      to_jsonb(s.gallery),
         'hours_text',   s.opening_hours,
         'phone',        s.phone,
         'whatsapp',     s.whatsapp,
         'email',        s.email,
         'instagram',    s.instagram,
         'address',      s.address))
  from legacy.settings s
 where s.id = 1 and o.slug = 'evolution' and o.public_profile = '{}'::jsonb;

-- Salas y grilla semanal a partir de los horarios de la v1 (profe = owner
-- hasta que se carguen los profes reales).
do $$
declare
  v_org   uuid;
  v_loc   uuid;
  v_owner uuid;
begin
  select id into v_org from public.organizations where slug = 'evolution';
  if v_org is null then return; end if;
  select id into v_loc from public.locations where org_id = v_org order by created_at limit 1;
  select id into v_owner from public.staff where org_id = v_org and role = 'owner' order by created_at limit 1;
  if v_owner is null or exists (select 1 from public.class_series where org_id = v_org) then return; end if;

  insert into public.rooms (org_id, location_id, name, capacity)
  select distinct v_org, v_loc, coalesce(nullif(sch.room, ''), 'Salón principal'), 30
    from legacy.activity_schedule sch
  on conflict (location_id, name) do nothing;

  insert into public.class_series (org_id, class_type_id, room_id, instructor_id, weekday, start_time,
                                   duration_min, capacity)
  select v_org, ct.id, r.id, v_owner, sch.weekday, sch.start_time,
         greatest(5, (extract(epoch from (sch.end_time - sch.start_time)) / 60)::int),
         least(r.capacity, coalesce(a.capacity, ct.default_capacity))
    from legacy.activity_schedule sch
    join legacy.activities a     on a.id = sch.activity_id
    join public.class_types ct   on ct.org_id = v_org and ct.name = a.name
    join public.rooms r          on r.location_id = v_loc and r.name = coalesce(nullif(sch.room, ''), 'Salón principal');
end $$;

create or replace function public.public_gym_profile(p_slug text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', o.name,
    'slug', o.slug,
    'profile', o.public_profile,
    'opening_hours', o.opening_hours,
    'address', coalesce(o.public_profile ->> 'address', (select l.address from public.locations l
                                                          where l.org_id = o.id and l.active order by l.created_at limit 1)),
    'plans', coalesce((select jsonb_agg(jsonb_build_object(
                         'name', p.name, 'description', p.description, 'kind', p.kind,
                         'price_cents', p.price_cents, 'currency', p.currency,
                         'billing_interval', p.billing_interval, 'interval_count', p.interval_count,
                         'class_credits', p.class_credits, 'max_members', p.max_members) order by p.sort, p.price_cents)
                         from public.membership_plans p
                        where p.org_id = o.id and p.active and p.is_public), '[]'::jsonb),
    'activities', coalesce((select jsonb_agg(jsonb_build_object(
                              'name', ct.name, 'description', ct.description, 'color', ct.color,
                              'image_url', ct.image_url) order by ct.name)
                              from public.class_types ct
                             where ct.org_id = o.id and ct.active), '[]'::jsonb),
    'schedule', coalesce((select jsonb_agg(jsonb_build_object(
                            'weekday', cs.weekday, 'start', to_char(cs.start_time, 'HH24:MI'),
                            'end', to_char(cs.start_time + make_interval(mins => cs.duration_min), 'HH24:MI'),
                            'activity', ct.name, 'color', ct.color, 'room', r.name) order by cs.weekday, cs.start_time)
                            from public.class_series cs
                            join public.class_types ct on ct.id = cs.class_type_id
                            join public.rooms r on r.id = cs.room_id
                           where cs.org_id = o.id and ct.active
                             and (cs.valid_until is null or cs.valid_until >= current_date)), '[]'::jsonb)
  )
  from public.organizations o
  where o.slug = lower(p_slug)
$$;

revoke execute on function public.public_gym_profile(text) from public;
grant execute on function public.public_gym_profile(text) to anon, authenticated;
