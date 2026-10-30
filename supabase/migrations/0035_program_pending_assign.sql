-- =====================================================================
-- 0035 · Rutinas "pendientes de asignar"
--   Al crear una rutina el profe puede elegir para quién es (uno, varios
--   o todos sus alumnos). No se asigna en ese momento (la rutina todavía
--   está vacía): se guarda la intención para
--     · dejar esos alumnos marcados en el armador, y
--     · mostrar "Falta asignar" en la lista hasta que la asigne o descarte.
--   Las políticas de workout_programs (autor o training.manage_all) ya
--   cubren estas columnas: no hace falta RLS nueva.
-- =====================================================================

alter table public.workout_programs
  add column if not exists pending_member_ids uuid[] not null default '{}',
  add column if not exists pending_for_all boolean not null default false;

comment on column public.workout_programs.pending_member_ids is
  'Alumnos elegidos al crear la rutina que todavía no se asignaron (se vacía al asignar o descartar).';
comment on column public.workout_programs.pending_for_all is
  'El profe eligió "todos mis alumnos" al crear la rutina y todavía no la asignó.';
