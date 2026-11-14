import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { AlertTriangle, CheckCircle2, Clock, Repeat, ShieldCheck } from 'lucide-react'
import { getMemberContext } from '@/lib/member-context'
import { createClient } from '@/lib/supabase/server'
import { fmtDate } from '@/features/admin/format'
import { cancelSubscriptionAction, startMemberCheckout, startMemberSubscription } from '@/features/payments/actions'
import { mpConfigured } from '@/features/payments/mercadopago'
import { syncMpPayment } from '@/features/payments/sync'
import { PayPlanForm } from '@/features/payments/PayPlanForm'
import { AutoDebitForm } from '@/features/payments/AutoDebitForm'
import { syncPreapproval } from '@/features/payments/subscriptions'
import { ConfirmAction } from '@/features/admin/ConfirmAction'
import { formatMoney } from '@/features/admin/format'

export const metadata: Metadata = { title: 'Pagar mi plan' }
export const dynamic = 'force-dynamic'

interface Options {
  is_payer: boolean
  current: { plan_id: string; name: string; price_cents: number; currency: string; status: string; period_end: string } | null
  plans: { plan_id: string; name: string; description: string | null; price_cents: number; currency: string }[]
}

export default async function PagarPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { org: slug } = await params
  const sp = await searchParams
  const ctx = await getMemberContext(slug)
  if ('error' in ctx) return null // el layout ya muestra el aviso
  const tz = ctx.org.timezone
  const supabase = await createClient()

  // Vuelta de Mercado Pago: se consulta el pago y se aplica al instante (el webhook hace lo mismo, sin duplicar)
  const estado = typeof sp.estado === 'string' ? sp.estado : null
  const paymentId = typeof sp.payment_id === 'string' ? sp.payment_id : typeof sp.collection_id === 'string' ? sp.collection_id : null
  let result: 'aprobado' | 'pendiente' | 'rechazado' | null =
    estado === 'aprobado' || estado === 'pendiente' || estado === 'rechazado' ? estado : null
  let newEnd: string | null = null
  if (result && paymentId && /^\d{1,20}$/.test(paymentId) && mpConfigured() && process.env.SUPABASE_SECRET_KEY) {
    try {
      const r = await syncMpPayment(paymentId)
      if (r.ok) {
        // Solo si la intención es de esta cuenta (RLS: el socio ve solo las suyas)
        const { data: mine } = await supabase.from('payment_intents').select('id, status').eq('id', r.intentId).maybeSingle()
        if (mine) {
          result = mine.status === 'approved' ? 'aprobado' : mine.status === 'rejected' || mine.status === 'cancelled' ? 'rechazado' : 'pendiente'
          newEnd = r.periodEnd ?? null
        }
      }
    } catch {
      /* se muestra lo que dijo MP en la URL; el aviso (webhook) termina de aplicarlo */
    }
  }

  // Vuelta de la adhesión al débito automático: se consulta a MP y se aplica (el webhook hace lo mismo)
  const preId = typeof sp.preapproval_id === 'string' ? sp.preapproval_id : null
  const debitReturn = sp.debito === '1'
  if (debitReturn && preId && mpConfigured() && process.env.SUPABASE_SECRET_KEY) {
    await syncPreapproval(preId).catch(() => null)
  }

  const [{ data: optData, error: optError }, { data: sub }, { data: meRow }] = await Promise.all([
    supabase.rpc('member_payment_options', { p_member: ctx.meId }),
    supabase
      .from('mp_subscriptions')
      .select('id, status, amount_cents, currency, frequency, frequency_type, start_date, next_payment_date, last_payment_at, last_failure_at, init_point')
      .eq('member_id', ctx.meId)
      .in('status', ['pending', 'authorized', 'paused'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('members').select('email').eq('id', ctx.meId).maybeSingle(),
  ])
  const opts = optData as Options | null
  const debitActive = sub?.status === 'authorized' || sub?.status === 'paused'
  const debitFailing = debitActive && !!sub && !!sub.last_failure_at && (!sub.last_payment_at || sub.last_failure_at > sub.last_payment_at)
  const every = (n: number, t: string) =>
    t === 'months' ? (n === 1 ? 'por mes' : n === 12 ? 'por año' : `cada ${n} meses`) : n === 7 ? 'por semana' : `cada ${n} días`
  const startsAtLabel =
    opts?.current && new Date(opts.current.period_end).getTime() > Date.now() + 2 * 3_600_000 ? `el ${fmtDate(opts.current.period_end, tz)}` : null

  const resultBox =
    result === 'aprobado' ? (
      <div role="status" className="flex items-start gap-3 rounded-3xl border border-emerald-500/40 bg-emerald-500/10 p-5">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-300" aria-hidden="true" />
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-white">¡Pago aprobado!</h2>
          <p className="text-sm text-emerald-100">
            {newEnd || opts?.current?.period_end
              ? `Tu plan quedó al día hasta el ${fmtDate(newEnd ?? opts?.current?.period_end, tz)}.`
              : 'Tu plan quedó renovado.'}{' '}
            Ya podés entrar con tu QR.
          </p>
          <Link href={`/${slug}/app/pase` as Route} className="btn-tac inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#edcc36] px-4 text-sm font-bold text-black">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Ver mi pase
          </Link>
        </div>
      </div>
    ) : result === 'pendiente' ? (
      <div role="status" className="flex items-start gap-3 rounded-3xl border border-amber-400/40 bg-amber-400/10 p-5">
        <Clock className="mt-0.5 h-6 w-6 shrink-0 text-amber-200" aria-hidden="true" />
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-white">Pago en proceso</h2>
          <p className="text-sm text-amber-100">
            Mercado Pago todavía lo está procesando (pasa con pagos en efectivo o algunas tarjetas). Apenas se acredite, tu plan se
            renueva solo. No pagues de nuevo.
          </p>
        </div>
      </div>
    ) : result === 'rechazado' ? (
      <div role="alert" className="flex items-start gap-3 rounded-3xl border border-red-500/40 bg-red-500/10 p-5">
        <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-red-300" aria-hidden="true" />
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-white">El pago no se completó</h2>
          <p className="text-sm text-red-100">No se te cobró nada. Podés intentar de nuevo con otro medio de pago o pagar en recepción.</p>
        </div>
      </div>
    ) : null

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-white">Pagar mi plan</h1>
      {resultBox}

      {optError || !opts ? (
        <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          No pudimos cargar tus planes. Revisá tu conexión y recargá la página.
        </p>
      ) : !opts.is_payer ? (
        <p className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-300">
          Tu plan lo paga el titular de tu grupo familiar. Pedile que lo pague desde su app o en recepción.
        </p>
      ) : !mpConfigured() ? (
        <p className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-300">
          Por ahora las cuotas se pagan en recepción: efectivo, transferencia o tarjeta.
        </p>
      ) : (
        <>
          {opts.current && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm">
              <p className="text-zinc-400">Tu plan</p>
              <p className="font-semibold text-white">{opts.current.name}</p>
              <p className="text-xs text-zinc-400">
                {new Date(opts.current.period_end) < new Date() ? 'Venció el ' : 'Vence el '}
                <span className="font-mono text-zinc-200">{fmtDate(opts.current.period_end, tz)}</span>
              </p>
            </div>
          )}
          {opts.plans.length ? (
            <PayPlanForm
              action={startMemberCheckout.bind(null, slug)}
              plans={opts.plans.map((p) => ({
                id: p.plan_id,
                name: p.name,
                description: p.description,
                priceCents: Number(p.price_cents),
                currency: p.currency,
                current: p.plan_id === opts.current?.plan_id,
              }))}
            />
          ) : (
            <p className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-300">
              No hay planes para pagar online. Consultá en recepción.
            </p>
          )}
          <p className="text-center text-xs text-zinc-500">
            El pago se hace en Mercado Pago (tarjeta, débito o dinero en cuenta). No guardamos datos de tu tarjeta.
          </p>

          <section aria-labelledby="debito-titulo" className="space-y-4 rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-start gap-3">
              <Repeat className="mt-0.5 h-5 w-5 shrink-0 text-[#edcc36]" aria-hidden="true" />
              <div>
                <h2 id="debito-titulo" className="text-lg font-bold text-white">Débito automático</h2>
                <p className="text-sm text-zinc-400">Tu cuota se cobra sola cada mes y tu plan se renueva sin que tengas que hacer nada.</p>
              </div>
            </div>

            {debitActive && sub ? (
              <div className="space-y-3">
                <div role="status" className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
                  <p className="font-semibold text-emerald-100">
                    {sub.status === 'paused' ? 'Pausado en Mercado Pago' : 'Activo'} · {formatMoney(Number(sub.amount_cents), sub.currency)}{' '}
                    {every(sub.frequency, sub.frequency_type)}
                  </p>
                  {sub.next_payment_date && (
                    <p className="text-emerald-100/80">Próximo cobro: {fmtDate(sub.next_payment_date, tz)}</p>
                  )}
                </div>
                {debitFailing && (
                  <p role="alert" className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-100">
                    El último cobro fue rechazado. Mercado Pago lo reintenta en los próximos días: revisá que tu tarjeta tenga saldo o límite.
                    Si querés, podés pagar ahora con el botón de arriba.
                  </p>
                )}
                <ConfirmAction
                  action={cancelSubscriptionAction.bind(null, slug, sub.id, 'app')}
                  confirmText="No se van a hacer más cobros automáticos. Tu plan sigue hasta su vencimiento."
                  yesLabel="Sí, dar de baja"
                >
                  Dar de baja el débito automático
                </ConfirmAction>
              </div>
            ) : sub?.status === 'pending' && sub.init_point ? (
              <div className="space-y-3">
                <p className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-100">
                  {debitReturn
                    ? 'Mercado Pago todavía está confirmando tu adhesión. Si ya autorizaste, en unos minutos aparece como activo.'
                    : 'Empezaste a activar el débito automático pero falta autorizarlo en Mercado Pago.'}
                </p>
                <a
                  href={sub.init_point}
                  className="btn-tac inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#edcc36] px-4 text-sm font-bold text-black"
                >
                  <Repeat className="h-4 w-4" aria-hidden="true" /> Terminar en Mercado Pago
                </a>
                <ConfirmAction
                  action={cancelSubscriptionAction.bind(null, slug, sub.id, 'app')}
                  confirmText="Se descarta la adhesión. No se te cobra nada."
                  yesLabel="Sí, descartar"
                >
                  Descartar
                </ConfirmAction>
              </div>
            ) : opts.plans.length ? (
              <AutoDebitForm
                action={startMemberSubscription.bind(null, slug)}
                plans={opts.plans.map((p) => ({
                  id: p.plan_id,
                  name: p.name,
                  description: p.description,
                  priceCents: Number(p.price_cents),
                  currency: p.currency,
                  current: p.plan_id === opts.current?.plan_id,
                }))}
                defaultEmail={meRow?.email ?? ''}
                startsAtLabel={startsAtLabel}
              />
            ) : null}
          </section>
        </>
      )}
    </div>
  )
}
