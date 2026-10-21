import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Intermediario de la PC del gimnasio (tools/zk-agent) para lectores que se manejan
 * por la red local (ej. ZKTeco MB360). Una sola puerta: POST con
 *   Authorization: Bearer <clave del lector>   (se genera en Panel → Accesos)
 *   { "serial": "AEWD…", "action": "hello" | "push" | "poll" | "results", ...payload }
 * La validación de la clave y toda la lógica viven en la función agent_call de la base.
 */
export const dynamic = 'force-dynamic'

const ACTIONS = new Set(['hello', 'push', 'poll', 'results', 'unlocks'])
const MAX_BODY = 4_000_000

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ status: 'unauthorized' }, 401)
  if (!process.env.SUPABASE_SECRET_KEY) return json({ status: 'server_not_configured' }, 503)

  const raw = await req.text()
  if (raw.length > MAX_BODY) return json({ status: 'too_large' }, 413)
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return json({ status: 'bad_request' }, 400)
  }
  const serial = typeof body.serial === 'string' ? body.serial : ''
  const action = typeof body.action === 'string' ? body.action : ''
  if (!serial || !ACTIONS.has(action)) return json({ status: 'bad_request' }, 400)

  const { serial: _s, action: _a, ...payload } = body
  const ip = (req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0] ?? '').trim()

  const { data, error } = await createAdminClient().rpc('agent_call', {
    p_sn: serial,
    p_token: token,
    p_ip: ip,
    p_action: action,
    p_payload: payload as never,
  })
  if (error) {
    console.error('[agent]', action, serial, error.message)
    return json({ status: 'error' }, 500)
  }
  const result = (data ?? {}) as { status?: string }
  return json(result, result.status === 'unauthorized' ? 401 : 200)
}
