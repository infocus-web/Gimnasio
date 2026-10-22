import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { Lock, Package } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, todayYMD } from '@/features/admin/format'
import { InfoTip } from '@/components/InfoTip'
import { fmtPct } from '@/features/payments/profit'

export const metadata: Metadata = { title: 'Ganancias' }

const YMD = /^\d{4}-\d{2}-\d{2}$/

function addDays(ymd: string, days: number) {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function fmtDay(ymd: string) {
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${ymd}T12:00:00Z`))
}

export default async function GananciasPage({ params, searchParams }: PageProps<'/[org]/admin/pagos/ganancias'>) {
  const { org: slug } = await params
  const sp = await searchParams
  const ctx = await getAdminContext(slug)
  if (!ctx) return null
  if (ctx.staff.role !== 'owner' && ctx.staff.role !== 'admin') {
    return <p className="text-sm text-zinc-400">Solo el dueño o un administrador ve las ganancias.</p>
  }

  const tz = ctx.org.timezone
  const today = todayYMD(tz)
  const monthStart = `${today.slice(0, 8)}01`
  const prevMonthEnd = addDays(monthStart, -1)
  const presets = [
    { key: 'hoy', label: 'Hoy', from: today, to: today },
    { key: '7d', label: 'Últimos 7 días', from: addDays(today, -6), to: today },
    { key: 'mes', label: 'Este mes', from: monthStart, to: today },
    { key: 'mes-ant', label: 'Mes pasado', from: `${prevMonthEnd.slice(0, 8)}01`, to: prevMonthEnd },
  ]
  const preset = presets.find((p) => p.key === sp.p)
  let from = preset?.from ?? (typeof sp.desde === 'string' && YMD.test(sp.desde) ? sp.desde : monthStart)
  let to = preset?.to ?? (typeof sp.hasta === 'string' && YMD.test(sp.hasta) ? sp.hasta : today)
  if (to < from) [from, to] = [to, from]
  const activeKey = preset?.key ?? (!sp.desde && !sp.hasta ? 'mes' : null)

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('product_profit_report', { p_org: ctx.org.id, p_from: from, p_to: to })
  const rows = (data ?? []).map((r) => ({
    id: r.product_id,
    name: r.name,
    units: Number(r.units),
    revenue: Number(r.revenue_cents),
    cost: Number(r.cost_cents),
    profit: Number(r.profit_cents),
    unitsNoCost: Number(r.units_no_cost),
    revenueNoCost: Number(r.revenue_no_cost),
  }))
  const revenue = rows.reduce((a, r) => a + r.revenue, 0)
  const revenueNoCost = rows.reduce((a, r) => a + r.revenueNoCost, 0)
  const revenueWithCost = revenue - revenueNoCost
  const cost = rows.reduce((a, r) => a + r.cost, 0)
  const profit = rows.reduce((a, r) => a + r.profit, 0)
  const units = rows.reduce((a, r) => a + r.units, 0)
  const maxProfit = Math.max(1, ...rows.map((r) => r.profit))
  const base = `/${slug}/admin/pagos/ganancias`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Solo productos del mostrador · lo ven solo el dueño y los administradores
          <InfoTip label="Cómo se calcula">
            <p><strong>Ganancia</strong> = lo vendido − lo que te costó. Usa el costo que tenía cada producto <strong>el día de la venta</strong>.</p>
            <p><strong>Margen</strong> = ganancia ÷ lo vendido: de cada peso que cobraste, cuánto te quedó.</p>
            <p><strong>% del total</strong>: cuánto pesa cada producto en lo vendido y en la ganancia del período.</p>
            <p>Las ventas anuladas no cuentan. Lo vendido antes de cargar el costo aparece aparte y no suma ganancia.</p>
          </InfoTip>
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {presets.map((p) => (
          <Link
            key={p.key}
            href={`${base}?p=${p.key}` as Route}
            aria-current={activeKey === p.key ? 'page' : undefined}
            className={`inline-flex min-h-[40px] items-center rounded-xl border px-3 text-sm font-semibold ${
              activeKey === p.key ? 'border-[#edcc36] bg-[#edcc36]/10 text-white' : 'border-zinc-800 text-zinc-300 hover:border-zinc-600'
            }`}
          >
            {p.label}
          </Link>
        ))}
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-zinc-400">
            Desde
            <input type="date" name="desde" defaultValue={from} max={today} className="mt-1 block min-h-[40px] rounded-xl border border-zinc-800 bg-black px-2 text-sm text-white" />
          </label>
          <label className="text-xs text-zinc-400">
            Hasta
            <input type="date" name="hasta" defaultValue={to} max={today} className="mt-1 block min-h-[40px] rounded-xl border border-zinc-800 bg-black px-2 text-sm text-white" />
          </label>
          <button type="submit" className="min-h-[40px] rounded-xl border border-zinc-700 px-3 text-sm font-semibold text-zinc-200 hover:border-[#edcc36]/60">
            Ver
          </button>
        </form>
      </div>

      <p className="text-sm text-zinc-400">
        {from === to ? fmtDay(from) : `Del ${fmtDay(from)} al ${fmtDay(to)}`}
      </p>

      {error ? (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
          {error.message.includes('RANGE_TOO_LONG') ? 'Elegí un período de hasta un año.' : 'No se pudo armar el reporte. Probá de nuevo.'}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'Vendido', value: formatMoney(revenue), sub: `${units} ${units === 1 ? 'unidad' : 'unidades'}` },
              { label: 'Costo', value: formatMoney(cost), sub: revenueNoCost ? 'de lo que tiene costo' : null },
              { label: 'Ganancia', value: formatMoney(profit), sub: null, strong: true },
              { label: 'Margen', value: fmtPct(revenueWithCost > 0 ? profit / revenueWithCost : null), sub: 'ganancia ÷ vendido' },
            ].map((k) => (
              <div key={k.label} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
                <dt className="text-xs text-zinc-500">{k.label}</dt>
                <dd className={`text-xl font-extrabold tabular-nums ${k.strong ? (profit < 0 ? 'text-red-300' : 'text-emerald-300') : 'text-white'}`}>{k.value}</dd>
                {k.sub && <dd className="text-[11px] text-zinc-500">{k.sub}</dd>}
              </div>
            ))}
          </dl>

          {revenueNoCost > 0 && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              {formatMoney(revenueNoCost)} se vendieron cuando el producto todavía no tenía costo cargado: no suman a la ganancia ni al
              margen. Cargá el costo en Productos para que las próximas ventas cuenten.
            </p>
          )}

          {rows.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">No hubo ventas de productos en este período.</p>
          ) : (
            <section aria-labelledby="por-producto" className="space-y-2">
              <h2 id="por-producto" className="text-sm font-bold uppercase tracking-wide text-zinc-300">
                Por producto <span className="font-normal normal-case text-zinc-500">· ordenado por lo que más ganancia deja</span>
              </h2>
              <div className="hidden grid-cols-[minmax(0,2fr)_repeat(6,minmax(0,1fr))] gap-3 px-4 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 lg:grid">
                <span>Producto</span>
                <span className="text-right">Unidades</span>
                <span className="text-right">Vendido</span>
                <span className="text-right">Ganancia</span>
                <span className="text-right">Margen</span>
                <span className="text-right">% vendido</span>
                <span className="text-right">% ganancia</span>
              </div>
              <ul className="space-y-2">
                {rows.map((r) => {
                  const withCost = r.revenue - r.revenueNoCost
                  const margin = withCost > 0 ? r.profit / withCost : null
                  const shareRev = revenue > 0 ? r.revenue / revenue : null
                  const shareProfit = profit > 0 && r.profit > 0 ? r.profit / profit : null
                  return (
                    <li key={r.id ?? r.name} className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4 lg:grid lg:grid-cols-[minmax(0,2fr)_repeat(6,minmax(0,1fr))] lg:items-center lg:gap-3 lg:py-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-semibold text-white">
                          <Package className="h-4 w-4 shrink-0 text-zinc-600" aria-hidden="true" />
                          <span className="truncate">{r.name}</span>
                        </p>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-900" aria-hidden="true">
                          <div className="h-full rounded-full bg-[#edcc36]" style={{ width: `${Math.max(0, (r.profit / maxProfit) * 100)}%` }} />
                        </div>
                        {r.unitsNoCost > 0 && (
                          <p className="mt-1 text-[11px] text-amber-200">
                            {r.unitsNoCost} {r.unitsNoCost === 1 ? 'vendida' : 'vendidas'} sin costo cargado
                          </p>
                        )}
                      </div>
                      <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-sm sm:grid-cols-6 lg:contents">
                        {[
                          ['Unidades', String(r.units)],
                          ['Vendido', formatMoney(r.revenue)],
                          ['Ganancia', formatMoney(r.profit)],
                          ['Margen', fmtPct(margin)],
                          ['% vendido', fmtPct(shareRev)],
                          ['% ganancia', fmtPct(shareProfit)],
                        ].map(([label, value]) => (
                          <div key={label} className="lg:text-right">
                            <dt className="text-[11px] text-zinc-500 lg:sr-only">{label}</dt>
                            <dd className={`font-semibold tabular-nums ${label === 'Ganancia' ? (r.profit < 0 ? 'text-red-300' : 'text-emerald-300') : 'text-white'}`}>
                              {value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
