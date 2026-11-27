import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { musicUrl } from '@/features/screens/music'

/**
 * Música de la TV (/<gym>/tv/lite la pregunta cada 3 segundos).
 *   POST { k: "<clave de la TV>", v: "<versión de la lista que ya tiene>", now: "<id del tema que suena>" }
 *   → { status, music: { playing, volume, shuffle, seq, cmd, track_id }, list_v, tracks: null | [{ id, url, title }] }
 * La lista solo viaja cuando cambió (v distinto de list_v).
 */
export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const UUID = /^[0-9a-f-]{36}$/

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SECRET_KEY) return json({ status: 'server_not_configured' }, 503)
  let body: { k?: unknown; v?: unknown; now?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return json({ status: 'bad_request' }, 400)
  }
  const k = typeof body.k === 'string' ? body.k.trim() : ''
  if (!/^[0-9a-f]{48}$/.test(k)) return json({ status: 'unauthorized' }, 401)
  const v = typeof body.v === 'string' && body.v.length <= 64 ? body.v : null
  const now = typeof body.now === 'string' && UUID.test(body.now) ? body.now : null

  const { data, error } = await createAdminClient().rpc('tv_music', { p_token: k, p_list_v: v, p_now: now })
  if (error) {
    console.error('[tv music]', error.message)
    return json({ status: 'error' }, 500)
  }
  const r = (data ?? {}) as { status?: string; tracks?: { id: string; path: string; title: string }[] | null }
  if (r.status !== 'ok') return json(r, r.status === 'unauthorized' ? 401 : 200)
  const tracks = Array.isArray(r.tracks)
    ? r.tracks.flatMap((t) => {
        const url = musicUrl(t.path)
        return url ? [{ id: t.id, url, title: t.title }] : []
      })
    : null
  return json({ ...r, tracks })
}
