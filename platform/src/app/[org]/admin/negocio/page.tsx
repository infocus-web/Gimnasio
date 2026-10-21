import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { AlertTriangle } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, todayYMD } from '@/features/admin/format'
import { Card, inputClass } from '@/features/admin/ui'
import { Delta, Heatmap, Kpi, PeakVsClasses, PlanBars, WeekdayBars } from '@/features/floor/DashboardCharts'
import { fmtShort, resolvePeriod, type PeriodKey } from '@/features/floor/period'
import type { Dashboard } from '@/features/floor/types'

export const metadata: Metadata = { title: 'Negocio' }

const TABS: { key: PeriodKey; label: string }[] = [
  { key: 'mes', label: 'Este mes' },
  { key: 'anterior', label: 'Mes pasado' },
  { key: '90', label: 'Últimos 90 días' },
  { key: 'custom', label: 'Personalizado' },
]

const n = (v: number) => new Intl.NumberFormat('es-AR').format(v)

export default async function BusinessPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx) return null // sin sesión de staff: el layout ya muestra el aviso
  if (!ctx.can('reports.read')) return <p className="text-sm text-zinc-400">No tenés permiso para ver los números del negocio.</p>

  const today = todayYMD(ctx.org.timezone)
  const period = resolvePeriod(today, await searchParams)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('business_dashboard', {
    p_org: ctx.org.id,
    p_from: period.from,
    p_to: period.to,
    p_prev_from: period.prevFrom,
    p_prev_to: period.prevTo,
  })
  const base = `/${slug}/admin/negocio`

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Negocio</h1>
        <p className="text-sm text-zinc-400">Cómo viene el gimnasio: plata, socios y movimiento.</p>
      </div>

      <nav aria-label="Período" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`${base}${t.key === 'mes' ? '' : `?p=${t.key}`}` as Route}
            aria-current={period.key === t.key ? 'page' : undefined}
            className={`inline-flex min-h-[44px] items-center rounded-xl border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36] ${
              period.key === t.key ? 'border-[#edcc36] bg-[#edcc36] text-black' : 'border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:text-white'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {period.key === 'custom' && (
        <form method="get" action={base} className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4">
          <input type="hidden" name="p" value="custom" />
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-400">Desde</span>
            <input type="date" name="desde" defaultValue={period.from} max={today} className={`${inputClass} w-44`} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-400">Hasta</span>
            <input type="date" name="hasta" defaultValue={period.to} max={today} className={`${inputClass} w-44`} />
          </label>
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center rounded-xl bg-[#edcc36] px-5 text-sm font-bold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Ver
          </button>
          <p className="w-full text-xs text-zinc-500">Hasta 1 año. Se compara con la misma cantidad de días justo antes.</p>
        </form>
      )}

      {error || !data ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> No pudimos cargar los números. Recargá la página en un momento.
        </p>
      ) : (
        <DashboardBody d={data as unknown as Dashboard} slug={slug} />
      )}
    </div>
  )
}

function DashboardBody({ d, slug }: { d: Dashboard; slug: string }) {
  const c = d.current
  const p = d.previous
  return (
    <>
      <p className="text-sm text-zinc-400">
        Del <strong className="text-zinc-200">{fmtShort(d.period.from)}</strong> al <strong className="text-zinc-200">{fmtShort(d.period.to)}</strong>
        <span className="text-zinc-500">
          {' '}
          · comparado con {fmtShort(d.period.prev_from)} al {fmtShort(d.period.prev_to)}
        </span>
      </p>

      <section aria-label="Resumen" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Ingresos por cuotas" value={formatMoney(c.revenue_cents)} delta={<Delta cur={c.revenue_cents} prev={p.revenue_cents} />} sub={`${n(c.payments)} cobros`} />
        <Kpi
          label="Socios activos"
          value={n(c.active_members)}
          delta={<Delta cur={c.active_members} prev={p.active_members} />}
          sub="al final del período"
        />
        <Kpi label="Altas" value={n(c.new_members)} delta={<Delta cur={c.new_members} prev={p.new_members} />} sub="primer pago" />
        <Kpi label="Bajas" value={n(c.lapsed)} delta={<Delta cur={c.lapsed} prev={p.lapsed} inverse />} sub="vencieron y no renovaron en 10 días" />
        <Kpi
          label="Renovación"
          value={c.renewal_pct == null ? '—' : `${c.renewal_pct}%`}
          delta={<Delta cur={c.renewal_pct} prev={p.renewal_pct} unit="pts" />}
          sub={c.renewal_due ? `${n(c.renewed)} de ${n(c.renewal_due)} cuotas que vencían` : 'no vencieron cuotas'}
        />
        <Kpi label="Ticket promedio" value={c.ticket_cents == null ? '—' : formatMoney(c.ticket_cents)} delta={<Delta cur={c.ticket_cents} prev={p.ticket_cents} />} />
        <Kpi label="Entradas" value={n(c.entries)} delta={<Delta cur={c.entries} prev={p.entries} />} sub={`${n(c.unique_visitors)} socios distintos`} />
        <Kpi
          label="Deuda"
          value={formatMoney(d.debt.open_cents)}
          sub={d.debt.accounts ? `${n(d.debt.accounts)} ${d.debt.accounts === 1 ? 'cuenta morosa' : 'cuentas morosas'} (hoy)` : 'nadie debe (hoy)'}
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Ingreso por plan">
          <PlanBars rows={d.by_plan} />
        </Card>
        <Card title="Entradas por día de la semana">
          <WeekdayBars heatmap={d.heatmap} />
        </Card>
      </div>

      <Card title="¿A qué hora viene la gente?">
        <Heatmap heatmap={d.heatmap} />
      </Card>

      <Card title="Horas pico vs. clases programadas">
        <PeakVsClasses heatmap={d.heatmap} slots={d.class_slots} days={d.period.days} />
      </Card>

      {d.debt.list.length > 0 && (
        <Card title="Quiénes deben">
          <ul className="divide-y divide-zinc-900">
            {d.debt.list.map((m) => (
              <li key={m.member_id}>
                <Link
                  href={`/${slug}/admin/socios/${m.member_id}` as Route}
                  className="flex min-h-[44px] items-center justify-between gap-3 py-2 text-sm hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
                >
                  <span className="text-zinc-200">{m.name}</span>
                  <span className="tabular-nums text-red-200">{m.open_cents ? formatMoney(m.open_cents) : 'cuota vencida'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <details className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4 text-sm text-zinc-400">
        <summary className="min-h-[44px] cursor-pointer content-center font-semibold text-zinc-300">¿Cómo se calcula cada número?</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Ingresos: cobros de cuotas acreditados en el período (no incluye ventas de mostrador ni cobros anulados).</li>
          <li>Socios activos: personas con un plan vigente el último día del período (o hoy, si el período no terminó).</li>
          <li>Altas: cuentas que hicieron su primer pago en el período.</li>
          <li>Bajas: cuentas cuyo plan venció en el período y pasaron 10 días sin renovar.</li>
          <li>Renovación: de las cuotas que vencían en el período, cuántas se renovaron dentro de los 10 días.</li>
          <li>Deuda: cuentas marcadas con pago pendiente hoy y lo que tienen facturado sin pagar.</li>
        </ul>
      </details>
    </>
  )
}
