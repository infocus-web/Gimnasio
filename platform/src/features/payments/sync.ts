import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayment } from './mercadopago'
import { sendDayPassEmailOnce } from './day-pass'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type SyncResult =
  | { ok: true; intentId: string; status: string; duplicate?: boolean; periodEnd?: string | null; dayPass?: boolean }
  | { ok: false; reason: 'NOT_FOUND' | 'NOT_OURS' | 'ERROR' }

/**
 * Trae el pago de la API de Mercado Pago y lo aplica a su intención (payment_intent_settle).
 * Lo usan el webhook y la pantalla de vuelta (así el plan queda renovado aunque el aviso tarde).
 * Idempotente: la base no registra dos veces el mismo pago.
 */
export async function syncMpPayment(paymentId: string): Promise<SyncResult> {
  const p = await getPayment(paymentId)
  if (!p) return { ok: false, reason: 'NOT_FOUND' }
  const intentId = p.external_reference ?? ''
  if (!UUID.test(intentId)) return { ok: false, reason: 'NOT_OURS' }

  const { data, error } = await createAdminClient().rpc('payment_intent_settle', {
    p_intent: intentId,
    p_mp_payment_id: String(p.id),
    p_mp_status: p.status,
    p_status_detail: p.status_detail ?? '',
    p_amount_cents: Math.round(Number(p.transaction_amount) * 100),
    p_currency: p.currency_id,
  })
  if (error) {
    if (error.message.includes('INTENT_NOT_FOUND')) return { ok: false, reason: 'NOT_OURS' }
    console.error('[mercadopago] settle', error.message)
    return { ok: false, reason: 'ERROR' }
  }
  const r = (data ?? {}) as { status?: string; duplicate?: boolean; result?: { period_end?: string; code?: string } | null }
  const dayPass = r.status === 'approved' && !!r.result?.code
  if (dayPass) {
    // Pase comprado en la web: se le manda el link por email (una sola vez)
    await sendDayPassEmailOnce(intentId).catch((e) => console.error('[pase online]', e instanceof Error ? e.message : e))
  }
  return { ok: true, intentId, status: r.status ?? 'pending', duplicate: r.duplicate, periodEnd: r.result?.period_end ?? null, dayPass }
}
