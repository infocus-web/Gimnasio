import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { publicSiteUrl } from './mercadopago'

const FROM = 'Evolution Fitness GYM <no-responder@evolutiongym.fitness>'
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export interface DayPassInfo {
  url: string
  code: string
  email: string | null
  name: string | null
  orgName: string
  validUntil: string | null
  emailSentAt: string | null
  /** Preferencia de MP con la que se compró: la vuelta de MP solo muestra el link si coincide. */
  preferenceId: string | null
}

/** Pase emitido por una compra online (o null si todavía no se aprobó). */
export async function dayPassInfo(intentId: string): Promise<DayPassInfo | null> {
  const db = createAdminClient()
  const { data: i } = await db
    .from('payment_intents')
    .select('org_id, kind, status, result, buyer_email, buyer_name, email_sent_at, mp_preference_id')
    .eq('id', intentId)
    .maybeSingle()
  const r = (i?.result ?? null) as { code?: string; valid_until?: string } | null
  if (!i || i.kind !== 'day_pass' || i.status !== 'approved' || !r?.code) return null
  const { data: o } = await db.from('organizations').select('slug, name').eq('id', i.org_id).single()
  if (!o) return null
  return {
    url: `${publicSiteUrl()}/${o.slug}/pase/${r.code}`,
    code: r.code,
    email: i.buyer_email,
    name: i.buyer_name,
    orgName: o.name,
    validUntil: r.valid_until ?? null,
    emailSentAt: i.email_sent_at,
    preferenceId: i.mp_preference_id,
  }
}

/**
 * Manda por email el link del pase UNA sola vez (aunque lleguen dos avisos de MP a la vez:
 * se "reserva" el envío marcando email_sent_at antes de mandar; si falla se libera).
 * Sin RESEND_API_KEY no rompe: queda pendiente y se ve en Pagos → Pagos online.
 */
export async function sendDayPassEmailOnce(intentId: string): Promise<'sent' | 'already' | 'pending' | 'none'> {
  const info = await dayPassInfo(intentId)
  if (!info?.email) return 'none'
  if (info.emailSentAt) return 'already'
  const key = process.env.RESEND_API_KEY
  if (!key) return 'pending'

  const db = createAdminClient()
  const { data: claimed } = await db
    .from('payment_intents')
    .update({ email_sent_at: new Date().toISOString() })
    .eq('id', intentId)
    .is('email_sent_at', null)
    .select('id')
  if (!claimed?.length) return 'already'

  const until = info.validUntil
    ? new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'full', timeStyle: 'short' }).format(new Date(info.validUntil))
    : null
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:480px;margin:auto;color:#111">
<h1 style="font-size:20px">¡Listo${info.name ? `, ${esc(info.name.split(' ')[0] ?? '')}` : ''}! Tu pase está pago</h1>
<p>Mostrá este pase en la entrada de <b>${esc(info.orgName)}</b>: abrilo desde el celular y acercá el QR al molinete o mostralo en recepción.</p>
<p style="margin:24px 0"><a href="${esc(info.url)}" style="background:#edcc36;color:#000;padding:12px 20px;border-radius:10px;font-weight:700;text-decoration:none">Abrir mi pase</a></p>
${until ? `<p>Vale hasta el ${esc(until)}.</p>` : ''}
<p style="color:#666;font-size:12px">Código: ${esc(info.code)}. Si el botón no anda, copiá este link: ${esc(info.url)}</p></div>`
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `day-pass-${intentId}` },
      body: JSON.stringify({ from: FROM, to: [info.email], subject: `Tu pase para ${info.orgName}`, html }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`resend ${res.status}`)
    return 'sent'
  } catch (e) {
    console.error('[pase online] email', e instanceof Error ? e.message : e)
    await db.from('payment_intents').update({ email_sent_at: null }).eq('id', intentId)
    return 'pending'
  }
}
