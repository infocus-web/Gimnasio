import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { daysUntil, fmtDate, planState } from '@/features/admin/format'
import { classVars, normalizeArPhone } from '@/features/admin/whatsapp'
import { loadTemplates } from '@/features/admin/templates'
import { TrainerMembers, type TrainerMemberRow } from '@/features/admin/TrainerMembers'

export const metadata: Metadata = { title: 'Control de socios' }

const RANGES = [30, 60, 90] as const

/** Control de socios del profe: quién viene a sus clases, cómo está su plan y cuánto falta */
export default async function TrainerMembersPage({ params, searchParams }: PageProps<'/[org]/admin/mis-clases/socios'>) {
  const { org: slug } = await params
  const sp = await searchParams
  const ctx = await getAdminContext(slug)
  if (!ctx) return null
  const days = RANGES.find((d) => String(d) === sp.dias) ?? 60
  const tz = ctx.org.timezone

  const supabase = await createClient()
  const [{ data, error }, templates] = await Promise.all([
    supabase.rpc('trainer_members', { p_org: ctx.org.id, p_days: days }),
    loadTemplates(ctx.org.id, ctx.staff.id),
  ])
  if (error) {
    console.error('[mis-clases/socios]', error.message)
    return <p className="text-sm text-red-300">No se pudo cargar la lista. Probá de nuevo en un rato.</p>
  }

  const rows: TrainerMemberRow[] = (data ?? []).map((r) => {
    const state = planState({ membership_status: r.membership_status, current_period_end: r.current_period_end, status: r.member_status })
    const left = daysUntil(r.current_period_end)
    const away = r.last_checkin_at ? Math.max(0, Math.floor((Date.now() - new Date(r.last_checkin_at).getTime()) / 86_400_000)) : null
    const next = r.next_class_at ? classVars(r.next_class_name ?? 'Clase', r.next_class_at, tz) : null
    const tags = [
      ...(r.next_class_at ? ['proxima'] : []),
      ...(state === 'vencido' || state === 'sin_plan' ? ['vencido'] : []),
      ...(state === 'por_vencer' ? ['por_vencer'] : []),
      ...(r.no_shows >= 2 ? ['faltas'] : []),
      ...(away === null || away > 14 ? ['ausente'] : []),
      ...(r.is_my_client ? ['alumno'] : []),
    ]
    return {
      id: r.member_id,
      name: r.member_name,
      phone: normalizeArPhone(r.phone),
      medical: !!r.medical_notes,
      state,
      planName: r.plan_name,
      planNote: r.current_period_end && left !== null ? `${left < 0 ? 'venció' : 'vence'} ${fmtDate(r.current_period_end, tz)}` : null,
      attended: r.attended,
      noShows: r.no_shows,
      pending: r.pending_marks,
      daysAway: away,
      nextClass: next ? `${next.dia} ${next.hora} · ${next.clase}` : null,
      isClient: r.is_my_client,
      tags,
    }
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">
          Los que vinieron o están anotados a tus clases (y tus alumnos asignados): estado del plan, asistencia y faltas.
        </p>
        <nav aria-label="Período" className="flex gap-1.5">
          {RANGES.map((d) => (
            <Link
              key={d}
              href={`/${slug}/admin/mis-clases/socios?dias=${d}` as Route}
              aria-current={d === days ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${d === days ? 'bg-[#edcc36] text-black' : 'bg-[#333] text-zinc-300 hover:text-white'}`}
            >
              {d} días
            </Link>
          ))}
        </nav>
      </div>
      <TrainerMembers slug={slug} senderName={ctx.staff.display_name} templates={templates} rows={rows} days={days} />
    </div>
  )
}
