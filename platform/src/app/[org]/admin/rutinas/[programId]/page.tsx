import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata, Route } from 'next'
import { ArrowLeft, ArrowDown, ArrowUp, Trash2, PlayCircle } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import {
  addProgramExercise,
  addWorkoutDay,
  deleteProgramExercise,
  deleteWorkoutDay,
  moveProgramExercise,
  renameWorkoutDay,
  updateProgram,
} from '@/features/admin/coach-actions'
import { AddDayForm, AddExerciseForm, ProgramForm, RenameDayForm } from '@/features/admin/CoachForms'
import { Card } from '@/features/admin/ui'

export const metadata: Metadata = { title: 'Armar rutina' }

export default async function ProgramBuilder({ params }: PageProps<'/[org]/admin/rutinas/[programId]'>) {
  const { org: slug, programId } = await params
  const ctx = (await getAdminContext(slug))!
  const supabase = await createClient()
  const { data: program } = await supabase
    .from('workout_programs')
    .select('id, name, goal, level, description, author_id')
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

  return (
    <div className="space-y-5">
      <Link href={`/${slug}/admin/rutinas` as Route} className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Rutinas
      </Link>
      <h1 className="text-2xl font-extrabold text-white">{program.name}</h1>

      {canEdit ? (
        <details className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-300">Datos de la rutina</summary>
          <div className="mt-4">
            <ProgramForm action={updateProgram.bind(null, slug, programId)} values={program} submitLabel="Guardar" />
          </div>
        </details>
      ) : (
        <p className="text-sm text-zinc-500">Esta rutina es de otro profesor: podés verla y asignarla, pero no editarla.</p>
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
                <form action={deleteWorkoutDay.bind(null, slug, programId, d.id)}>
                  <button type="submit" className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-red-300">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Borrar día
                  </button>
                </form>
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
                        <form action={deleteProgramExercise.bind(null, slug, programId, r.id)}>
                          <button type="submit" aria-label={`Quitar ${r.exercises?.name ?? 'ejercicio'}`} className="grid h-9 w-9 place-items-center rounded-lg text-zinc-500 hover:bg-red-500/10 hover:text-red-300">
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </form>
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
