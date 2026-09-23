// POST /api/mp/webhook — Mercado Pago avisa acá cuando se aprueba un pago
import { createHmac, timingSafeEqual } from 'node:crypto'
import { db, env, handle, json } from '../_lib.js'
import { sendReceipt } from '../_emails.js'

function validSignature(req: Request, dataId: string) {
  const secret = env('MP_WEBHOOK_SECRET')
  if (!secret) return true // sin clave configurada no se valida (igual se consulta el pago a MP)
  const sig = req.headers.get('x-signature') ?? ''
  const requestId = req.headers.get('x-request-id') ?? ''
  const parts = Object.fromEntries(sig.split(',').map((p) => p.trim().split('=') as [string, string]))
  if (!parts.ts || !parts.v1) return false
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`
  const expected = createHmac('sha256', secret).update(manifest).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1))
  } catch {
    return false
  }
}

export const POST = handle(async (req) => {
  const url = new URL(req.url)
  const body = (await req.json().catch(() => ({}))) as { type?: string; action?: string; data?: { id?: string | number } }
  const type = body.type ?? url.searchParams.get('type') ?? url.searchParams.get('topic')
  const dataId = String(body.data?.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '')

  if (type !== 'payment' || !dataId) return json({ ignored: true })
  if (!validSignature(req, dataId)) return json({ error: 'Firma inválida' }, 401)

  // Nunca confiamos en el body: consultamos el pago directamente a Mercado Pago
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, {
    headers: { Authorization: `Bearer ${env('MP_ACCESS_TOKEN')}` },
  })
  if (!res.ok) return json({ error: 'No se pudo consultar el pago' }, 502)
  const pay = (await res.json()) as {
    id: number
    status: string
    transaction_amount: number
    external_reference?: string
    payer?: { email?: string }
  }
  if (pay.status !== 'approved') return json({ status: pay.status })

  const [memberId, planId] = (pay.external_reference ?? '').split('|')
  if (!memberId) return json({ error: 'Pago sin referencia de socio' })

  const { data: payment, error } = await db().rpc('record_payment', {
    p_member: memberId,
    p_plan: planId || null,
    p_amount: pay.transaction_amount,
    p_method: 'mercadopago',
    p_notes: `Mercado Pago #${pay.id}`,
    p_mp_id: String(pay.id),
  })
  if (error) throw error

  // comprobante por email (solo la primera vez)
  const { data: m } = await db().from('members').select('*').eq('id', memberId).maybeSingle()
  if (m?.email) {
    const { error: dup } = await db().from('email_log').insert({ member_id: m.id, kind: 'receipt', ref: payment.id, to_email: m.email })
    if (!dup) {
      const { data: plan } = await db().from('plans').select('name').eq('id', payment.plan_id).maybeSingle()
      await sendReceipt(m, payment, plan?.name ?? null).catch((e) => console.error('email', e))
    }
  }
  return json({ ok: true })
})

// Mercado Pago a veces prueba la URL con GET
export const GET = () => json({ ok: true })
