-- =====================================================================
-- Evolution Platform v2 · 0008 · Row Level Security
--
-- Principios
--   · Deny by default: RLS activo en TODAS las tablas; sin política = sin acceso.
--   · La app pregunta por PERMISOS (private.has_permission), no por roles.
--   · Separación Entrenador / Cliente:
--       - Cliente  → ve y escribe SOLO lo suyo (y lo de su grupo familiar si es el pagador).
--       - Trainer  → ve SOLO a sus alumnos (trainer_clients) y los inscriptos de SUS clases;
--                    prescribe rutinas, pero NO puede escribir los registros del cliente.
--       - Staff/Admin → según permisos granulares.
--   · Escrituras sensibles (reservas, check-ins, pagos) NO tienen política de
--     INSERT para clientes: solo se hacen vía funciones (book_class, checkin_scan)
--     o desde el servidor con service_role (webhooks de Stripe/Mercado Pago).
--   · Cada helper se envuelve en (select ...) para que Postgres lo evalúe una
--     sola vez por consulta (initPlan) y no una vez por fila.
-- =====================================================================

-- Grants explícitos (Supabase los da por defecto; acá quedan documentados).
-- RLS decide QUÉ filas; los REVOKE de abajo sacan operaciones enteras.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array[
    'organizations', 'locations', 'profiles', 'staff', 'permissions', 'role_permissions',
    'staff_permission_overrides', 'members', 'member_secrets', 'trainer_clients',
    'billing_accounts', 'membership_plans', 'memberships', 'membership_members',
    'invoices', 'payments', 'webhook_events', 'domain_events',
    'rooms', 'equipment', 'class_types', 'plan_class_types', 'class_series', 'class_sessions',
    'bookings', 'checkins',
    'exercises', 'workout_programs', 'program_workouts', 'program_exercises', 'program_assignments',
    'workout_logs', 'set_logs', 'body_metrics',
    'automation_workflows', 'automation_steps', 'automation_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Tablas solo-servidor: sin políticas y sin grants para usuarios
revoke all on public.member_secrets, public.webhook_events, public.domain_events from authenticated;

-- =====================================================================
-- Tenancy y RBAC
-- =====================================================================
create policy org_select on public.organizations for select to authenticated
  using (id in (select private.my_org_ids()));
create policy org_update on public.organizations for update to authenticated
  using ((select private.has_permission(id, 'org.manage')))
  with check ((select private.has_permission(id, 'org.manage')));

create policy locations_select on public.locations for select to authenticated
  using (org_id in (select private.my_org_ids()));
create policy locations_write on public.locations for all to authenticated
  using ((select private.has_permission(org_id, 'org.manage')))
  with check ((select private.has_permission(org_id, 'org.manage')));

create policy profiles_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Los socios ven al staff activo (nombre/foto del profe en la agenda)
create policy staff_select on public.staff for select to authenticated
  using (org_id in (select private.my_org_ids()) and (active or (select private.has_permission(org_id, 'staff.manage'))));
create policy staff_write on public.staff for all to authenticated
  using ((select private.has_permission(org_id, 'staff.manage')))
  with check ((select private.has_permission(org_id, 'staff.manage')));   -- + trigger staff_guard

create policy permissions_read on public.permissions for select to authenticated using (true);
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);
revoke insert, update, delete on public.permissions, public.role_permissions from authenticated;

create policy overrides_manage on public.staff_permission_overrides for all to authenticated
  using (exists (select 1 from public.staff s where s.id = staff_id
                  and (select private.has_permission(s.org_id, 'staff.manage'))))
  with check (exists (select 1 from public.staff s where s.id = staff_id
                       and (select private.has_permission(s.org_id, 'staff.manage'))));

-- =====================================================================
-- Socios  ←— ejemplo central de la separación Trainer / Cliente
-- =====================================================================
create policy members_select on public.members for select to authenticated
  using (
    (select private.has_permission(org_id, 'members.read'))          -- recepción / admin
    or id in (select private.actable_member_ids())                    -- yo y mi grupo familiar
    or id in (select private.my_client_ids())                         -- TRAINER: solo sus alumnos
    or exists (                                                       -- TRAINER: inscriptos en sus clases
         select 1 from public.bookings b
           join public.class_sessions s on s.id = b.session_id
           join public.staff st on st.id = s.instructor_id
          where b.member_id = members.id and st.user_id = (select auth.uid())
            and b.status in ('booked', 'waitlisted', 'checked_in'))
  );
create policy members_insert on public.members for insert to authenticated
  with check ((select private.has_permission(org_id, 'members.write')));
create policy members_update on public.members for update to authenticated
  using ((select private.has_permission(org_id, 'members.write')) or id in (select private.actable_member_ids()))
  with check ((select private.has_permission(org_id, 'members.write')) or id in (select private.actable_member_ids()));
  -- el trigger members_guard limita QUÉ columnas puede tocar el socio
create policy members_delete on public.members for delete to authenticated
  using ((select private.has_permission(org_id, 'org.manage')));

create policy trainer_clients_select on public.trainer_clients for select to authenticated
  using ((select private.has_permission(org_id, 'members.read'))
         or trainer_id = (select private.staff_id(org_id))
         or member_id in (select private.actable_member_ids()));
create policy trainer_clients_write on public.trainer_clients for all to authenticated
  using ((select private.has_permission(org_id, 'members.write')))
  with check ((select private.has_permission(org_id, 'members.write')));

-- =====================================================================
-- Facturación: el pagador ve la cuenta familiar; los dependientes ven su
-- cobertura pero no los pagos.
-- =====================================================================
create policy billing_accounts_select on public.billing_accounts for select to authenticated
  using ((select private.has_permission(org_id, 'billing.read')) or (select private.is_payer(id)));
create policy billing_accounts_write on public.billing_accounts for all to authenticated
  using ((select private.has_permission(org_id, 'billing.write')))
  with check ((select private.has_permission(org_id, 'billing.write')));

create policy plans_select on public.membership_plans for select to authenticated
  using ((org_id in (select private.my_org_ids()) and active and is_public)
         or (select private.has_permission(org_id, 'billing.read')));
create policy plans_write on public.membership_plans for all to authenticated
  using ((select private.has_permission(org_id, 'billing.write')))
  with check ((select private.has_permission(org_id, 'billing.write')));
-- Precios públicos para la landing (sin login)
grant select on public.membership_plans to anon;
create policy plans_public on public.membership_plans for select to anon using (active and is_public);

create policy memberships_select on public.memberships for select to authenticated
  using ((select private.has_permission(org_id, 'billing.read'))
         or (select private.is_payer(billing_account_id))
         or exists (select 1 from public.membership_members mm
                     where mm.membership_id = memberships.id
                       and mm.member_id in (select private.actable_member_ids())));
create policy memberships_write on public.memberships for all to authenticated
  using ((select private.has_permission(org_id, 'billing.write')))
  with check ((select private.has_permission(org_id, 'billing.write')));

create policy membership_members_select on public.membership_members for select to authenticated
  using ((select private.has_permission(org_id, 'billing.read'))
         or member_id in (select private.actable_member_ids()));
create policy membership_members_write on public.membership_members for all to authenticated
  using ((select private.has_permission(org_id, 'billing.write')))
  with check ((select private.has_permission(org_id, 'billing.write')));

create policy invoices_select on public.invoices for select to authenticated
  using ((select private.has_permission(org_id, 'billing.read')) or (select private.is_payer(billing_account_id)));
create policy invoices_write on public.invoices for all to authenticated
  using ((select private.has_permission(org_id, 'billing.write')))
  with check ((select private.has_permission(org_id, 'billing.write')));

create policy payments_select on public.payments for select to authenticated
  using ((select private.has_permission(org_id, 'billing.read')) or (select private.is_payer(billing_account_id)));
-- Pagos manuales (efectivo/transferencia) desde recepción. Los online los escribe el webhook con service_role.
create policy payments_insert_manual on public.payments for insert to authenticated
  with check ((select private.has_permission(org_id, 'billing.write'))
              and provider in ('cash', 'transfer', 'card_terminal', 'other'));
create policy payments_update on public.payments for update to authenticated
  using ((select private.has_permission(org_id, 'billing.write')))
  with check ((select private.has_permission(org_id, 'billing.write')));
-- nadie borra pagos: se reembolsan (auditoría)

-- =====================================================================
-- Agenda y recursos
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['rooms', 'equipment', 'class_types', 'plan_class_types', 'class_series', 'class_sessions'] loop
    execute format($f$create policy %1$s_select on public.%1$I for select to authenticated
                      using (org_id in (select private.my_org_ids()))$f$, t);
    execute format($f$create policy %1$s_write on public.%1$I for all to authenticated
                      using ((select private.has_permission(org_id, 'schedule.manage')))
                      with check ((select private.has_permission(org_id, 'schedule.manage')))$f$, t);
  end loop;
end $$;

-- =====================================================================
-- Reservas  ←— Trainer ve la lista de SUS clases; cliente ve las suyas
-- =====================================================================
create policy bookings_select on public.bookings for select to authenticated
  using (
    (select private.has_permission(org_id, 'bookings.manage'))
    or member_id in (select private.actable_member_ids())
    or exists (select 1 from public.class_sessions s join public.staff st on st.id = s.instructor_id
                where s.id = bookings.session_id and st.user_id = (select auth.uid()))
  );
-- Sin INSERT para nadie vía API: todas las altas pasan por book_class().
-- Staff puede corregir estados (no_show, etc.).
create policy bookings_staff_update on public.bookings for update to authenticated
  using ((select private.has_permission(org_id, 'bookings.manage')))
  with check ((select private.has_permission(org_id, 'bookings.manage')));
revoke insert, delete on public.bookings from authenticated;

create policy checkins_select on public.checkins for select to authenticated
  using ((select private.has_permission(org_id, 'checkins.manage'))
         or member_id in (select private.actable_member_ids()));
revoke insert, update, delete on public.checkins from authenticated;   -- solo checkin_scan()

-- =====================================================================
-- Entrenamiento  ←— el ejemplo más claro de "two-sided"
-- =====================================================================
create policy exercises_select on public.exercises for select to authenticated
  using (org_id is null or org_id in (select private.my_org_ids()));
create policy exercises_write on public.exercises for all to authenticated
  using (org_id is not null and (select private.staff_id(org_id)) is not null
         and ((select private.has_permission(org_id, 'training.manage_all'))
              or exists (select 1 from public.staff s where s.org_id = exercises.org_id
                          and s.user_id = (select auth.uid()) and s.role = 'trainer' and s.active)))
  with check (org_id is not null and (select private.staff_id(org_id)) is not null
         and ((select private.has_permission(org_id, 'training.manage_all'))
              or exists (select 1 from public.staff s where s.org_id = exercises.org_id
                          and s.user_id = (select auth.uid()) and s.role = 'trainer' and s.active)));

-- Programas: el autor (trainer) y training.manage_all escriben; el cliente
-- solo LEE los programas que tiene asignados.
create policy programs_select on public.workout_programs for select to authenticated
  using (author_id = (select private.staff_id(org_id))
         or (select private.has_permission(org_id, 'training.manage_all'))
         or (is_template and exists (select 1 from public.staff s where s.org_id = workout_programs.org_id
                                      and s.user_id = (select auth.uid()) and s.role = 'trainer' and s.active))
         or exists (select 1 from public.program_assignments pa
                     where pa.program_id = workout_programs.id
                       and pa.member_id in (select private.actable_member_ids())));
create policy programs_write on public.workout_programs for all to authenticated
  using (author_id = (select private.staff_id(org_id)) or (select private.has_permission(org_id, 'training.manage_all')))
  with check (author_id = (select private.staff_id(org_id)) or (select private.has_permission(org_id, 'training.manage_all')));

create policy program_workouts_select on public.program_workouts for select to authenticated
  using (exists (select 1 from public.workout_programs p where p.id = program_id));   -- hereda RLS de workout_programs
create policy program_workouts_write on public.program_workouts for all to authenticated
  using (exists (select 1 from public.workout_programs p where p.id = program_id
                  and (p.author_id = (select private.staff_id(p.org_id))
                       or (select private.has_permission(p.org_id, 'training.manage_all')))))
  with check (exists (select 1 from public.workout_programs p where p.id = program_id
                  and (p.author_id = (select private.staff_id(p.org_id))
                       or (select private.has_permission(p.org_id, 'training.manage_all')))));

create policy program_exercises_select on public.program_exercises for select to authenticated
  using (exists (select 1 from public.program_workouts w where w.id = workout_id));
create policy program_exercises_write on public.program_exercises for all to authenticated
  using (exists (select 1 from public.program_workouts w join public.workout_programs p on p.id = w.program_id
                  where w.id = workout_id
                    and (p.author_id = (select private.staff_id(p.org_id))
                         or (select private.has_permission(p.org_id, 'training.manage_all')))))
  with check (exists (select 1 from public.program_workouts w join public.workout_programs p on p.id = w.program_id
                  where w.id = workout_id
                    and (p.author_id = (select private.staff_id(p.org_id))
                         or (select private.has_permission(p.org_id, 'training.manage_all')))));

-- Asignaciones: el TRAINER asigna solo a SUS alumnos; el CLIENTE solo lee.
create policy assignments_select on public.program_assignments for select to authenticated
  using (member_id in (select private.actable_member_ids())
         or member_id in (select private.my_client_ids())
         or (select private.has_permission(org_id, 'training.manage_all')));
create policy assignments_trainer_write on public.program_assignments for all to authenticated
  using ((member_id in (select private.my_client_ids()) and trainer_id = (select private.staff_id(org_id)))
         or (select private.has_permission(org_id, 'training.manage_all')))
  with check ((member_id in (select private.my_client_ids()) and trainer_id = (select private.staff_id(org_id)))
              or (select private.has_permission(org_id, 'training.manage_all')));

-- Registros: el CLIENTE escribe; el TRAINER solo lee (no puede "inventar" progreso).
create policy workout_logs_select on public.workout_logs for select to authenticated
  using (member_id in (select private.actable_member_ids())
         or member_id in (select private.my_client_ids())
         or (select private.has_permission(org_id, 'training.manage_all')));
create policy workout_logs_member_write on public.workout_logs for all to authenticated
  using (member_id in (select private.actable_member_ids()))
  with check (member_id in (select private.actable_member_ids()));

create policy set_logs_select on public.set_logs for select to authenticated
  using (exists (select 1 from public.workout_logs l where l.id = workout_log_id));  -- hereda
create policy set_logs_member_write on public.set_logs for all to authenticated
  using (exists (select 1 from public.workout_logs l where l.id = workout_log_id
                  and l.member_id in (select private.actable_member_ids())))
  with check (exists (select 1 from public.workout_logs l where l.id = workout_log_id
                  and l.member_id in (select private.actable_member_ids())));

create policy body_metrics_select on public.body_metrics for select to authenticated
  using (member_id in (select private.actable_member_ids())
         or member_id in (select private.my_client_ids())
         or (select private.has_permission(org_id, 'training.manage_all')));
create policy body_metrics_member_write on public.body_metrics for all to authenticated
  using (member_id in (select private.actable_member_ids()))
  with check (member_id in (select private.actable_member_ids()));

-- =====================================================================
-- Automatizaciones
-- =====================================================================
create policy workflows_manage on public.automation_workflows for all to authenticated
  using ((select private.has_permission(org_id, 'automations.manage')))
  with check ((select private.has_permission(org_id, 'automations.manage')));
create policy steps_manage on public.automation_steps for all to authenticated
  using ((select private.has_permission(org_id, 'automations.manage')))
  with check ((select private.has_permission(org_id, 'automations.manage')));
create policy runs_read on public.automation_runs for select to authenticated
  using ((select private.has_permission(org_id, 'automations.manage')));
revoke insert, update, delete on public.automation_runs from authenticated;

-- =====================================================================
-- Funciones: nada ejecutable por defecto; se habilita explícitamente
-- =====================================================================
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.book_class(uuid, uuid, uuid, text, boolean),
  public.cancel_booking(uuid),
  public.get_checkin_token(uuid, uuid),
  public.checkin_scan(uuid, text, uuid, public.checkin_method),
  public.create_organization(text, text, text)
  to authenticated;
grant execute on function public.enqueue_inactivity_events() to service_role;
grant select on public.class_sessions_availability to authenticated;

-- private.*: authenticated necesita EXECUTE porque las políticas se evalúan
-- con sus permisos; el schema no está expuesto por la API.
revoke execute on all functions in schema private from public, anon;
grant execute on function private.staff_id(uuid), private.has_permission(uuid, text),
  private.my_org_ids(), private.actable_member_ids(), private.is_payer(uuid), private.my_client_ids()
  to authenticated;
revoke execute on function private.qr_signature(uuid, bigint),
  private.resolve_membership_for_class(uuid, uuid, uuid, timestamptz, text),
  private.promote_waitlist(uuid) from authenticated;

-- =====================================================================
-- Storage (bucket `media` de la v1): fotos de socios, videos, imágenes
-- =====================================================================
-- Ruta esperada: <org_id>/<carpeta>/<archivo>. Se compara como texto para
-- que un nombre mal formado no rompa la política con un error de cast.
create or replace function private.my_staff_org_texts() returns setof text
language sql stable security definer set search_path = '' as $$
  select org_id::text from public.staff where user_id = auth.uid() and active
$$;
revoke execute on function private.my_staff_org_texts() from public, anon;
grant execute on function private.my_staff_org_texts() to authenticated;

create policy "media: staff escribe su org" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] in (select private.my_staff_org_texts()));
create policy "media: staff actualiza su org" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] in (select private.my_staff_org_texts()));
create policy "media: staff borra su org" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] in (select private.my_staff_org_texts()));
