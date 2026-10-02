import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { HeartPulse } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { daysUntil, fmtDate } from '@/features/admin/format'
import { WhatsAppComposer, type ComposerStudent } from '@/features/admin/WhatsAppComposer'
import { normalizeArPhone } from '@/features/admin/whatsapp'

export const metadata: Metadata = { title: 'Alumnos' }

export default async function StudentsPage({ params }: PageProps<'/[org]/admin/alumnos'>) {
  const { org: slug } = await params
  const ctx = (await getAdminContext(slug))!
  const manageAll = ctx.can('training.manage_all')
  if (ctx.staff.role !== 'trainer' && !manageAll) return <p className="text-sm text-zinc-400">Esta sección es para profesores.</p>

  const supabase = await createClient()
  let q = supabase
    .from('coach_client_overview')
    .select('member_id, member_name, phone, medical_notes, last_checkin_at, trainer_id, trainer_name, last_workout_at, workouts_30d, program_name')
    .eq('org_id', ctx.org.id)
    .order('member_name')
  if (!manageAll) q = q.eq('trainer_id', ctx.staff.id)
  const { data: rows } = await q

  const students: ComposerStudent[] = (rows ?? []).map((r) => {
    const idle = daysUntil(r.last_workout_at)
    return {
      id: r.member_id!,
      name: r.member_name ?? 'Alumno',
      phone: normalizeArPhone(r.phone),
      stale: idle === null || idle < -7,
      hasProgram: !!r.program_name,
    }
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-white">{manageAll ? 'Alumnos con profesor' : 'Mis alumnos'}</h1>
        <p className="text-sm text-zinc-400">
          {manageAll
            ? 'Para asignar un profesor, entrá a la ficha del socio.'
            : 'Recepción o administración te asignan alumnos desde la ficha de cada socio.'}
        </p>
      </div>
      {students.length > 0 && <WhatsAppComposer slug={slug} senderName={ctx.staff.display_name} students={students} />}
      {rows?.length ? (
        <ul className="divide-y divide-zinc-900 overflow-hidden rounded-2xl border border-zinc-800/80">
          {rows.map((r) => {
            const idle = daysUntil(r.last_workout_at)
            const stale = idle === null || idle < -7
            return (
              <li key={r.member_id} className="bg-black">
                <Link href={`/${slug}/admin/alumnos/${r.member_id}` as Route} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-zinc-950">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-semibold text-white">
                      {r.member_name}
                      {r.medical_notes && <HeartPulse className="h-3.5 w-3.5 text-amber-300" aria-label="Tiene notas médicas" />}
                    </span>
                    <span className="block text-xs text-zinc-500">
                      {r.program_name ? `Rutina: ${r.program_name}` : 'Sin rutina asignada'}
                      {manageAll && r.trainer_name ? ` · Prof. ${r.trainer_name}` : ''}
                    </span>
                  </span>
                  <span className="text-right text-xs">
                    <span className={`block tabular-nums ${stale ? 'text-amber-200' : 'text-zinc-300'}`}>
                      {r.workouts_30d ?? 0} entrenos en 30 días
                    </span>
                    <span className="text-zinc-500">último {fmtDate(r.last_workout_at)}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          Todavía no hay alumnos asignados.
        </p>
      )}
    </div>
  )
}
