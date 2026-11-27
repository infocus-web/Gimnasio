import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { boardMediaUrl, cleanMedia, cleanTimer } from '@/features/screens/board'
import { musicUrl } from '@/features/screens/music'

/**
 * Lo que la TV pregunta seguido (cada 1,5 s), en un solo pedido:
 *   - ¿hay una pizarra de un profe en vivo? (tv_live)
 *   - ¿qué tiene que hacer la música? (tv_music: estado, informa el tema que suena, lista si cambió)
 *   POST { k: "<clave de la TV>", v?: "<versión de la lista de música>", now?: "<id del tema que suena>" }
 *   → { status, server_now, live: null | { … }, music: null | { music, list_v, tracks: null | [{ id, url, title }] } }
 */
export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const UUID = /^[0-9a-f-]{36}$/

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SECRET_KEY) return json({ status: 'server_not_configured' }, 503)
  let k = ''
  let v: string | null = null
  let now: string | null = null
  let wantsMusic = false
  try {
    const body = (await req.json()) as { k?: unknown; v?: unknown; now?: unknown }
    k = typeof body.k === 'string' ? body.k.trim() : ''
    wantsMusic = 'v' in body || 'now' in body
    v = typeof body.v === 'string' && body.v.length <= 64 ? body.v : null
    now = typeof body.now === 'string' && UUID.test(body.now) ? body.now : null
  } catch {
    return json({ status: 'bad_request' }, 400)
  }
  if (!/^[0-9a-f]{48}$/.test(k)) return json({ status: 'unauthorized' }, 401)
  const admin = createAdminClient()
  const [liveRes, musicRes] = await Promise.all([
    admin.rpc('tv_live', { p_token: k }),
    wantsMusic ? admin.rpc('tv_music', { p_token: k, p_list_v: v, p_now: now }) : Promise.resolve(null),
  ])
  const { data, error } = liveRes
  if (error) {
    console.error('[tv live]', error.message)
    return json({ status: 'error' }, 500)
  }
  const r = (data ?? {}) as { status?: string; server_now?: string; live?: Record<string, unknown> | null }
  if (r.status !== 'ok') return json(r, r.status === 'unauthorized' ? 401 : 200)
  const live = r.live
    ? {
        ...r.live,
        media: cleanMedia(r.live.media, '')
          .map((m) => ({
            type: m.type,
            url: boardMediaUrl(m.path),
            caption: m.caption ?? null,
            caption_color: m.caption_color ?? null,
            caption_bg: m.caption_bg ?? null,
            caption_pos: m.caption_pos ?? null,
          }))
          .filter((m) => m.url),
        timer: cleanTimer(r.live.timer),
      }
    : null

  // Música: si falla, la pizarra sigue andando igual
  let music: unknown = null
  if (musicRes && !musicRes.error) {
    const m = (musicRes.data ?? {}) as { status?: string; tracks?: { id: string; path: string; title: string }[] | null }
    if (m.status === 'ok') {
      const tracks = Array.isArray(m.tracks)
        ? m.tracks.flatMap((t) => {
            const url = musicUrl(t.path)
            return url ? [{ id: t.id, url, title: t.title }] : []
          })
        : null
      music = { ...m, tracks }
    }
  } else if (musicRes?.error) console.error('[tv live music]', musicRes.error.message)

  return json({ status: 'ok', server_now: r.server_now, live, music })
}
