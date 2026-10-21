import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { ChevronLeft, ChevronRight, Lock, ShoppingCart } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { voidPayment } from '@/features/admin/billing-actions'
import { fmtTime, formatMoney, startOfToday, todayYMD } from '@/features/admin/format'
import { METHOD_LABELS, VoidPaymentForm } from '@/features/admin/PaymentForms'
import { voidSaleAction } from '@/features/payments/actions'
import { mpConfigured } from '@/features/payments/mercadopago'
import { MpNotice } from '@/features/payments/MpNotice'

export const metadata: Metadata = { title: 'Caja' }

function shiftDay(ymd: string, days: number) {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export default async function CajaPage({ params, searchParams }: PageProps<'/[org]/admin/pagos'>) {
  const { org: slug } = await params
  const sp = await searchParams
  const ctx = await getAdminContext(slug)
  if (!ctx) return null // sin sesión de staff: el layout ya muestra el aviso
  if (!ctx.can('billing.read')) return <p className="text-sm text-zinc-400">No tenés permiso para ver la caja.</p>

  const tz = ctx.org.timezone
  const today = todayYMD(tz)
  const day = typeof sp.dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.dia) ? sp.dia : today
  // Rango del día en la zona del gimnasio
  const offsetMs = Date.parse(`${today}T00:00:00Z`) - Date.parse(startOfToday(tz))
  const from = new Date(Date.parse(`${day}T00:00:00Z`) - offsetMs).toISOString()
  const to = new Date(Date.parse(`${shiftDay(day, 1)}T00:00:00Z`) - offsetMs).toISOString()

  const supabase = await createClient()
  const [{ data: payRows }, { data: saleRows }] = await Promise.all([
    supabase
      .from('payment_ledger')
      .select('id, paid_at, amount_cents, currency, provider, status, note, payer_member_id, payer_name, plan_name, recorded_by_name')
      .eq('org_id', ctx.org.id)
      .gte('paid_at', from)
      .lt('paid_at', to)
      .order('paid_at', { ascending: false }),
    supabase
      .from('sale_ledger')
      .select('id, sold_at, total_cents, method, status, note, member_id, member_name, sold_by_name, items_summary, void_reason')
      .eq('org_id', ctx.org.id)
      .gte('sold_at', from)
      .lt('sold_at', to)
      .order('sold_at', { ascending: false }),
  ])

  // Cuotas y ventas en una sola lista (la caja del día)
  type Row = {
    kind: 'payment' | 'sale'
    id: string
    at: string | null
    amount: number
    currency: string
    method: string
    ok: boolean
    who: string | null
    memberId: string | null
    detail: (string | null | false | undefined)[]
  }
  const rows: Row[] = [
    ...(payRows ?? []).map((r): Row => ({
      kind: 'payment', id: r.id!, at: r.paid_at, amount: Number(r.amount_cents), currency: r.currency ?? 'ARS',
      method: r.provider!, ok: r.status === 'succeeded', who: r.payer_name, memberId: r.payer_member_id,
      detail: [r.plan_name ?? 'Cuota', METHOD_LABELS[r.provider!] ?? r.provider, r.note,
        r.recorded_by_name ? `cobró ${r.recorded_by_name}` : r.provider === 'mercadopago' && 'pago online'],
    })),
    ...(saleRows ?? []).map((r): Row => ({
      kind: 'sale', id: r.id, at: r.sold_at, amount: Number(r.total_cents), currency: 'ARS',
      method: r.method, ok: r.status === 'completed', who: r.member_name, memberId: r.member_id,
      detail: [`Venta: ${r.items_summary ?? ''}`, METHOD_LABELS[r.method] ?? r.method, r.note, r.sold_by_name && `vendió ${r.sold_by_name}`,
        r.status !== 'completed' && r.void_reason && `anulada: ${r.void_reason}`],
    })),
  ].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))

  const ok = rows.filter((r) => r.ok)
  const total = ok.reduce((s, r) => s + r.amount, 0)
  const salesTotal = ok.filter((r) => r.kind === 'sale').reduce((s, r) => s + r.amount, 0)
  const byMethod = new Map<string, number>()
  for (const r of ok) byMethod.set(r.method, (byMethod.get(r.method) ?? 0) + r.amount)
  const label = new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(`${day}T12:00:00Z`),
  )
  const canVoid = ctx.can('billing.write')

  return (
    <div className="space-y-5">
      {canVoid && (
        <div className="flex flex-wrap gap-2">
          <Link href={`/${slug}/admin/pagos/vender` as Route}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#edcc36] px-4 text-sm font-bold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            <ShoppingCart className="h-4 w-4" aria-hidden="true" /> Vender
          </Link>
          <Link href={`/${slug}/admin/pagos/cierre` as Route}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-semibold text-zinc-200 hover:border-[#edcc36]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]">
            <Lock className="h-4 w-4" aria-hidden="true" /> Cerrar mi turno
          </Link>
        </div>
      )}
      {canVoid && !mpConfigured() && <MpNotice slug={slug} compact />}
      <div className="flex items-center justify-between gap-3">
        <Link href={`/${slug}/admin/pagos?dia=${shiftDay(day, -1)}` as Route} aria-label="Día anterior"
          className="grid h-11 w-11 place-items-center rounded-xl border border-zinc-800 text-zinc-300 hover:text-white">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div className="text-center">
          <p className="text-sm font-semibold capitalize text-white">{day === today ? `Hoy, ${label}` : label}</p>
          {day !== today && (
            <Link href={`/${slug}/admin/pagos` as Route} className="text-xs text-[#edcc36]">
              Volver a hoy
            </Link>
          )}
        </div>
        <Link href={`/${slug}/admin/pagos?dia=${shiftDay(day, 1)}` as Route} aria-label="Día siguiente"
          className="grid h-11 w-11 place-items-center rounded-xl border border-zinc-800 text-zinc-300 hover:text-white">
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="col-span-2 rounded-2xl border border-[#edcc36]/30 bg-[#edcc36]/5 p-4 lg:col-span-1">
          <p className="text-xs text-zinc-400">Total cobrado</p>
          <p className="text-3xl font-extrabold tabular-nums text-white">{formatMoney(total)}</p>
          <p className="text-xs text-zinc-500">
            {ok.length} {ok.length === 1 ? 'movimiento' : 'movimientos'}
            {salesTotal > 0 && ` · ventas ${formatMoney(salesTotal)}`}
          </p>
        </div>
        {[...byMethod.entries()].map(([m, v]) => (
          <div key={m} className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4">
            <p className="text-xs text-zinc-400">{METHOD_LABELS[m] ?? m}</p>
            <p className="text-xl font-bold tabular-nums text-white">{formatMoney(v)}</p>
          </div>
        ))}
      </div>

      {rows.length > 0 ? (
        <ul className="divide-y divide-zinc-900 overflow-hidden rounded-2xl border border-zinc-800/80">
          {rows.map((r) => (
            <li key={`${r.kind}-${r.id}`} className={`flex flex-wrap items-center gap-x-4 gap-y-1 bg-black px-4 py-3 ${r.ok ? '' : 'opacity-50'}`}>
              <span className="w-12 shrink-0 text-xs tabular-nums text-zinc-500">{r.at ? fmtTime(r.at, tz) : ''}</span>
              <span className="min-w-0 flex-1">
                {r.memberId ? (
                  <Link href={`/${slug}/admin/socios/${r.memberId}` as Route} className="font-semibold text-white hover:text-[#edcc36]">
                    {r.who}
                  </Link>
                ) : (
                  <span className="font-semibold text-white">{r.kind === 'sale' ? 'Venta de mostrador' : r.who}</span>
                )}
                <span className="block text-xs text-zinc-500">{r.detail.filter(Boolean).join(' · ')}</span>
              </span>
              <span className={`tabular-nums font-bold ${r.ok ? 'text-white' : 'text-zinc-500 line-through'}`}>
                {formatMoney(r.amount, r.currency)}
              </span>
              {canVoid && r.ok && (
                <VoidPaymentForm action={r.kind === 'payment' ? voidPayment.bind(null, slug, r.id) : voidSaleAction.bind(null, slug, r.id)} />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          No hubo cobros este día. Las cuotas se cobran desde la ficha de cada socio y las ventas desde “Vender”.
        </p>
      )}
    </div>
  )
}
