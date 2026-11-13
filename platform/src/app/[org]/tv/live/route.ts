import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { boardMediaUrl, cleanMedia, cleanTimer } from '@/features/screens/board'

/**
 * ¿Hay una pizarra de un profe en vivo? La TV pregunta cada pocos segundos.
 *   POST { "k": "<clave de la TV>" } → { status, server_now, live: null | { … } }
 */
export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SECRET_KEY) return json({ status: 'server_not_configured' }, 503)
  let k = ''
  try {
    const body = (await req.json()) as { k?: unknown }
    k = typeof body.k === 'string' ? body.k.trim() : ''
  } catch {
    return json({ status: 'bad_request' }, 400)
  }
  if (!/^[0-9a-f]{48}$/.test(k)) return json({ status: 'unauthorized' }, 401)
  const { data, error } = await createAdminClient().rpc('tv_live', { p_token: k })
  if (error) {
    console.error('[tv live]', error.message)
    return json({ status: 'error' }, 500)
  }
  const r = (data ?? {}) as { status?: string; server_now?: string; live?: Record<string, unknown> | null }
  if (r.status !== 'ok') return json(r, r.status === 'unauthorized' ? 401 : 200)
  const live = r.live
    ? {
        ...r.live,
        media: cleanMedia(r.live.media, '').map((m) => ({ type: m.type, url: boardMediaUrl(m.path) })).filter((m) => m.url),
        timer: cleanTimer(r.live.timer),
      }
    : null
  return json({ status: 'ok', server_now: r.server_now, live })
}
