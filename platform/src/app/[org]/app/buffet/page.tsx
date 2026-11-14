import type { Metadata } from 'next'
import Image from 'next/image'
import { CheckCircle2, Clock, CreditCard, MessageCircle, UtensilsCrossed, X } from 'lucide-react'
import { getMemberContext } from '@/lib/member-context'
import { mpConfigured } from '@/features/payments/mercadopago'
import { syncMpPayment } from '@/features/payments/sync'
import { ActionButton, ConfirmAction } from '@/features/admin/ConfirmAction'
import { buffetDb, getBuffetPublic } from '@/features/buffet/data'
import { cancelBuffetOrder, payBuffetOrder, placeBuffetOrder } from '@/features/buffet/actions'
import { BuffetOrderScreen } from '@/features/buffet/BuffetOrderScreen'
import { ORDER_SELECT, ORDER_STATUS_UI, PAID_VIA_LABEL, buffetImageUrl, dayLabel, money, type OrderRow } from '@/features/buffet/types'

export const metadata: Metadata = { title: 'Buffet' }
export const dynamic = 'force-dynamic'

export default async function BuffetPage({ params, searchParams }: PageProps<'/[org]/app/buffet'>) {
  const { org: slug } = await params
  const sp = await searchParams
  const ctx = await getMemberContext(slug)
  if ('error' in ctx) return null // el layout ya muestra el aviso

  // Vuelta de Mercado Pago: se confirma el pago enseguida (sin esperar al aviso de MP)
  const paymentId = typeof sp.payment_id === 'string' ? sp.payment_id : typeof sp.collection_id === 'string' ? sp.collection_id : null
  const estado = typeof sp.estado === 'string' ? sp.estado : null
  let payResult: 'ok' | 'pending' | 'fail' | null = estado === 'aprobado' ? 'ok' : estado === 'pendiente' ? 'pending' : estado === 'rechazado' ? 'fail' : null
  if (paymentId && /^\d{1,20}$/.test(paymentId) && mpConfigured() && process.env.SUPABASE_SECRET_KEY) {
    try {
      const r = await syncMpPayment(paymentId)
      if (r.ok) payResult = r.status === 'approved' ? 'ok' : r.status === 'rejected' || r.status === 'cancelled' ? 'fail' : 'pending'
    } catch {
      /* el webhook lo termina de aplicar */
    }
  }

  const data = await getBuffetPublic(slug)
  if (!data) {
    return (
      <div className="space-y-3 py-10 text-center">
        <UtensilsCrossed className="mx-auto h-10 w-10 text-zinc-700" aria-hidden="true" />
        <h1 className="text-xl font-bold text-white">Buffet</h1>
        <p className="text-sm text-zinc-400">Todavía no se pueden hacer pedidos por la app. Acercate al buffet del gimnasio.</p>
      </div>
    )
  }

  const db = await buffetDb()
  const from = new Date(`${data.today}T12:00:00Z`)
  from.setUTCDate(from.getUTCDate() - 7)
  const { data: rows } = await db
    .from('buffet_orders')
    .select(ORDER_SELECT)
    .eq('member_id', ctx.meId)
    .gte('pickup_date', from.toISOString().slice(0, 10))
    .order('pickup_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(20)
  const orders = (rows ?? []) as OrderRow[]
  const open = orders.filter((o) => o.pickup_date >= data.today && ['pending_payment', 'confirmed', 'ready'].includes(o.status))
  const past = orders.filter((o) => !open.includes(o)).slice(0, 5)
  const cover = buffetImageUrl(data.cover_path)
  const canPayOnline = data.accept_online && mpConfigured()

  return (
    <div className="space-y-6 pb-4">
      <header className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950">
        {cover && (
          <div className="relative aspect-[16/7]">
            <Image src={cover} alt="" fill sizes="(min-width: 512px) 512px, 100vw" className="object-cover" priority />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 to-transparent" />
          </div>
        )}
        <div className={`space-y-1 p-4 ${cover ? '-mt-10 relative' : ''}`}>
          <h1 className="text-2xl font-extrabold text-white">{data.name}</h1>
          {data.tagline && <p className="text-sm text-zinc-300">{data.tagline}</p>}
          {data.pickup_text && (
            <p className="flex items-center gap-1.5 pt-1 text-xs text-zinc-400">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {data.pickup_text}
            </p>
          )}
          {data.whatsapp && (
            <a
              href={`https://wa.me/${data.whatsapp.replace(/\D/g, '')}`}
              className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-semibold text-emerald-300 hover:text-emerald-200"
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> Escribile al buffet
            </a>
          )}
        </div>
      </header>

      {payResult && (
        <p
          role="status"
          className={`rounded-2xl border p-4 text-sm ${
            payResult === 'ok'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
              : payResult === 'pending'
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                : 'border-red-500/30 bg-red-500/10 text-red-100'
          }`}
        >
          {payResult === 'ok'
            ? '¡Pago aprobado! Tu pedido está confirmado. Mostrá el código cuando lo retires.'
            : payResult === 'pending'
              ? 'Mercado Pago está procesando el pago. Apenas se acredite, el pedido queda confirmado solo.'
              : 'El pago no se completó y no se cobró nada. Podés intentar de nuevo o elegir pagar al retirar.'}
        </p>
      )}

      {open.length > 0 && (
        <section aria-labelledby="mis-pedidos" className="space-y-2">
          <h2 id="mis-pedidos" className="text-sm font-bold uppercase tracking-wide text-zinc-300">Mis pedidos</h2>
          <ul className="space-y-3">
            {open.map((o) => (
              <li key={o.id} className="space-y-3 rounded-2xl border border-[#edcc36]/30 bg-zinc-950 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-zinc-400">Retirás {dayLabel(o.pickup_date, data.today).toLowerCase()}</p>
                    <p className="text-xs text-zinc-500">Código de retiro</p>
                    <p className="font-mono text-3xl font-extrabold tracking-[0.2em] text-[#edcc36]">{o.pickup_code}</p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${ORDER_STATUS_UI[o.status].className}`}>
                    {ORDER_STATUS_UI[o.status].label}
                  </span>
                </div>
                <ul className="space-y-0.5 text-sm text-zinc-300">
                  {o.buffet_order_items.map((it, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>{it.quantity} × {it.name}</span>
                      <span className="tabular-nums text-zinc-500">{money(it.subtotal_cents, o.currency)}</span>
                    </li>
                  ))}
                </ul>
                <p className="flex justify-between border-t border-zinc-800 pt-2 text-sm">
                  <span className="text-zinc-400">
                    {o.paid_at ? (
                      <span className="inline-flex items-center gap-1 text-emerald-300">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Pagado
                      </span>
                    ) : o.status === 'pending_payment' ? 'Falta pagar' : 'Pagás al retirar'}
                  </span>
                  <span className="font-bold tabular-nums text-white">{money(o.total_cents, o.currency)}</span>
                </p>
                {!o.paid_at && (
                  <div className="flex flex-wrap items-start gap-2">
                    {canPayOnline && (
                      <ActionButton
                        action={payBuffetOrder.bind(null, slug, o.id)}
                        className="btn-tac inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#edcc36] px-4 text-sm font-bold text-black"
                      >
                        <CreditCard className="h-4 w-4" aria-hidden="true" /> Pagar ahora
                      </ActionButton>
                    )}
                    {['pending_payment', 'confirmed'].includes(o.status) && (
                      <ConfirmAction
                        action={cancelBuffetOrder.bind(null, slug, o.id)}
                        confirmText="El pedido se anula."
                        yesLabel="Sí, cancelar pedido"
                        variant="ghost"
                      >
                        <X className="h-4 w-4" aria-hidden="true" /> Cancelar
                      </ConfirmAction>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="pedir" className="space-y-3">
        <h2 id="pedir" className="text-lg font-extrabold text-white">Pedí tu vianda</h2>
        <p className="text-sm text-zinc-400">Elegí el día, sumá lo que quieras y lo retirás cuando venís a entrenar.</p>
        <BuffetOrderScreen data={data} action={placeBuffetOrder.bind(null, slug)} onlineEnabled={canPayOnline} />
      </section>

      {past.length > 0 && (
        <section aria-labelledby="anteriores" className="space-y-2">
          <h2 id="anteriores" className="text-sm font-bold uppercase tracking-wide text-zinc-500">Pedidos anteriores</h2>
          <ul className="divide-y divide-zinc-900 rounded-2xl border border-zinc-900 bg-zinc-950">
            {past.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-zinc-300">{o.buffet_order_items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}</span>
                  <span className="text-xs text-zinc-500">
                    {dayLabel(o.pickup_date, data.today)} · {money(o.total_cents, o.currency)}
                    {o.paid_via ? ` · ${PAID_VIA_LABEL[o.paid_via] ?? o.paid_via}` : ''}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ORDER_STATUS_UI[o.status].className}`}>
                  {ORDER_STATUS_UI[o.status].label}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
