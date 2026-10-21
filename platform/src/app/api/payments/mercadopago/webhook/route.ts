import type { NextRequest } from 'next/server'
import { verifyMpSignature } from '@/features/payments/signature'
import { mpWebhookConfigured } from '@/features/payments/mercadopago'
import { syncMpPayment } from '@/features/payments/sync'

/**
 * Notificaciones de Mercado Pago (Webhooks, evento "Pagos").
 *   POST /api/payments/mercadopago/webhook?data.id=<id>&type=payment
 * 1. Valida la firma x-signature (HMAC con MERCADOPAGO_WEBHOOK_SECRET) y que ts tenga menos de 10 minutos.
 * 2. Consulta el pago a la API de MP (nunca se confía en el body).
 * 3. payment_intent_settle: si está aprobado registra el cobro (misma lógica que el cobro manual),
 *    renueva el plan y el molinete lo deja pasar al instante. Idempotente.
 * Responde 200 rápido; 500 solo si hay que reintentar (MP reintenta solo).
 */
export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(req: NextRequest) {
  if (!mpWebhookConfigured() || !process.env.SUPABASE_SECRET_KEY) return json({ status: 'not_configured' }, 503)

  const url = req.nextUrl
  let body: { type?: string; action?: string; data?: { id?: string | number } } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    /* algunos avisos llegan sin body: alcanza con la query */
  }
  const type = url.searchParams.get('type') ?? url.searchParams.get('topic') ?? body.type ?? ''
  const dataId = url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? (body.data?.id != null ? String(body.data.id) : null)

  const valid = verifyMpSignature({
    xSignature: req.headers.get('x-signature'),
    xRequestId: req.headers.get('x-request-id'),
    dataId: url.searchParams.get('data.id') ?? dataId,
    secret: process.env.MERCADOPAGO_WEBHOOK_SECRET!,
    maxAgeSeconds: 600, // avisos firmados de hace más de 10 minutos se rechazan (anti repetición)
  })
  if (!valid) return json({ status: 'invalid_signature' }, 401)

  // Solo nos interesan los pagos (merchant_order, etc. se ignoran con 200 para que no reintente)
  if (type !== 'payment' || !dataId) return json({ status: 'ignored' })

  try {
    const r = await syncMpPayment(dataId)
    if (!r.ok && r.reason === 'ERROR') return json({ status: 'retry' }, 500)
    return json(r.ok ? { status: r.status } : { status: 'ignored', reason: r.reason })
  } catch (e) {
    console.error('[mercadopago] webhook', e instanceof Error ? e.message : e)
    return json({ status: 'retry' }, 500)
  }
}

// MP prueba la URL con GET al configurarla en algunos casos
export function GET() {
  return json({ status: 'ok' })
}
