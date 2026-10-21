import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildEmail, emailConfigured, sendEmail } from '@/features/engagement/email'

/**
 * Envío de los avisos automáticos por email (Vercel Cron, cada 15 minutos).
 *   GET con "Authorization: Bearer <CRON_SECRET>"
 * 1. Encola las bienvenidas de los socios recién inscriptos (el resto lo genera pg_cron a las 9:00).
 * 2. Toma un lote de pendientes con lock (message_outbox_claim) y los manda por Resend.
 * Sin RESEND_API_KEY no manda nada: quedan pendientes y el panel lo avisa.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

interface Claimed {
  id: number
  email: string
  subject: string
  body: string
  kind: string | null
  org_name: string
  org_slug: string
}

const BATCH = 25
const PAUSE_MS = 550 // Resend: ~2 pedidos por segundo en el plan básico

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return json({ status: 'cron_not_configured' }, 503)
  if (req.headers.get('authorization') !== `Bearer ${secret}`) return json({ status: 'unauthorized' }, 401)
  if (!process.env.SUPABASE_SECRET_KEY) return json({ status: 'server_not_configured' }, 503)

  const admin = createAdminClient()
  const gen = await admin.rpc('engagement_generate', { p_kinds: ['welcome'] })
  if (gen.error) console.error('[cron/messages] generate', gen.error.message)

  if (!emailConfigured()) {
    const { count } = await admin
      .from('message_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('channel', 'email')
      .eq('status', 'queued')
    return json({ status: 'email_not_configured', pending: count ?? 0 })
  }

  const { data, error } = await admin.rpc('message_outbox_claim', { p_limit: BATCH })
  if (error) {
    console.error('[cron/messages] claim', error.message)
    return json({ status: 'error' }, 500)
  }
  const batch = (data ?? []) as unknown as Claimed[]
  let sent = 0
  let failed = 0
  let stopped = false
  for (const [i, m] of batch.entries()) {
    if (stopped) {
      // Resend nos frenó: lo que queda vuelve a la cola sin contar como intento fallido
      await admin.rpc('message_outbox_mark', { p_id: m.id, p_ok: false, p_error: 'Pospuesto (límite de envío)', p_retry: true })
      continue
    }
    if (i > 0) await new Promise((r) => setTimeout(r, PAUSE_MS))
    const { html, text } = buildEmail({ orgName: m.org_name, orgSlug: m.org_slug, subject: m.subject, body: m.body })
    const res = await sendEmail({ to: m.email, subject: m.subject, html, text, idempotencyKey: `outbox-${m.id}` })
    if (res.ok) {
      sent++
      await admin.rpc('message_outbox_mark', { p_id: m.id, p_ok: true, p_provider_id: res.id })
    } else {
      failed++
      await admin.rpc('message_outbox_mark', { p_id: m.id, p_ok: false, p_error: res.error, p_retry: res.retry })
      if (res.error.startsWith('Resend 429')) stopped = true
    }
  }
  return json({ status: 'ok', generated: gen.data ?? null, claimed: batch.length, sent, failed })
}
