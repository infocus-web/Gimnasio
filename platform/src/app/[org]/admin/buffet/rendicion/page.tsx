import type { Metadata } from 'next'
import { Trash2 } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { fmtDate, todayYMD } from '@/features/admin/format'
import { Card } from '@/features/admin/ui'
import { ConfirmAction } from '@/features/admin/ConfirmAction'
import { buffetDb } from '@/features/buffet/data'
import { addBuffetPayout, deleteBuffetPayout } from '@/features/buffet/actions'
import { PayoutForm } from '@/features/buffet/AdminForms'
import { MissingMigration, NoAccess, isMissingTable } from '@/features/buffet/admin-shared'
import { PAID_VIA_LABEL, money } from '@/features/buffet/types'

export const metadata: Metadata = { title: 'Buffet · Rendición' }
export const dynamic = 'force-dynamic'

const YMD = /^\d{4}-\d{2}-\d{2}$/

interface Report {
  by_method: Record<string, number>
  orders: number
  delivered: number
  top_items: { name: string; qty: number; total_cents: number }[]
  online_total_all: number
  payouts_total_all: number
}

export default async function BuffetReportPage({ params, searchParams }: PageProps<'/[org]/admin/buffet/rendicion'>) {
  const { org: slug } = await params
  const sp = await searchParams
  const ctx = await getAdminContext(slug)
  if (!ctx) return null
  if (!ctx.can('buffet.manage') && !ctx.can('billing.read')) return <NoAccess />
  const today = todayYMD(ctx.org.timezone)
  const from = typeof sp.desde === 'string' && YMD.test(sp.desde) ? sp.desde : `${today.slice(0, 8)}01`
  const to = typeof sp.hasta === 'string' && YMD.test(sp.hasta) ? sp.hasta : today
  const db = await buffetDb()
  const [rep, pay] = await Promise.all([
    db.rpc('buffet_report', { p_org: ctx.org.id, p_from: from, p_to: to }),
    db.from('buffet_payouts').select('id, amount_cents, paid_on, note').eq('org_id', ctx.org.id).order('paid_on', { ascending: false }).limit(30),
  ])
  if (isMissingTable(pay.error) || /buffet_report/.test(rep.error?.message ?? '')) return <MissingMigration />
  const r = (rep.data ?? { by_method: {}, orders: 0, delivered: 0, top_items: [], online_total_all: 0, payouts_total_all: 0 }) as Report
  const payouts = (pay.data ?? []) as { id: string; amount_cents: number; paid_on: string; note: string | null }[]
  const total = Object.values(r.by_method).reduce((a, b) => a + Number(b), 0)
  const balance = Number(r.online_total_all) - Number(r.payouts_total_all)
  const canPay = ctx.can('billing.write')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Rendición del buffet</h1>
        <p className="text-sm text-zinc-400">
          Lo que los socios pagan online entra al Mercado Pago del gimnasio. Acá se ve cuánto es y cuánto ya se le pasó al buffet. Lo cobrado al retirar
          queda en el buffet.
        </p>
      </div>

      <div className={`rounded-2xl border p-5 ${balance > 0 ? 'border-[#edcc36]/50 bg-[#edcc36]/10' : 'border-[#444] bg-[#2c2c2c]'}`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Saldo a pasarle al buffet</p>
        <p className="text-4xl font-extrabold tabular-nums text-white">{money(Math.max(0, balance))}</p>
        <p className="mt-1 text-xs text-zinc-400">
          Cobrado online en total: {money(Number(r.online_total_all))} · Ya pasado: {money(Number(r.payouts_total_all))}
          {balance < 0 && ` · Se le pasó ${money(-balance)} de más`}
        </p>
        <p className="mt-1 text-xs text-zinc-500">Montos brutos: no descuenta la comisión de Mercado Pago.</p>
      </div>

      <Card title="Período">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-zinc-400">Desde<input type="date" name="desde" defaultValue={from} className="ml-2 min-h-[40px] rounded-lg border border-[#444] bg-[#1a1a1a] px-2 text-sm text-white" /></label>
          <label className="text-xs text-zinc-400">Hasta<input type="date" name="hasta" defaultValue={to} className="ml-2 min-h-[40px] rounded-lg border border-[#444] bg-[#1a1a1a] px-2 text-sm text-white" /></label>
          <button className="min-h-[40px] rounded-lg border border-zinc-700 px-3 text-xs font-semibold text-zinc-200 hover:border-[#edcc36]/60">Ver</button>
        </form>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[#444] bg-black/30 p-3">
            <p className="text-xs text-zinc-400">Pedidos</p>
            <p className="text-2xl font-extrabold text-white">{r.orders}</p>
            <p className="text-xs text-zinc-500">{r.delivered} entregados</p>
          </div>
          <div className="rounded-xl border border-[#444] bg-black/30 p-3 sm:col-span-2">
            <p className="text-xs text-zinc-400">Cobrado</p>
            <p className="text-2xl font-extrabold tabular-nums text-white">{money(total)}</p>
            <p className="text-xs text-zinc-500">
              {Object.entries(r.by_method).map(([k, v]) => `${PAID_VIA_LABEL[k] ?? k}: ${money(Number(v))}`).join(' · ') || 'Sin cobros en el período'}
            </p>
          </div>
        </div>
        {r.top_items.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Lo más pedido</p>
            <ol className="space-y-1 text-sm">
              {r.top_items.map((t) => (
                <li key={t.name} className="flex justify-between gap-2 text-zinc-300">
                  <span>{t.qty} × {t.name}</span>
                  <span className="tabular-nums text-zinc-500">{money(Number(t.total_cents))}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Card>

      <Card title="Pagos al buffet">
        {canPay ? (
          <PayoutForm action={addBuffetPayout.bind(null, slug)} today={today} />
        ) : (
          <p className="text-xs text-zinc-500">Los registra el administrador del gimnasio cuando le pasa la plata.</p>
        )}
        {payouts.length > 0 ? (
          <ul className="mt-4 divide-y divide-[#444] border-t border-[#444]">
            {payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span>
                  <span className="font-semibold tabular-nums text-white">{money(p.amount_cents)}</span>
                  <span className="ml-2 text-zinc-400">{fmtDate(p.paid_on)}</span>
                  {p.note && <span className="block text-xs text-zinc-500">{p.note}</span>}
                </span>
                {canPay && (
                  <ConfirmAction action={deleteBuffetPayout.bind(null, slug, p.id)} variant="icon" ariaLabel="Borrar registro" confirmText="Se borra este pago." yesLabel="Sí, borrar" className="flex flex-col items-end gap-1">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </ConfirmAction>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-zinc-500">Todavía no se registraron pagos al buffet.</p>
        )}
      </Card>
    </div>
  )
}
