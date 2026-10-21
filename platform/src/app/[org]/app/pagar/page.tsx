import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { AlertTriangle, CheckCircle2, Clock, ShieldCheck } from 'lucide-react'
import { getMemberContext } from '@/lib/member-context'
import { createClient } from '@/lib/supabase/server'
import { fmtDate } from '@/features/admin/format'
import { startMemberCheckout } from '@/features/payments/actions'
import { mpConfigured } from '@/features/payments/mercadopago'
import { syncMpPayment } from '@/features/payments/sync'
import { PayPlanForm } from '@/features/payments/PayPlanForm'

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

  const { data: optData, error: optError } = await supabase.rpc('member_payment_options', { p_member: ctx.meId })
  const opts = optData as Options | null

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
          <Link href={`/${slug}/app/pase` as Route} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#edcc36] px-4 text-sm font-bold text-black">
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
        </>
      )}
    </div>
  )
}
