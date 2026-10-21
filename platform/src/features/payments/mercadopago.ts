import 'server-only'

/**
 * Mercado Pago Checkout Pro por API REST (sin SDK).
 * Variables (Vercel): MERCADOPAGO_ACCESS_TOKEN (credencial de producción, APP_USR-...)
 *                     MERCADOPAGO_WEBHOOK_SECRET (clave secreta de la sección Webhooks)
 * Sin ellas: el panel muestra "Conectá Mercado Pago" y no se ofrece el pago online.
 */
const API = 'https://api.mercadopago.com'

export function mpConfigured() {
  return !!process.env.MERCADOPAGO_ACCESS_TOKEN
}
export function mpWebhookConfigured() {
  return !!process.env.MERCADOPAGO_ACCESS_TOKEN && !!process.env.MERCADOPAGO_WEBHOOK_SECRET
}

/** URL pública fija (la notificación y la vuelta NO se arman con el header Host). */
export function publicSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://evolutiongym.fitness').replace(/\/$/, '')
}

export interface PreferenceInput {
  intentId: string
  title: string
  amountCents: number
  currency: string
  payer?: { email?: string | null; name?: string | null; surname?: string | null }
  backUrl: string            // se le agrega ?estado=aprobado|pendiente|rechazado
  expiresInHours: number
}

export interface Preference {
  id: string
  init_point: string
}

export async function createPreference(input: PreferenceInput): Promise<Preference> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN
  if (!token) throw new Error('MP_NOT_CONFIGURED')
  const sep = input.backUrl.includes('?') ? '&' : '?'
  const now = Date.now()
  const body = {
    items: [
      {
        id: input.intentId,
        title: input.title.slice(0, 250),
        quantity: 1,
        unit_price: Math.round(input.amountCents) / 100,
        currency_id: input.currency,
      },
    ],
    external_reference: input.intentId,
    payer: input.payer?.email
      ? { email: input.payer.email, name: input.payer.name ?? undefined, surname: input.payer.surname ?? undefined }
      : undefined,
    back_urls: {
      success: `${input.backUrl}${sep}estado=aprobado`,
      pending: `${input.backUrl}${sep}estado=pendiente`,
      failure: `${input.backUrl}${sep}estado=rechazado`,
    },
    auto_return: 'approved',
    notification_url: `${publicSiteUrl()}/api/payments/mercadopago/webhook?source_news=webhooks`,
    statement_descriptor: 'EVOLUTION GYM',
    binary_mode: false,
    expires: true,
    expiration_date_from: new Date(now - 60_000).toISOString(),
    expiration_date_to: new Date(now + input.expiresInHours * 3_600_000).toISOString(),
    metadata: { intent_id: input.intentId },
  }
  const res = await fetch(`${API}/checkout/preferences`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': input.intentId,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    console.error('[mercadopago] preference', res.status, (await res.text()).slice(0, 500))
    throw new Error('MP_PREFERENCE_FAILED')
  }
  const data = (await res.json()) as { id?: string; init_point?: string }
  if (!data.id || !data.init_point) throw new Error('MP_PREFERENCE_FAILED')
  return { id: data.id, init_point: data.init_point }
}

export interface MpPayment {
  id: number | string
  status: string               // approved, pending, in_process, rejected, cancelled, refunded, charged_back...
  status_detail: string | null
  external_reference: string | null
  transaction_amount: number
  currency_id: string
}

/** Consulta el pago a MP con el access token: la ÚNICA fuente de verdad (nunca el body del webhook). */
export async function getPayment(paymentId: string): Promise<MpPayment | null> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN
  if (!token) throw new Error('MP_NOT_CONFIGURED')
  if (!/^\d{1,20}$/.test(paymentId)) return null
  const res = await fetch(`${API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  if (res.status === 404) return null
  if (!res.ok) {
    console.error('[mercadopago] payment', res.status)
    throw new Error('MP_PAYMENT_FETCH_FAILED')
  }
  return (await res.json()) as MpPayment
}
