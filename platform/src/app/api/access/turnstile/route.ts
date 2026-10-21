import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Tablet del molinete (pantalla /<gym>/molinete). Una sola puerta:
 *   POST { "k": "<clave de la tablet>", "qr": "<texto del QR>" | null, "unlock"?: <id> }
 * qr = null es el latido (¿está conectado el molinete?); con "unlock" pregunta si esa apertura se hizo.
 * La validación (clave, QR, regla de musculación, apertura) vive en turnstile_scan().
 */
export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SECRET_KEY) return json({ status: 'server_not_configured' }, 503)
  let body: { k?: unknown; qr?: unknown; unlock?: unknown }
  try {
    body = (await req.json()) as { k?: unknown; qr?: unknown; unlock?: unknown }
  } catch {
    return json({ status: 'bad_request' }, 400)
  }
  const k = typeof body.k === 'string' ? body.k.trim() : ''
  const qr = typeof body.qr === 'string' ? body.qr.slice(0, 200) : null
  if (!/^[0-9a-f]{48}$/.test(k)) return json({ status: 'unauthorized' }, 401)
  const unlock =
    typeof body.unlock === 'number' && Number.isSafeInteger(body.unlock) && body.unlock > 0 ? body.unlock : undefined

  const { data, error } = await createAdminClient().rpc('turnstile_scan', {
    p_kiosk_token: k,
    p_qr: unlock ? null : qr,
    ...(unlock ? { p_unlock: unlock } : {}),
  })
  if (error) {
    console.error('[turnstile]', error.message)
    return json({ status: 'error' }, 500)
  }
  const result = (data ?? {}) as { status?: string }
  return json(result, result.status === 'unauthorized' ? 401 : 200)
}
