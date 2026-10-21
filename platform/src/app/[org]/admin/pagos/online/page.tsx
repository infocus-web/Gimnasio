import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { CheckCircle2 } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { fmtDate, fmtDateTime, formatMoney } from '@/features/admin/format'
import { mpConfigured, mpWebhookConfigured } from '@/features/payments/mercadopago'
import { MpNotice } from '@/features/payments/MpNotice'
import { Card } from '@/features/admin/ui'
import { saveDayPassSettings } from '@/features/payments/actions'
import { DayPassSettingsForm } from '@/features/payments/DayPassSettingsForm'
import { publicSiteUrl } from '@/features/payments/mercadopago'

export const metadata: Metadata = { title: 'Pagos online' }

const STATUS: Record<string, { label: string; className: string }> = {
  created: { label: 'Sin pagar', className: 'text-zinc-400 border-zinc-700' },
  pending: { label: 'En proceso', className: 'text-amber-200 border-amber-400/40' },
  approved: { label: 'Aprobado', className: 'text-emerald-300 border-emerald-500/40' },
  rejected: { label: 'Rechazado', className: 'text-red-300 border-red-500/40' },
  cancelled: { label: 'Cancelado', className: 'text-zinc-400 border-zinc-700' },
  refunded: { label: 'Devuelto', className: 'text-sky-200 border-sky-500/40' },
  review: { label: 'A revisar', className: 'text-amber-100 border-amber-400/60 bg-amber-400/10' },
}
const SOURCE: Record<string, string> = { member_app: 'desde la app', admin_link: 'link enviado', public: 'web' }

interface RefundInfo {
  action?: 'pass_revoked' | 'period_rolled_back' | 'account_blocked'
  mp_status?: string
  at?: string
  restored_period_end?: string | null
}

/** Qué pasó cuando Mercado Pago devolvió el pago (o el cliente desconoció la compra). */
function refundText(r: RefundInfo | undefined, tz: string): string {
  const why = r?.mp_status === 'charged_back' ? 'El cliente desconoció el pago con su tarjeta (contracargo)' : 'El pago se devolvió en Mercado Pago'
  switch (r?.action) {
    case 'pass_revoked':
      return `${why}: el pase quedó anulado y ya no sirve para entrar.`
    case 'period_rolled_back':
      return `${why}: se descontó la renovación${r.restored_period_end ? ` y el plan vuelve a vencer el ${fmtDate(r.restored_period_end, tz)}` : ''}.`
    case 'account_blocked':
      return `${why}: el plan cambió después del pago y no se pudo descontar solo, así que la cuenta quedó con deuda (el molinete no lo deja pasar). Revisá la ficha y registrá el cobro o ajustá el vencimiento.`
    default:
      return `${why}. Ya no cuenta en la Caja.`
  }
}

export default async function OnlinePage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx) return null
  if (!ctx.can('billing.read')) return <p className="text-sm text-zinc-400">No tenés permiso.</p>
  const tz = ctx.org.timezone

  const supabase = await createClient()
  const [{ data: intents }, { data: settings }] = await Promise.all([
    supabase
      .from('payment_intents')
      .select('id, created_at, settled_at, status, kind, amount_cents, currency, description, source, member_id, buyer_name, buyer_email, mp_payment_id, mp_status_detail, result, email_sent_at')
      .eq('org_id', ctx.org.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('online_sale_settings').select('*').eq('org_id', ctx.org.id).maybeSingle(),
  ])
  const canEdit = ctx.can('billing.write')
  const buyUrl = `${publicSiteUrl()}/api/payments/pase-diario?gym=${slug}`

  const configured = mpConfigured()
  const webhook = mpWebhookConfigured()

  return (
    <div className="space-y-5">
      {configured && webhook ? (
        <p className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-100">
          <CheckCircle2 className="h-5 w-5 text-emerald-300" aria-hidden="true" />
          Mercado Pago conectado. Los pagos aprobados renuevan el plan solos y aparecen en la Caja.
        </p>
      ) : (
        <>
          <MpNotice slug={slug} />
          <section className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4 text-sm text-zinc-300">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-zinc-300">Cómo conectarlo</h2>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Entrá a mercadopago.com.ar/developers con la cuenta del gimnasio → <b>Tus integraciones</b> → <b>Crear aplicación</b> (Pagos online · Checkout Pro).</li>
              <li>En la aplicación: <b>Credenciales de producción</b> → copiá el <b>Access Token</b> (empieza con APP_USR-).</li>
              <li>En <b>Webhooks</b> → modo productivo → URL <code className="text-[#edcc36]">https://evolutiongym.fitness/api/payments/mercadopago/webhook</code>, evento <b>Pagos</b> → guardar y copiar la <b>clave secreta</b>.</li>
              <li>En Vercel → proyecto → Settings → Environment Variables: <code>MERCADOPAGO_ACCESS_TOKEN</code> y <code>MERCADOPAGO_WEBHOOK_SECRET</code> → volver a publicar.</li>
            </ol>
            {configured && !webhook && <p className="mt-2 text-amber-200">Falta la clave secreta del webhook: sin ella los pagos no se acreditan solos.</p>}
          </section>
        </>
      )}

      {canEdit && (
        <Card title="Pase por día online">
          <DayPassSettingsForm
            action={saveDayPassSettings.bind(null, slug)}
            initial={{
              enabled: settings?.day_pass_enabled ?? false,
              price: settings?.day_pass_price_cents ? String(Number(settings.day_pass_price_cents) / 100) : '',
              days: settings?.day_pass_days ?? 1,
              entries: settings?.day_pass_entries ?? 1,
            }}
          />
          {settings?.day_pass_enabled && (
            <p className="mt-3 break-all text-xs text-zinc-400">
              Link para la web o Instagram: <a href={buyUrl} target="_blank" rel="noreferrer" className="text-[#edcc36] underline">{buyUrl}</a>
            </p>
          )}
        </Card>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-300">Últimos pagos online</h2>
        {intents?.length ? (
          <ul className="divide-y divide-zinc-900 overflow-hidden rounded-2xl border border-zinc-800/80">
            {intents.map((i) => {
              const st = STATUS[i.status] ?? STATUS.created!
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-black px-4 py-3">
                  <span className="w-28 shrink-0 text-xs tabular-nums text-zinc-500">{fmtDateTime(i.created_at, tz)}</span>
                  <span className="min-w-0 flex-1">
                    {i.member_id ? (
                      <Link href={`/${slug}/admin/socios/${i.member_id}` as Route} className="font-semibold text-white hover:text-[#edcc36]">
                        {i.buyer_name ?? 'Socio'}
                      </Link>
                    ) : (
                      <span className="font-semibold text-white">{i.buyer_name ?? 'Comprador web'}</span>
                    )}
                    <span className="block text-xs text-zinc-500">
                      {[i.description, SOURCE[i.source] ?? i.source, i.mp_payment_id && `MP #${i.mp_payment_id}`, i.status !== 'approved' && i.mp_status_detail]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {i.status === 'refunded' && (
                      <span className="mt-1 block rounded-lg border border-sky-500/30 bg-sky-500/5 px-2 py-1 text-xs text-sky-100">
                        {refundText((i.result as { refund?: RefundInfo } | null)?.refund, tz)}
                      </span>
                    )}
                    {i.kind === 'day_pass' && i.status === 'approved' && (i.result as { code?: string } | null)?.code && (
                      <span className="block text-xs">
                        <a href={`/${slug}/pase/${(i.result as { code: string }).code}`} target="_blank" rel="noreferrer" className="text-[#edcc36] underline">
                          Ver pase
                        </a>
                        {i.email_sent_at ? (
                          <span className="text-zinc-500"> · enviado a {i.buyer_email}</span>
                        ) : (
                          <span className="text-amber-200"> · email pendiente: mandale el link a {i.buyer_email}</span>
                        )}
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums font-bold text-white">{formatMoney(Number(i.amount_cents), i.currency)}</span>
                  <span className={`rounded-lg border px-2 py-1 text-xs font-semibold ${st.className}`}>{st.label}</span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
            Todavía no hubo pagos online.
          </p>
        )}
        {intents?.some((i) => i.status === 'review') && (
          <p className="text-xs text-amber-200">
            “A revisar”: Mercado Pago cobró un monto distinto al del plan o el mismo link se pagó dos veces. Revisalo en tu cuenta de
            Mercado Pago y, si corresponde, registrá el cobro a mano desde la ficha.
          </p>
        )}
      </section>
    </div>
  )
}
