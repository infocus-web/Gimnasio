import type { Metadata } from 'next'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { fmtDateTime, formatMoney } from '@/features/admin/format'
import { Card } from '@/features/admin/ui'
import { METHOD_LABELS } from '@/features/admin/PaymentForms'
import { closeShift } from '@/features/payments/actions'
import { CloseShiftForm } from '@/features/payments/CloseShiftForm'

export const metadata: Metadata = { title: 'Cierre de caja' }

type Totals = Record<string, { payments: number; sales: number; total: number; count: number }>

export default async function CierrePage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx) return null
  const canClose = ctx.can('billing.write')
  const canSeeAll = ctx.can('billing.read')
  if (!canClose && !canSeeAll) return <p className="text-sm text-zinc-400">No tenés permiso.</p>
  const tz = ctx.org.timezone

  const supabase = await createClient()
  const [summary, history] = await Promise.all([
    canClose ? supabase.rpc('cash_shift_summary', { p_org: ctx.org.id }) : Promise.resolve({ data: null, error: null }),
    supabase
      .from('cash_closures')
      .select('id, staff_name, period_from, period_to, totals, total_cents, expected_cash_cents, counted_cash_cents, difference_cents, note, created_at')
      .eq('org_id', ctx.org.id)
      .order('created_at', { ascending: false })
      .limit(60),
  ])
  const s = summary.data as { from: string; to: string; totals: Totals } | null
  const totals = Object.entries(s?.totals ?? {}).sort(([a], [b]) => (a === 'cash' ? -1 : b === 'cash' ? 1 : a.localeCompare(b)))
  const shiftTotal = totals.reduce((acc, [, v]) => acc + Number(v.total), 0)
  const expectedCash = Number(s?.totals?.cash?.total ?? 0)

  return (
    <div className="space-y-5">
      {canClose && s && (
        <Card title="Mi turno">
          <p className="mb-3 text-sm text-zinc-400">
            Lo que cobraste vos desde <span className="font-semibold text-white">{fmtDateTime(s.from, tz)}</span>
            {' '}(cuotas + ventas). Los pagos online por Mercado Pago no cuentan: no pasan por tu caja.
          </p>
          {totals.length ? (
            <div className="mb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-zinc-500">
                    <th scope="col" className="py-2 pr-3 font-medium">Medio</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Cuotas</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Ventas</th>
                    <th scope="col" className="py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {totals.map(([m, v]) => (
                    <tr key={m} className={m === 'cash' ? 'text-white' : 'text-zinc-300'}>
                      <th scope="row" className="py-2 pr-3 text-left font-semibold">{METHOD_LABELS[m] ?? m}</th>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(Number(v.payments))}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(Number(v.sales))}</td>
                      <td className="py-2 text-right font-bold tabular-nums">{formatMoney(Number(v.total))}</td>
                    </tr>
                  ))}
                  <tr className="text-white">
                    <th scope="row" className="py-2 pr-3 text-left font-bold">Total del turno</th>
                    <td colSpan={3} className="py-2 text-right text-lg font-extrabold tabular-nums">{formatMoney(shiftTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mb-4 rounded-xl border border-dashed border-zinc-800 p-4 text-center text-sm text-zinc-500">
              No registraste cobros ni ventas en este turno.
            </p>
          )}
          <div className="mb-4 rounded-xl border border-[#edcc36]/30 bg-[#edcc36]/5 p-3">
            <p className="text-xs text-zinc-400">Efectivo que tendría que haber en la caja</p>
            <p className="text-2xl font-extrabold tabular-nums text-white">{formatMoney(expectedCash)}</p>
          </div>
          <CloseShiftForm action={closeShift.bind(null, slug, s.to)} expectedCashCents={expectedCash} />
        </Card>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-300">
          {canSeeAll ? 'Historial de cierres' : 'Mis cierres'}
        </h2>
        {history.data?.length ? (
          <ul className="space-y-2">
            {history.data.map((c) => {
              const diff = Number(c.difference_cents)
              const t = (c.totals ?? {}) as Totals
              return (
                <li key={c.id}
                  className={`rounded-2xl border p-4 ${diff === 0 ? 'border-zinc-800/80 bg-zinc-950' : diff < 0 ? 'border-red-500/50 bg-red-950/30' : 'border-amber-400/40 bg-amber-950/20'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-white">{c.staff_name ?? 'Sin nombre'}</p>
                      <p className="text-xs text-zinc-500">
                        {fmtDateTime(c.period_from, tz)} → {fmtDateTime(c.period_to, tz)}
                      </p>
                    </div>
                    <span className={`rounded-lg px-2 py-1 text-xs font-bold ${diff === 0 ? 'bg-emerald-500/10 text-emerald-300' : diff < 0 ? 'bg-red-500/15 text-red-200' : 'bg-amber-400/15 text-amber-100'}`}>
                      {diff === 0 ? 'Justa' : `${diff < 0 ? 'Faltante' : 'Sobrante'} ${formatMoney(Math.abs(diff))}`}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                    <div><dt className="text-zinc-500">Total del turno</dt><dd className="font-semibold tabular-nums text-white">{formatMoney(Number(c.total_cents))}</dd></div>
                    <div><dt className="text-zinc-500">Efectivo esperado</dt><dd className="tabular-nums text-zinc-200">{formatMoney(Number(c.expected_cash_cents))}</dd></div>
                    <div><dt className="text-zinc-500">Efectivo contado</dt><dd className="tabular-nums text-zinc-200">{formatMoney(Number(c.counted_cash_cents))}</dd></div>
                    <div>
                      <dt className="text-zinc-500">Otros medios</dt>
                      <dd className="tabular-nums text-zinc-200">
                        {Object.entries(t).filter(([m]) => m !== 'cash').map(([m, v]) => `${METHOD_LABELS[m] ?? m} ${formatMoney(Number(v.total))}`).join(' · ') || '—'}
                      </dd>
                    </div>
                  </dl>
                  {c.note && <p className="mt-2 text-xs text-zinc-400">“{c.note}”</p>}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">Todavía no hay cierres de caja.</p>
        )}
      </section>
    </div>
  )
}
