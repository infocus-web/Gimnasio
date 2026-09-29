-- =====================================================================
-- Evolution Platform v2 · 0007 · Entrenamiento "two-sided" y motor de
-- automatizaciones (event-driven)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Entrenamiento (Trainerize): el ENTRENADOR prescribe, el CLIENTE registra.
--   Prescripción: workout_programs → program_workouts → program_exercises
--   Asignación  : program_assignments (programa ↔ socio ↔ entrenador)
--   Ejecución   : workout_logs → set_logs   (lo escribe SOLO el cliente)
--   Progreso    : body_metrics               (lo escribe el cliente; el trainer lee)
-- ---------------------------------------------------------------------
create table public.exercises (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid references public.organizations (id) on delete cascade,  -- null = biblioteca global
  name          text not null,
  muscle_group  text,
  equipment     text,
  instructions  text,
  video_url     text,
  thumbnail_url text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now()
);
create index exercises_org_idx on public.exercises (org_id, muscle_group, name);

create table public.workout_programs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  author_id   uuid not null,                  -- staff (entrenador)
  name        text not null,
  description text,
  goal        text,
  level       text check (level in ('beginner', 'intermediate', 'advanced')),
  is_template boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (id, org_id),
  foreign key (author_id, org_id) references public.staff (id, org_id)
);

create table public.program_workouts (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null,
  program_id uuid not null,
  day_index  int  not null check (day_index between 1 and 7),
  name       text not null,
  unique (id, org_id),
  foreign key (program_id, org_id) references public.workout_programs (id, org_id) on delete cascade
);

create table public.program_exercises (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  workout_id       uuid not null,
  exercise_id      uuid not null references public.exercises (id),
  position         int  not null default 0,
  target_sets      int  check (target_sets between 1 and 20),
  target_reps      text,                          -- '8-12', 'AMRAP', '30s'
  target_weight_kg numeric(6, 2),
  rest_seconds     int,
  notes            text,
  foreign key (workout_id, org_id) references public.program_workouts (id, org_id) on delete cascade
);
create index program_exercises_workout_idx on public.program_exercises (workout_id, position);

create table public.program_assignments (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null,
  program_id uuid not null,
  member_id  uuid not null,
  trainer_id uuid not null,
  starts_on  date not null default current_date,
  ends_on    date,
  status     text not null default 'active' check (status in ('active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (program_id, org_id) references public.workout_programs (id, org_id) on delete cascade,
  foreign key (member_id, org_id)  references public.members (id, org_id) on delete cascade,
  foreign key (trainer_id, org_id) references public.staff (id, org_id)
);
create index program_assignments_member_idx on public.program_assignments (member_id, status);

create table public.workout_logs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  member_id     uuid not null,
  assignment_id uuid,
  workout_id    uuid,
  performed_at  timestamptz not null default now(),
  duration_min  int,
  effort_rpe    numeric(3, 1) check (effort_rpe between 1 and 10),
  notes         text,
  unique (id, org_id),
  foreign key (member_id, org_id)     references public.members (id, org_id) on delete cascade,
  foreign key (assignment_id, org_id) references public.program_assignments (id, org_id) on delete set null (assignment_id),
  foreign key (workout_id, org_id)    references public.program_workouts (id, org_id) on delete set null (workout_id)
);
create index workout_logs_member_idx on public.workout_logs (member_id, performed_at desc);

create table public.set_logs (
  id             bigint generated always as identity primary key,
  org_id         uuid not null,
  workout_log_id uuid not null,
  exercise_id    uuid not null references public.exercises (id),
  set_number     int  not null check (set_number between 1 and 50),
  reps           int  check (reps >= 0),
  weight_kg      numeric(6, 2) check (weight_kg >= 0),
  duration_s     int,
  rpe            numeric(3, 1) check (rpe between 1 and 10),
  unique (workout_log_id, exercise_id, set_number),
  foreign key (workout_log_id, org_id) references public.workout_logs (id, org_id) on delete cascade
);
create index set_logs_exercise_idx on public.set_logs (exercise_id);

create table public.body_metrics (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  member_id    uuid not null,
  measured_at  timestamptz not null default now(),
  weight_kg    numeric(5, 2),
  body_fat_pct numeric(4, 1),
  measurements jsonb not null default '{}'::jsonb,   -- {"cintura_cm":80,"brazo_cm":35}
  foreign key (member_id, org_id) references public.members (id, org_id) on delete cascade
);
create index body_metrics_member_idx on public.body_metrics (member_id, measured_at desc);

-- ---------------------------------------------------------------------
-- Automatizaciones (PushPress): Trigger → Condiciones → Pasos
--   domain_events (outbox) ──► worker (/api/cron/automations) ──► automation_runs
-- ---------------------------------------------------------------------
create table public.automation_workflows (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  name        text not null,
  trigger     text not null check (trigger in (
                'member.created', 'member.inactive', 'payment.failed', 'payment.succeeded',
                'membership.past_due', 'membership.expired', 'membership.canceled',
                'booking.no_show', 'booking.promoted', 'checkin.denied')),
  conditions  jsonb not null default '{}'::jsonb,     -- ej. {"inactive_days":7}
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (id, org_id)
);
create index automation_workflows_trigger_idx on public.automation_workflows (org_id, trigger) where active;

create table public.automation_steps (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  workflow_id uuid not null,
  position    int  not null,
  action      text not null check (action in (
                'send_email', 'send_push', 'send_whatsapp', 'notify_staff', 'wait',
                'cancel_future_bookings', 'set_membership_status', 'add_tag')),
  config      jsonb not null default '{}'::jsonb,     -- {"template":"we_miss_you"} / {"hours":24}
  unique (workflow_id, position),
  foreign key (workflow_id, org_id) references public.automation_workflows (id, org_id) on delete cascade
);

create table public.automation_runs (
  id          bigint generated always as identity primary key,
  org_id      uuid not null,
  workflow_id uuid not null,
  member_id   uuid,
  event_id    bigint references public.domain_events (id) on delete set null,
  dedupe_key  text not null,                           -- evita mandar dos veces "Te extrañamos" por la misma racha
  status      text not null default 'pending' check (status in ('pending', 'running', 'waiting', 'completed', 'failed', 'skipped')),
  next_step   int  not null default 1,
  run_after   timestamptz not null default now(),
  last_error  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (workflow_id, dedupe_key),
  foreign key (workflow_id, org_id) references public.automation_workflows (id, org_id) on delete cascade
);
create index automation_runs_due_idx on public.automation_runs (run_after) where status in ('pending', 'waiting');

-- Detector de inactividad: lo llama el cron diario (service_role).
-- Emite UN evento por racha de inactividad (dedupe por fecha del último check-in).
create or replace function public.enqueue_inactivity_events() returns int
language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.domain_events (org_id, type, member_id, payload)
  select m.org_id, 'member.inactive', m.id,
         jsonb_build_object('last_checkin_at', m.last_checkin_at,
                            'inactive_days', (w.conditions ->> 'inactive_days')::int,
                            'dedupe_key', 'inactive:' || coalesce(m.last_checkin_at::date::text, 'never'))
    from public.automation_workflows w
    join public.members m on m.org_id = w.org_id and m.status = 'active'
   where w.active and w.trigger = 'member.inactive'
     and coalesce(m.last_checkin_at, m.created_at) < now() - make_interval(days => (w.conditions ->> 'inactive_days')::int)
     -- solo socios con membresía vigente (no molestar a ex-socios)
     and exists (select 1 from public.membership_members mm join public.memberships ms on ms.id = mm.membership_id
                  where mm.member_id = m.id and ms.status in ('active', 'trialing'))
     and not exists (select 1 from public.automation_runs r
                      where r.workflow_id = w.id and r.member_id = m.id
                        and r.dedupe_key = 'inactive:' || coalesce(m.last_checkin_at::date::text, 'never'));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Workflows por defecto al crear un gimnasio
create or replace function public.seed_default_workflows() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_wf uuid;
begin
  insert into public.automation_workflows (org_id, name, trigger, conditions)
  values (new.id, 'Te extrañamos (7 días sin venir)', 'member.inactive', '{"inactive_days":7}')
  returning id into v_wf;
  insert into public.automation_steps (org_id, workflow_id, position, action, config) values
    (new.id, v_wf, 1, 'send_email', '{"template":"we_miss_you"}');

  insert into public.automation_workflows (org_id, name, trigger)
  values (new.id, 'Pago fallido → suspender reservas y avisar', 'payment.failed')
  returning id into v_wf;
  insert into public.automation_steps (org_id, workflow_id, position, action, config) values
    (new.id, v_wf, 1, 'set_membership_status', '{"status":"past_due"}'),
    (new.id, v_wf, 2, 'cancel_future_bookings', '{"notify":true}'),
    (new.id, v_wf, 3, 'send_email', '{"template":"payment_failed"}'),
    (new.id, v_wf, 4, 'notify_staff', '{"permission":"billing.write"}');
  return new;
end $$;
create trigger organizations_seed_workflows after insert on public.organizations
  for each row execute function public.seed_default_workflows();
