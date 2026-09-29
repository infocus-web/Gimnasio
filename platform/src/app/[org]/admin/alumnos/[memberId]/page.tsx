import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata, Route } from 'next'
import { ArrowLeft, HeartPulse, Trophy } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { assignProgram } from '@/features/admin/coach-actions'
import { AssignProgramForm } from '@/features/admin/CoachForms'
import { fmtDate, fmtDateTime, todayYMD } from '@/features/admin/format'
import { Card } from '@/features/admin/ui'

export const metadata: Metadata = { title: 'Alumno' }

export default async function StudentPage({ params }: PageProps<'/[org]/admin/alumnos/[memberId]'>) {
  const { org: slug, memberId } = await params
  const ctx = (await getAdminContext(slug))!
  const supabase = await createClient()

  const { data: s } = await supabase
    .from('coach_client_overview')
    .select('*')
    .eq('member_id', memberId)
    .eq('org_id', ctx.org.id)
    .maybeSingle()
  if (!s) notFound()

  const [{ data: logs }, { data: metrics }, { data: programs }, { data: assignment }] = await Promise.all([
    supabase
      .from('workout_logs')
      .select('id, performed_at, duration_min, effort_rpe, notes, program_workouts(name), set_logs(exercise_id, set_number, reps, weight_kg, exercises(name))')
      .eq('member_id', memberId)
      .order('performed_at', { ascending: false })
      .limit(10),
    supabase.from('body_metrics').select('measured_at, weight_kg, body_fat_pct').eq('member_id', memberId).order('measured_at', { ascending: false }).limit(6),
    supabase.from('workout_programs').select('id, name').eq('org_id', ctx.org.id).order('name'),
    supabase
      .from('program_assignments')
      .select('program_id, starts_on, workout_programs(name)')
      .eq('member_id', memberId)
      .eq('status', 'active')
      .order('starts_on', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  type SetRow = { exercise_id: string; set_number: number; reps: number | null; weight_kg: number | null; exercises: { name: string } | null }
  // Mejores marcas: mayor peso por ejercicio en los últimos 10 entrenos
  const best = new Map<string, { name: string; kg: number; reps: number | null }>()
  for (const l of logs ?? []) {
    for (const set of (l.set_logs ?? []) as unknown as SetRow[]) {
      if (!set.weight_kg) continue
      const cur = best.get(set.exercise_id)
      if (!cur || Number(set.weight_kg) > cur.kg) best.set(set.exercise_id, { name: set.exercises?.name ?? '', kg: Number(set.weight_kg), reps: set.reps })
    }
  }

  return (
    <div className="space-y-5">
      <Link href={`/${slug}/admin/alumnos` as Route} className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Alumnos
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold text-white">{s.member_name}</h1>
        <p className="text-sm text-zinc-400">
          Última entrada al gimnasio {fmtDate(s.last_checkin_at)} · {s.workouts_30d ?? 0} entrenos en 30 días
        </p>
      </div>
      {s.medical_notes && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          <HeartPulse className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {s.medical_notes}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card title="Rutina">
            {assignment ? (
              <p className="mb-3 text-sm text-zinc-300">
                Actual:{' '}
                <Link href={`/${slug}/admin/rutinas/${assignment.program_id}` as Route} className="font-semibold text-[#edcc36]">
                  {(assignment.workout_programs as unknown as { name: string } | null)?.name}
                </Link>{' '}
                desde {fmtDate(assignment.starts_on)}
              </p>
            ) : (
              <p className="mb-3 text-sm text-zinc-500">Todavía no tiene rutina asignada.</p>
            )}
            <AssignProgramForm
              action={assignProgram.bind(null, slug, memberId)}
              programs={programs ?? []}
              current={assignment?.program_id ?? null}
              today={todayYMD(ctx.org.timezone)}
            />
          </Card>

          <Card title="Últimos entrenamientos">
            {logs?.length ? (
              <ul className="space-y-4">
                {logs.map((l) => {
                  const sets = (l.set_logs ?? []) as unknown as SetRow[]
                  const byEx = new Map<string, SetRow[]>()
                  for (const x of sets) byEx.set(x.exercise_id, [...(byEx.get(x.exercise_id) ?? []), x])
                  return (
                    <li key={l.id} className="rounded-xl border border-zinc-900 p-3">
                      <p className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="font-semibold text-white">{(l.program_workouts as unknown as { name: string } | null)?.name ?? 'Entrenamiento libre'}</span>
                        <span className="text-xs tabular-nums text-zinc-500">{fmtDateTime(l.performed_at)}</span>
                      </p>
                      <ul className="mt-2 space-y-1 text-xs text-zinc-400">
                        {[...byEx.values()].map((rows) => (
                          <li key={rows[0]!.exercise_id}>
                            <span className="text-zinc-200">{rows[0]!.exercises?.name}</span>:{' '}
                            {rows
                              .sort((a, b) => a.set_number - b.set_number)
                              .map((r) => `${r.reps ?? '–'}${r.weight_kg ? `×${r.weight_kg}kg` : ''}`)
                              .join(' · ')}
                          </li>
                        ))}
                      </ul>
                      {l.notes && <p className="mt-2 text-xs italic text-zinc-500">“{l.notes}”</p>}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500">Todavía no registró entrenamientos en la app.</p>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Mejores marcas">
            {best.size ? (
              <ul className="space-y-2 text-sm">
                {[...best.values()]
                  .sort((a, b) => b.kg - a.kg)
                  .map((b) => (
                    <li key={b.name} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-zinc-200">
                        <Trophy className="h-3.5 w-3.5 text-[#edcc36]" aria-hidden="true" /> {b.name}
                      </span>
                      <span className="tabular-nums font-semibold text-white">
                        {b.kg} kg{b.reps ? ` × ${b.reps}` : ''}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500">Sin registros de peso todavía.</p>
            )}
          </Card>
          <Card title="Medidas">
            {metrics?.length ? (
              <ul className="space-y-1.5 text-sm">
                {metrics.map((m) => (
                  <li key={m.measured_at} className="flex justify-between gap-2">
                    <span className="tabular-nums text-zinc-400">{fmtDate(m.measured_at)}</span>
                    <span className="tabular-nums text-white">
                      {m.weight_kg ? `${m.weight_kg} kg` : ''}
                      {m.body_fat_pct ? ` · ${m.body_fat_pct}% grasa` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500">El alumno carga sus medidas desde la app (Progreso).</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
