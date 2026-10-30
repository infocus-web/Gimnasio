-- =====================================================================
-- 0034 · Herramientas de profesores
--   1) Una rutina en borrador (sugerida por la IA) no se puede asignar
--      a un alumno hasta que el profe la aprueba. Lo controla la base:
--      no depende de que la pantalla esconda el borrador.
--   2) Una rutina que ya está asignada no puede volver a "borrador".
-- =====================================================================

create or replace function private.assignment_not_draft() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.workout_programs p where p.id = new.program_id and p.is_draft) then
    raise exception 'PROGRAM_IS_DRAFT' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists program_assignments_not_draft on public.program_assignments;
create trigger program_assignments_not_draft
  before insert or update of program_id on public.program_assignments
  for each row execute function private.assignment_not_draft();

create or replace function private.program_draft_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_draft and not old.is_draft and exists (
       select 1 from public.program_assignments a where a.program_id = new.id and a.status = 'active') then
    raise exception 'PROGRAM_HAS_ASSIGNMENTS' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists workout_programs_draft_guard on public.workout_programs;
create trigger workout_programs_draft_guard
  before update of is_draft on public.workout_programs
  for each row execute function private.program_draft_guard();

revoke execute on function private.assignment_not_draft() from public, anon, authenticated;
revoke execute on function private.program_draft_guard() from public, anon, authenticated;
