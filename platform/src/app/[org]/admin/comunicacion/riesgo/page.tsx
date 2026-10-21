import type { Metadata } from 'next'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { RiskList } from '@/features/engagement/RiskList'
import { markContacted } from '@/features/engagement/actions'
import type { RiskRow } from '@/features/engagement/shared'

export const metadata: Metadata = { title: 'En riesgo de abandonar' }

export default async function RiesgoPage({ params }: PageProps<'/[org]/admin/comunicacion/riesgo'>) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx || !ctx.can('members.write')) return null

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('engagement_at_risk', { p_org: ctx.org.id, p_limit: 150 })
  if (error) {
    return (
      <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
        No pudimos calcular la lista. Recargá la página en un rato.
      </p>
    )
  }
  const rows = ((data ?? []) as unknown as RiskRow[]).map((r) => ({ ...r, mark: markContacted.bind(null, slug, r.member_id) }))

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        Socios activos con el plan al día que <strong className="text-zinc-200">no vienen hace 7 días o más</strong>, o que{' '}
        <strong className="text-zinc-200">bajaron mucho la frecuencia</strong> (últimas 2 semanas contra las 4 anteriores). Los
        más urgentes, arriba. Escribiles por WhatsApp y marcalos como contactados: salen de la lista por 14 días.
      </p>
      <p className="text-xs text-zinc-500">{rows.length === 1 ? '1 socio' : `${rows.length} socios`} en la lista</p>
      <RiskList rows={rows} slug={slug} gym={ctx.org.name} tz={ctx.org.timezone} />
    </div>
  )
}
