import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildEmail, emailConfigured, sendEmail } from '@/features/engagement/email'
import { formatMoney } from '@/features/admin/format'
import { cancelPreapproval, getAuthorizedPayment, getPreapproval, type MpPayment } from './mercadopago'

/**
 * Débito automático (suscripciones de Mercado Pago).
 * Todo se consulta a la API de MP con el access token: nunca se usa el body del webhook.
 * Las funciones de la base (0056) son idempotentes: el mismo aviso dos veces no cobra ni avisa dos veces.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type SubSyncResult =
  | { ok: true; subscriptionId: string; status: string; memberId?: string }
  | { ok: false; reason: 'NOT_FOUND' | 'NOT_OURS' | 'ERROR' }

/** Busca nuestra suscripción por external_reference o, si no, por el id de MP. */
async function findSubscription(externalRef: unknown, preapprovalId: string | null | undefined) {
  const db = createAdminClient()
  const ref = externalRef == null ? '' : String(externalRef)
  if (UUID.test(ref)) {
    const { data } = await db.from('mp_subscriptions').select('id, mp_preapproval_id').eq('id', ref).maybeSingle()
    if (data) return data
  }
  if (preapprovalId) {
    const { data } = await db.from('mp_subscriptions').select('id, mp_preapproval_id').eq('mp_preapproval_id', preapprovalId).maybeSingle()
    if (data) return data
  }
  return null
}

/** Aviso "subscription_preapproval" o vuelta del socio: estado de la adhesión. */
export async function syncPreapproval(preapprovalId: string): Promise<SubSyncResult> {
  const pre = await getPreapproval(preapprovalId)
  if (!pre) return { ok: false, reason: 'NOT_FOUND' }
  const sub = await findSubscription(pre.external_reference, pre.id)
  if (!sub) return { ok: false, reason: 'NOT_OURS' }

  const { data, error } = await createAdminClient().rpc('subscription_sync', {
    p_sub: sub.id,
    p_preapproval_id: pre.id,
    p_mp_status: pre.status,
    p_next_payment_date: pre.next_payment_date ?? undefined,
  })
  if (error) {
    console.error('[débito] sync', error.message)
    return { ok: false, reason: 'ERROR' }
  }
  const r = (data ?? {}) as { status?: string; action?: string | null; member_id?: string }
  // Se dio de baja acá pero en MP sigue viva: se cancela allá (nunca cobrarle a quien pidió la baja)
  if (r.action === 'cancel_remote') await cancelPreapproval(pre.id).catch(() => false)
  return { ok: true, subscriptionId: sub.id, status: r.status ?? pre.status, memberId: r.member_id }
}

/** Aviso "subscription_authorized_payment": una cuota cobrada, rechazada o en reintento. */
export async function syncAuthorizedPayment(authorizedPaymentId: string): Promise<SubSyncResult> {
  const ap = await getAuthorizedPayment(authorizedPaymentId)
  if (!ap) return { ok: false, reason: 'NOT_FOUND' }
  const sub = await findSubscription(ap.external_reference, ap.preapproval_id)
  if (!sub) return { ok: false, reason: 'NOT_OURS' }
  const payId = ap.payment?.id != null ? String(ap.payment.id) : null
  const payStatus = ap.payment?.status ?? null
  // Cuota programada sin intento todavía: nada que registrar
  if (!payId || !payStatus) return { ok: true, subscriptionId: sub.id, status: ap.status }
  return settle(sub.id, payId, payStatus, ap.payment?.status_detail ?? '', ap.transaction_amount, ap.currency_id)
}

/**
 * Aviso "payment" de un cobro que no es de una intención de pago (Checkout Pro):
 * si pertenece a una suscripción nuestra, se registra igual (por si el tópico de cuotas no está activo).
 */
export async function settleSubscriptionMpPayment(p: MpPayment): Promise<SubSyncResult> {
  const sub = await findSubscription(p.external_reference, p.metadata?.preapproval_id ?? null)
  if (!sub) return { ok: false, reason: 'NOT_OURS' }
  return settle(sub.id, String(p.id), p.status, p.status_detail ?? '', p.transaction_amount, p.currency_id)
}

async function settle(subId: string, paymentId: string, status: string, detail: string, amount: number, currency: string): Promise<SubSyncResult> {
  const { data, error } = await createAdminClient().rpc('subscription_payment_settle', {
    p_sub: subId,
    p_mp_payment_id: paymentId,
    p_mp_status: status,
    p_status_detail: detail,
    p_amount_cents: Math.round(Number(amount) * 100),
    p_currency: currency,
  })
  if (error) {
    console.error('[débito] settle', error.message)
    return { ok: false, reason: 'ERROR' }
  }
  const r = (data ?? {}) as { status?: string; first_notice?: boolean; member_id?: string }
  if (r.status === 'rejected' && r.first_notice) {
    await notifyFailedCharge(subId, paymentId).catch((e) => console.error('[débito] aviso', e instanceof Error ? e.message : e))
  }
  return { ok: true, subscriptionId: subId, status: r.status ?? status, memberId: r.member_id }
}

/** Email al socio cuando rebota un débito (una vez por cobro: lo garantiza la base con first_notice). */
async function notifyFailedCharge(subId: string, paymentId: string) {
  if (!emailConfigured()) return
  const db = createAdminClient()
  const { data: s } = await db
    .from('mp_subscriptions')
    .select('org_id, member_id, amount_cents, currency, payer_email')
    .eq('id', subId)
    .single()
  if (!s) return
  const [{ data: m }, { data: o }] = await Promise.all([
    db.from('members').select('first_name, email').eq('id', s.member_id).single(),
    db.from('organizations').select('name, slug').eq('id', s.org_id).single(),
  ])
  const to = m?.email || s.payer_email
  if (!to || !o) return
  const subject = 'No pudimos cobrar tu cuota'
  const body = [
    `Hola ${m?.first_name ?? ''}`.trim() + ',',
    `Mercado Pago no pudo debitar tu cuota de ${formatMoney(Number(s.amount_cents), s.currency)}. Va a reintentar el cobro en los próximos días.`,
    'Revisá que tu tarjeta tenga saldo o límite disponible. Si preferís, podés pagar ahora desde la app (Pagar mi plan) o en recepción.',
  ].join('\n\n')
  const { html, text } = buildEmail({ orgName: o.name, orgSlug: o.slug, subject, body })
  const r = await sendEmail({ to, subject, html, text, idempotencyKey: `debito-rechazado-${paymentId}` })
  if (!r.ok) console.error('[débito] email', r.error)
}
