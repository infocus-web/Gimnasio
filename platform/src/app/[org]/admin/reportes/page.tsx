import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { MessageCircle } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { fmtDate, formatMoney } from '@/features/admin/format'
import { CheckinHeatmap, MonthlyBars } from '@/features/admin/ReportCharts'
import { Card } from '@/features/admin/ui'

export const metadata: Metadata = { title: 'Reportes' }

interface Report {
  months: { month: string; revenue_cents: number; payments: number; signups: number; lapsed: number; visits: number }[]
  active_members: number
  with_plan: number
  overdue: number
  mrr_cents: number
  plans: { name: string; members: number }[]
  heatmap: { dow: number; hour: number; n: number }[]
  occupancy: { name: string; color: string; sessions: number; avg_pct: number; attended_pct: number | null }[]
  at_risk: { id: string; name: string; phone: string | null; last_checkin_at: string | null; plan: string }[]
}

export default async function ReportsPage({ params }: PageProps<'/[org]/admin/reportes'>) {
  const { org: slug } = await params
  const ctx = (await getAdminContext(slug))!
  if (!ctx.can('reports.read')) return <p className="text-sm text-zinc-400">No tenés permiso para ver reportes.</p>

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('org_report', { p_org: ctx.org.id, p_months: 12 })
  if (error || !data) return <p className="text-sm text-red-300">No se pudo cargar el reporte.</p>
  const r = data as unknown as Report
  const cur = r.months.at(-1)
  const prev = r.months.at(-2)
  const delta = cur && prev && prev.revenue_cents ? Math.round(((cur.revenue_cents - prev.revenue_cents) / prev.revenue_cents) * 100) : null

  const tiles = [
    { label: 'Cobrado este mes', value: formatMoney(cur?.revenue_cents ?? 0), sub: delta === null ? '' : `${delta >= 0 ? '+' : ''}${delta}% vs. mes anterior` },
    { label: 'Ingreso mensual recurrente', value: formatMoney(r.mrr_cents), sub: 'cuotas vigentes' },
    { label: 'Socios con plan vigente', value: String(r.with_plan), sub: `${r.active_members} fichas activas` },
    { label: 'Vencidos', value: String(r.overdue), sub: 'cuentas sin renovar' },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-white">Reportes</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4">
            <p className="text-xs text-zinc-400">{t.label}</p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums text-white">{t.value}</p>
            {t.sub && <p className="text-xs text-zinc-500">{t.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MonthlyBars data={r.months as unknown as Record<string, number | string>[]} valueKey="revenue_cents" title="Ingresos por mes" money />
        <MonthlyBars data={r.months as unknown as Record<string, number | string>[]} valueKey="visits" title="Entradas al gimnasio por mes" />
        <MonthlyBars data={r.months as unknown as Record<string, number | string>[]} valueKey="signups" title="Altas de socios por mes" />
        <MonthlyBars data={r.months as unknown as Record<string, number | string>[]} valueKey="lapsed" title="Bajas (no renovaron) por mes" color="#a1a1aa" />
      </div>

      <Card title="¿Cuándo viene la gente?">
        <CheckinHeatmap cells={r.heatmap} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Ocupación de clases (8 semanas)">
          {r.occupancy.length ? (
            <ul className="space-y-3">
              {r.occupancy.map((o) => (
                <li key={o.name} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 text-zinc-200">
                      <span className="h-3 w-3 rounded-sm" style={{ background: o.color }} aria-hidden="true" />
                      {o.name}
                    </span>
                    <span className="text-xs text-zinc-500">
                      <strong className="text-sm tabular-nums text-white">{o.avg_pct}%</strong> lleno · {o.sessions} clases
                      {o.attended_pct !== null && ` · asistió ${o.attended_pct}%`}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-zinc-900" role="presentation">
                    <div className="h-full rounded-full bg-[#edcc36]" style={{ width: `${Math.min(100, o.avg_pct)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">Todavía no hay clases dadas en las últimas 8 semanas.</p>
          )}
        </Card>

        <Card title="Socios por plan">
          {r.plans.length ? (
            <ul className="space-y-2">
              {r.plans.map((p) => (
                <li key={p.name} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-200">{p.name}</span>
                  <span className="tabular-nums font-semibold text-white">{p.members}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">Todavía no hay planes vigentes.</p>
          )}
        </Card>
      </div>

      <Card title={`En riesgo de abandonar (${r.at_risk.length})`}>
        <p className="mb-3 text-xs text-zinc-500">Tienen el plan pago pero hace más de 10 días que no vienen. Un mensaje a tiempo los recupera.</p>
        {r.at_risk.length ? (
          <ul className="divide-y divide-zinc-900">
            {r.at_risk.map((m) => {
              const digits = (m.phone ?? '').replace(/\D/g, '')
              const wa = digits.length >= 8
                ? `https://wa.me/${digits.startsWith('54') ? digits : `549${digits.replace(/^0/, '')}`}?text=${encodeURIComponent(`Hola ${m.name.split(' ')[0]}! Te extrañamos en ${ctx.org.name} 💪 ¿Todo bien? Te esperamos esta semana.`)}`
                : null
              return (
                <li key={m.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <Link href={`/${slug}/admin/socios/${m.id}` as Route} className="font-semibold text-white hover:text-[#edcc36]">
                      {m.name}
                    </Link>
                    <span className="block text-xs text-zinc-500">
                      {m.plan} · última entrada {fmtDate(m.last_checkin_at)}
                    </span>
                  </span>
                  {wa && (
                    <a href={wa} target="_blank" rel="noreferrer" aria-label={`Escribirle a ${m.name} por WhatsApp`}
                      className="grid h-10 w-10 place-items-center rounded-xl border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10">
                      <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">Nadie en riesgo por ahora. 🎉</p>
        )}
      </Card>
    </div>
  )
}
