-- =====================================================================
-- Evolution Platform v2 · 0009 · Evolution Fitness Gym como primer tenant
-- Copia lo aprovechable de la v1 (schema legacy) al modelo nuevo.
-- En producción la v1 tiene: 1 admin, 3 planes, 15 ejercicios, 1 rutina,
-- 3 actividades y 0 socios/pagos → no hay datos de clientes que migrar.
-- =====================================================================
do $$
declare
  v_org    uuid;
  v_owner  uuid;
  v_admin  uuid;
  v_name   text;
  r        record;
  v_prog   uuid;
  v_wk     uuid;
begin
  select coalesce(nullif(gym_name, 'Mi Gimnasio'), 'Evolution Fitness Gym') into v_name
    from legacy.settings where id = 1;

  insert into public.organizations (slug, name, branding)
  values ('evolution', coalesce(v_name, 'Evolution Fitness Gym'),
          jsonb_build_object('primary', '#edcc36', 'background', '#0a0a0a'))
  returning id into v_org;
  insert into public.locations (org_id, name, address)
  values (v_org, 'Sede principal', (select address from legacy.settings where id = 1));

  -- Perfiles y owner (el admin de la v1)
  insert into public.profiles (id, full_name)
  select id, full_name from legacy.profiles
  on conflict (id) do nothing;

  select id into v_admin from legacy.profiles where role = 'admin' order by created_at limit 1;
  if v_admin is not null then
    insert into public.staff (org_id, user_id, role, display_name)
    select v_org, p.id, 'owner', coalesce(p.full_name, 'Owner') from legacy.profiles p where p.id = v_admin
    returning id into v_owner;
    -- el resto del staff v1 entra como 'staff' (los 'pending' quedan afuera)
    insert into public.staff (org_id, user_id, role, display_name)
    select v_org, p.id, 'staff', coalesce(p.full_name, p.email)
      from legacy.profiles p where p.role = 'staff';
  end if;

  -- Planes (numeric → centavos; duración en días → intervalo de facturación)
  insert into public.membership_plans (org_id, name, description, kind, price_cents, currency,
                                       billing_interval, interval_count, active, is_public, sort)
  select v_org, name, description, 'recurring', round(price * 100)::bigint, 'ARS',
         case when duration_days % 30 = 0 then 'month' when duration_days % 7 = 0 then 'week' else 'day' end,
         case when duration_days % 30 = 0 then duration_days / 30
              when duration_days % 7 = 0 then duration_days / 7 else duration_days end,
         active, show_public, sort
    from legacy.plans;

  -- Actividades → tipos de clase
  insert into public.class_types (org_id, name, description, color, image_url, default_capacity, active)
  select v_org, name, description, coalesce(color, '#edcc36'), image_url, coalesce(capacity, 20), active
    from legacy.activities;

  -- Ejercicios (con sus videos) → biblioteca del gimnasio
  create temporary table _ex_map (old_id uuid, new_id uuid) on commit drop;
  for r in select * from legacy.exercises loop
    insert into public.exercises (org_id, name, muscle_group, equipment, instructions, video_url, thumbnail_url, created_by)
    values (v_org, r.name, r.muscle_group, r.equipment, r.description, r.video_url, r.thumbnail_url, v_admin)
    returning id into v_wk;
    insert into _ex_map values (r.id, v_wk);
  end loop;

  -- Rutinas → programas plantilla (autor = owner)
  if v_owner is not null then
    for r in select * from legacy.routines loop
      insert into public.workout_programs (org_id, author_id, name, description, goal, level, is_template)
      values (v_org, v_owner, r.name, r.description, r.goal,
              case r.level when 'principiante' then 'beginner' when 'intermedio' then 'intermediate'
                           when 'avanzado' then 'advanced' end, true)
      returning id into v_prog;

      insert into public.program_workouts (org_id, program_id, day_index, name)
      select distinct v_org, v_prog, ri.day, 'Día ' || ri.day
        from legacy.routine_items ri where ri.routine_id = r.id;

      insert into public.program_exercises (org_id, workout_id, exercise_id, position, target_sets,
                                            target_reps, rest_seconds, notes)
      select v_org, pw.id, m.new_id, ri.position, ri.sets, ri.reps, ri.rest_seconds, ri.notes
        from legacy.routine_items ri
        join _ex_map m on m.old_id = ri.exercise_id
        join public.program_workouts pw on pw.program_id = v_prog and pw.day_index = ri.day
       where ri.routine_id = r.id;
    end loop;
  end if;
end $$;
