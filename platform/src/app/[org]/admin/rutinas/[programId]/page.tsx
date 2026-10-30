import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata, Route } from 'next'
import { ArrowLeft, ArrowDown, ArrowUp, Trash2, PlayCircle } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import {
  addProgramExercise,
  addWorkoutDay,
  assignProgramToMany,
  deleteProgram,
  discardPendingAssign,
  deleteProgramExercise,
  deleteWorkoutDay,
  moveProgramExercise,
  renameWorkoutDay,
  updateProgram,
} from '@/features/admin/coach-actions'
import { AddDayForm, AddExerciseForm, AssignToStudentsForm, ProgramForm, RenameDayForm } from '@/features/admin/CoachForms'
import { todayYMD } from '@/features/admin/format'
import { Card } from '@/features/admin/ui'
import { ActionButton, ConfirmAction } from '@/features/admin/ConfirmAction'
import { approveDraft } from '@/features/floor/actions'
import { DraftBanner } from '@/features/floor/DraftBanner'

export const metadata: Metadata = { title: 'Armar rutina' }

export default async function ProgramBuilder({ params }: PageProps<'/[org]/admin/rutinas/[programId]'>) {
  const { org: slug, programId } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx) return null // sin sesión de staff: el layout ya muestra el aviso
  const supabase = await createClient()
  const { data: program } = await supabase
    .from('workout_programs')
    .select('id, name, goal, level, description, author_id, is_draft, pending_member_ids, pending_for_all')
    .eq('id', programId)
    .eq('org_id', ctx.org.id)
    .maybeSingle()
  if (!program) notFound()

  const [{ data: days }, { data: exercises }] = await Promise.all([
    supabase
      .from('program_workouts')
      .select('id, day_index, name, program_exercises(id, position, target_sets, target_reps, target_weight_kg, rest_seconds, notes, exercises(name, muscle_group, video_url))')
      .eq('program_id', programId)
      .order('day_index'),
    supabase.from('exercises').select('id, name, muscle_group').or(`org_id.eq.${ctx.org.id},org_id.is.null`).order('name'),
  ])
  const canEdit = program.author_id === ctx.staff.id || ctx.can('training.manage_all')
  const manageAll = ctx.can('training.manage_all')
  const canAssign = ctx.staff.role === 'trainer' || manageAll

  // Alumnos a los que este profe puede asignarle la rutina
  let studentsQ = supabase
    .from('coach_client_overview')
    .select('member_id, member_name, program_name')
    .eq('org_id', ctx.org.id)
    .order('member_name')
  if (!manageAll) studentsQ = studentsQ.eq('trainer_id', ctx.staff.id)
  const [{ data: studentRows }, { data: current }] = canAssign
    ? await Promise.all([
        studentsQ,
        supabase.from('program_assignments').select('member_id').eq('org_id', ctx.org.id).eq('program_id', programId).eq('status', 'active'),
      ])
    : [{ data: null }, { data: null }]
  const withThis = new Set((current ?? []).map((r) => r.member_id as string))
  const students = (studentRows ?? []).map((r) => ({
    id: r.member_id as string,
    name: r.member_name ?? 'Alumno',
    programName: r.program_name ?? null,
    hasThis: withThis.has(r.member_id as string),
  }))
  // Alumnos elegidos al crear la rutina y todavía no asignados
  const pendingIds = new Set(program.pending_member_ids ?? [])
  const preselected = students.filter((s) => !s.hasThis && (program.pending_for_all || pendingIds.has(s.id))).map((s) => s.id)
  const hasPending = program.pending_for_all || pendingIds.size > 0
  const exerciseCount = (days ?? []).reduce((n, d) => n + ((d.program_exercises as unknown[] | null)?.length ?? 0), 0)

  return (
    <div className="space-y-5">
      <Link href={`/${slug}/admin/rutinas` as Route} className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Rutinas
      </Link>
      <h1 className="text-2xl font-extrabold text-white">{program.name}</h1>

      {program.is_draft && (
        <DraftBanner canEdit={canEdit} action={approveDraft.bind(null, slug, programId)} />
      )}

      {canEdit ? (
        <details className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-300">Datos de la rutina</summary>
          <div className="mt-4">
            <ProgramForm action={updateProgram.bind(null, slug, programId)} values={program} submitLabel="Guardar" />
          </div>
          <div className="mt-5 border-t border-zinc-800 pt-4">
            <ConfirmAction
              action={deleteProgram.bind(null, slug, programId)}
              confirmText="Se borra la rutina con todos sus días y ejercicios. No se puede deshacer."
              yesLabel="Sí, borrar rutina"
              variant="danger"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Borrar rutina
            </ConfirmAction>
          </div>
        </details>
      ) : (
        <p className="text-sm text-zinc-500">Esta rutina es de otro profesor: podés verla y asignarla, pero no editarla.</p>
      )}

      {canAssign && (
        <Card title={`Asignar a alumnos${withThis.size ? ` · la usan ${withThis.size}` : ''}`}>
          {hasPending && !program.is_draft && (
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[#edcc36]/30 bg-[#edcc36]/10 p-3 text-sm text-zinc-100">
              <p className="min-w-0 flex-1">
                <strong className="text-[#edcc36]">Falta asignar.</strong>{' '}
                {preselected.length
                  ? `Ya marcamos ${preselected.length === 1 ? 'el alumno que elegiste' : `los ${preselected.length} alumnos que elegiste`}. `
                  : ''}
                {exerciseCount === 0
                  ? 'Primero cargá los ejercicios de cada día (más abajo) y después tocá "Asignar".'
                  : 'Cuando la rutina esté lista, tocá "Asignar".'}
              </p>
              <ActionButton
                action={discardPendingAssign.bind(null, slug, programId)}
                className="min-h-[36px] text-xs text-zinc-400 underline-offset-2 hover:text-white hover:underline"
              >
                No asignar por ahora
              </ActionButton>
            </div>
          )}
          {program.is_draft ? (
            <p className="text-sm text-zinc-500">Es un borrador de la IA: revisalo y tocá "Aprobar" para poder asignarlo.</p>
          ) : (
            <AssignToStudentsForm
              action={assignProgramToMany.bind(null, slug, programId)}
              students={students}
              today={todayYMD(ctx.org.timezone)}
              initialPicked={preselected}
            />
          )}
        </Card>
      )}

      {(days ?? []).map((d) => {
        const rows = ((d.program_exercises ?? []) as unknown as {
          id: string
          position: number
          target_sets: number | null
          target_reps: string | null
          target_weight_kg: number | null
          rest_seconds: number | null
          notes: string | null
          exercises: { name: string; muscle_group: string | null; video_url: string | null } | null
        }[]).sort((a, b) => a.position - b.position)
        return (
          <Card
            key={d.id}
            title={`Día ${d.day_index}`}
            action={
              canEdit ? (
                <ConfirmAction
                  action={deleteWorkoutDay.bind(null, slug, programId, d.id)}
                  confirmText={rows.length ? `Se borra el día con sus ${rows.length} ejercicios.` : 'Se borra este día.'}
                  yesLabel="Sí, borrar día"
                  className="flex flex-col items-end gap-2"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Borrar día
                </ConfirmAction>
              ) : undefined
            }
          >
            {canEdit ? (
              <div className="mb-3">
                <RenameDayForm action={renameWorkoutDay.bind(null, slug, programId, d.id)} name={d.name} />
              </div>
            ) : (
              <p className="mb-3 font-bold text-white">{d.name}</p>
            )}
            {rows.length ? (
              <ol className="mb-4 divide-y divide-zinc-900">
                {rows.map((r, i) => (
                  <li key={r.id} className="flex items-center gap-3 py-2.5">
                    <span className="w-5 text-center text-xs tabular-nums text-zinc-500">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-semibold text-white">
                        {r.exercises?.name}
                        {r.exercises?.video_url && (
                          <a href={r.exercises.video_url} target="_blank" rel="noreferrer" aria-label="Ver video" className="text-[#edcc36]">
                            <PlayCircle className="h-4 w-4" aria-hidden="true" />
                          </a>
                        )}
                      </span>
                      <span className="block text-xs text-zinc-400">
                        {r.target_sets} × {r.target_reps}
                        {r.target_weight_kg ? ` · ${r.target_weight_kg} kg` : ''}
                        {r.rest_seconds ? ` · pausa ${r.rest_seconds}s` : ''}
                        {r.notes ? ` · ${r.notes}` : ''}
                      </span>
                    </span>
                    {canEdit && (
                      <span className="flex items-center gap-1">
                        <form action={moveProgramExercise.bind(null, slug, programId, d.id, r.id, -1)}>
                          <button type="submit" disabled={i === 0} aria-label="Subir" className="grid h-9 w-9 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-900 hover:text-white disabled:opacity-30">
                            <ArrowUp className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </form>
                        <form action={moveProgramExercise.bind(null, slug, programId, d.id, r.id, 1)}>
                          <button type="submit" disabled={i === rows.length - 1} aria-label="Bajar" className="grid h-9 w-9 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-900 hover:text-white disabled:opacity-30">
                            <ArrowDown className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </form>
                        <ActionButton
                          action={deleteProgramExercise.bind(null, slug, programId, r.id)}
                          ariaLabel={`Quitar ${r.exercises?.name ?? 'ejercicio'}`}
                          iconOnly
                          className="grid h-9 w-9 place-items-center rounded-lg text-zinc-500 hover:bg-red-500/10 hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </ActionButton>
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mb-4 text-sm text-zinc-500">Sin ejercicios todavía.</p>
            )}
            {canEdit && <AddExerciseForm action={addProgramExercise.bind(null, slug, programId, d.id)} exercises={exercises ?? []} />}
          </Card>
        )
      })}

      {canEdit && (days?.length ?? 0) < 7 && <AddDayForm action={addWorkoutDay.bind(null, slug, programId)} />}
    </div>
  )
}
