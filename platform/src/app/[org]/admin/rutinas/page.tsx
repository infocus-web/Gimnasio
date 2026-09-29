import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { Plus, PlayCircle, Dumbbell } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { createExercise, createProgram } from '@/features/admin/coach-actions'
import { LEVELS, NewExerciseForm, ProgramForm } from '@/features/admin/CoachForms'
import { Card } from '@/features/admin/ui'

export const metadata: Metadata = { title: 'Rutinas' }

export default async function ProgramsPage({ params }: PageProps<'/[org]/admin/rutinas'>) {
  const { org: slug } = await params
  const ctx = (await getAdminContext(slug))!
  if (ctx.staff.role !== 'trainer' && !ctx.can('training.manage_all')) {
    return <p className="text-sm text-zinc-400">Esta sección es para profesores.</p>
  }
  const supabase = await createClient()
  const [{ data: programs }, { data: assignments }, { data: exercises }] = await Promise.all([
    supabase
      .from('workout_programs')
      .select('id, name, goal, level, author_id, created_at, staff(display_name), program_workouts(id)')
      .eq('org_id', ctx.org.id)
      .order('created_at', { ascending: false }),
    supabase.from('program_assignments').select('program_id').eq('org_id', ctx.org.id).eq('status', 'active'),
    supabase.from('exercises').select('id, name, muscle_group, video_url').or(`org_id.eq.${ctx.org.id},org_id.is.null`).order('muscle_group').order('name'),
  ])
  const inUse = new Map<string, number>()
  for (const a of assignments ?? []) inUse.set(a.program_id, (inUse.get(a.program_id) ?? 0) + 1)

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-white">Rutinas</h1>

      <details className="rounded-2xl border border-dashed border-zinc-700 p-4 open:border-solid open:border-[#edcc36]/40">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-[#edcc36]">
          <Plus className="h-4 w-4" aria-hidden="true" /> Nueva rutina
        </summary>
        <div className="mt-4">
          <ProgramForm action={createProgram.bind(null, slug)} submitLabel="Crear y armar" />
        </div>
      </details>

      {programs?.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {programs.map((p) => {
            const author = p.staff as unknown as { display_name: string } | null
            const days = (p.program_workouts as unknown as { id: string }[] | null)?.length ?? 0
            return (
              <li key={p.id}>
                <Link href={`/${slug}/admin/rutinas/${p.id}` as Route}
                  className="block rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4 hover:border-[#edcc36]/50">
                  <p className="font-bold text-white">{p.name}</p>
                  <p className="text-xs text-zinc-500">
                    {[p.goal, p.level && LEVELS[p.level], `${days} ${days === 1 ? 'día' : 'días'}`, author && `por ${author.display_name}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <p className="mt-2 text-xs text-zinc-400">{inUse.get(p.id) ?? 0} alumnos la están usando</p>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">Todavía no hay rutinas. Creá la primera arriba.</p>
      )}

      <Card title={`Biblioteca de ejercicios (${exercises?.length ?? 0})`}>
        <details className="mb-4">
          <summary className="cursor-pointer text-sm font-semibold text-[#edcc36]">+ Nuevo ejercicio</summary>
          <div className="mt-3">
            <NewExerciseForm action={createExercise.bind(null, slug)} />
          </div>
        </details>
        <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {(exercises ?? []).map((e) => (
            <li key={e.id} className="flex items-center gap-2 py-1">
              <Dumbbell className="h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden="true" />
              <span className="truncate text-zinc-200">{e.name}</span>
              <span className="text-xs text-zinc-500">{e.muscle_group}</span>
              {e.video_url && (
                <a href={e.video_url} target="_blank" rel="noreferrer" aria-label={`Video de ${e.name}`} className="text-[#edcc36]">
                  <PlayCircle className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
