import type { Metadata } from 'next'
import { Search } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { todayYMD, fmtTime } from '@/features/admin/format'
import { Card, inputClass } from '@/features/admin/ui'
import { buffetDb } from '@/features/buffet/data'
import { updateBuffetOrder } from '@/features/buffet/actions'
import { AutoRefresh, OrderActions } from '@/features/buffet/AdminForms'
import { DayChips, MissingMigration, NoAccess, addDays, isMissingTable } from '@/features/buffet/admin-shared'
import { ORDER_SELECT, ORDER_STATUS_UI, PAID_VIA_LABEL, money, type OrderRow } from '@/features/buffet/types'

export const metadata: Metadata = { title: 'Buffet · Pedidos' }
export const dynamic = 'force-dynamic'

const YMD = /^\d{4}-\d{2}-\d{2}$/
const STALE_MS = 30 * 60_000

export default async function BuffetOrdersPage({ params, searchParams }: PageProps<'/[org]/admin/buffet'>) {
  const { org: slug } = await params
  const sp = await searchParams
  const ctx = await getAdminContext(slug)
  if (!ctx) return null
  if (!ctx.can('buffet.manage')) return <NoAccess />

  const today = todayYMD(ctx.org.timezone)
  const day = typeof sp.dia === 'string' && YMD.test(sp.dia) ? sp.dia : today
  const code = typeof sp.codigo === 'string' ? sp.codigo.replace(/\D/g, '').slice(0, 4) : ''
  const db = await buffetDb()
  const { data, error } = await db
    .from('buffet_orders')
    .select(ORDER_SELECT)
    .eq('org_id', ctx.org.id)
    .eq('pickup_date', day)
    .order('created_at')
  if (isMissingTable(error)) return <MissingMigration />
  const all = (data ?? []) as OrderRow[]
  const now = Date.now()
  const abandoned = (o: OrderRow) => o.status === 'pending_payment' && now - Date.parse(o.created_at) > STALE_MS
  const shown = code ? all.filter((o) => o.pickup_code === code) : all
  const pending = shown.filter((o) => ['confirmed', 'ready'].includes(o.status) || (o.status === 'pending_payment' && !abandoned(o)))
  const done = shown.filter((o) => o.status === 'delivered')
  const other = shown.filter((o) => o.status === 'cancelled' || abandoned(o))

  // Lo que hay que preparar para ese día (pedidos todavía no entregados)
  const prep = new Map<string, number>()
  for (const o of all.filter((o) => ['confirmed', 'ready'].includes(o.status) || (o.status === 'pending_payment' && !abandoned(o)))) {
    for (const it of o.buffet_order_items) prep.set(it.name, (prep.get(it.name) ?? 0) + it.quantity)
  }
  const cobrado = all.filter((o) => o.paid_at && o.status !== 'cancelled').reduce((s, o) => s + o.total_cents, 0)
  const base = `/${slug}/admin/buffet`
  const days = [-1, 0, 1, 2, 3, 4, 5, 6].map((n) => addDays(today, n))
  if (!days.includes(day)) days.push(day)

  const act = (id: string, a: string) => updateBuffetOrder.bind(null, slug, id, a)

  const OrderCard = ({ o }: { o: OrderRow }) => (
    <li className="space-y-3 rounded-2xl border border-[#444] bg-[#2c2c2c] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-2xl font-extrabold tracking-[0.15em] text-[#edcc36]">{o.pickup_code}</p>
          <p className="truncate font-semibold text-white">{o.member_name}</p>
          <p className="text-xs text-zinc-400">Pidió a las {fmtTime(o.created_at, ctx.org.timezone)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${ORDER_STATUS_UI[o.status].className}`}>
            {abandoned(o) ? 'Pago no completado' : o.status === 'pending_payment' ? 'Pagando online…' : ORDER_STATUS_UI[o.status].label}
          </span>
          <span className={`text-xs font-semibold ${o.paid_at ? 'text-emerald-300' : 'text-amber-300'}`}>
            {o.refunded_at ? 'Devuelto' : o.paid_at ? `Pagado · ${PAID_VIA_LABEL[o.paid_via ?? ''] ?? ''}` : 'Cobra al entregar'}
          </span>
        </div>
      </div>
      <ul className="space-y-0.5 text-sm">
        {o.buffet_order_items.map((it, i) => (
          <li key={i} className="flex justify-between gap-2 text-zinc-200">
            <span><strong className="text-white">{it.quantity} ×</strong> {it.name}</span>
            <span className="tabular-nums text-zinc-500">{money(it.subtotal_cents, o.currency)}</span>
          </li>
        ))}
      </ul>
      {o.note && <p className="rounded-lg bg-black/40 px-3 py-2 text-xs text-amber-100">“{o.note}”</p>}
      {o.cancel_reason && o.status === 'cancelled' && <p className="text-xs text-red-300">{o.cancel_reason}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#444] pt-3">
        <span className="text-lg font-extrabold tabular-nums text-white">{money(o.total_cents, o.currency)}</span>
        <OrderActions
          status={o.status}
          paid={!!o.paid_at}
          ready={act(o.id, 'ready')}
          deliver={act(o.id, 'deliver')}
          cancel={act(o.id, 'cancel')}
          undo={act(o.id, 'undo_deliver')}
        />
      </div>
    </li>
  )

  return (
    <div className="space-y-5">
      <AutoRefresh />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Pedidos del buffet</h1>
          <p className="text-sm text-zinc-400">Se actualiza solo cada 30 segundos. El socio muestra su código de 4 números al retirar.</p>
        </div>
        <form method="get" className="flex items-center gap-2" role="search">
          <input type="hidden" name="dia" value={day} />
          <label className="relative">
            <span className="sr-only">Buscar por código</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
            <input name="codigo" defaultValue={code} inputMode="numeric" maxLength={4} placeholder="Código" className={`${inputClass} w-36 pl-9 font-mono`} />
          </label>
        </form>
      </div>

      <DayChips base={base} days={days.sort()} current={day} today={today} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#444] bg-[#2c2c2c] p-4">
          <p className="text-xs text-zinc-400">Por entregar</p>
          <p className="text-3xl font-extrabold text-white">{pending.length}</p>
        </div>
        <div className="rounded-2xl border border-[#444] bg-[#2c2c2c] p-4">
          <p className="text-xs text-zinc-400">Entregados</p>
          <p className="text-3xl font-extrabold text-white">{done.length}</p>
        </div>
        <div className="rounded-2xl border border-[#444] bg-[#2c2c2c] p-4">
          <p className="text-xs text-zinc-400">Cobrado (online + al retirar)</p>
          <p className="text-3xl font-extrabold tabular-nums text-white">{money(cobrado)}</p>
        </div>
      </div>

      {prep.size > 0 && (
        <Card title="Para preparar">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[...prep.entries()].sort((a, b) => b[1] - a[1]).map(([name, q]) => (
              <li key={name} className="flex items-center gap-3 rounded-xl border border-[#444] bg-black/30 px-3 py-2">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#edcc36] text-base font-extrabold text-black">{q}</span>
                <span className="text-sm font-semibold text-white">{name}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {code && !shown.length && <p className="text-sm text-zinc-400">No hay pedidos con el código {code} para ese día.</p>}

      <section aria-labelledby="pend" className="space-y-3">
        <h2 id="pend" className="text-sm font-bold uppercase tracking-wide text-zinc-300">Por entregar</h2>
        {pending.length ? (
          <ul className="grid gap-3 lg:grid-cols-2">{pending.map((o) => <OrderCard key={o.id} o={o} />)}</ul>
        ) : (
          <p className="text-sm text-zinc-500">No hay pedidos pendientes para este día.</p>
        )}
      </section>

      {done.length > 0 && (
        <details className="rounded-2xl border border-[#444] bg-[#2c2c2c]/50 p-4">
          <summary className="cursor-pointer text-sm font-bold uppercase tracking-wide text-zinc-300">Entregados ({done.length})</summary>
          <ul className="mt-3 grid gap-3 lg:grid-cols-2">{done.map((o) => <OrderCard key={o.id} o={o} />)}</ul>
        </details>
      )}
      {other.length > 0 && (
        <details className="rounded-2xl border border-[#444] bg-[#2c2c2c]/50 p-4">
          <summary className="cursor-pointer text-sm font-bold uppercase tracking-wide text-zinc-500">Cancelados o sin pagar ({other.length})</summary>
          <ul className="mt-3 grid gap-3 lg:grid-cols-2">{other.map((o) => <OrderCard key={o.id} o={o} />)}</ul>
        </details>
      )}
    </div>
  )
}
