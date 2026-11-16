import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Programa de cámaras de la PC del gimnasio (tools/camaras → CamarasEvolution.exe).
 * Cada minuto avisa la dirección de su túnel y qué cámaras responden:
 *   POST  Authorization: Bearer <clave de cámaras>   (se genera en Panel → Hoy → Cámaras)
 *   { "action": "hello", "url": "https://….trycloudflare.com", "cameras": [{ "id", "name", "online" }], "version": "1.0.0" }
 * La clave se valida en la base (camera_agent_hello).
 */
export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(req: NextRequest) {
  const key = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!/^[0-9a-f]{48}$/.test(key)) return json({ status: 'unauthorized' }, 401)
  if (!process.env.SUPABASE_SECRET_KEY) return json({ status: 'server_not_configured' }, 503)

  const raw = await req.text()
  if (raw.length > 20_000) return json({ status: 'too_large' }, 413)
  let body: { action?: unknown; url?: unknown; cameras?: unknown; version?: unknown }
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ status: 'bad_request' }, 400)
  }
  if (body.action !== 'hello') return json({ status: 'bad_request' }, 400)

  const url = typeof body.url === 'string' && /^https:\/\/[a-z0-9.-]+$/.test(body.url) ? body.url : null
  const cameras = Array.isArray(body.cameras)
    ? body.cameras.slice(0, 16).flatMap((c) => {
        const cam = c as { id?: unknown; name?: unknown; online?: unknown }
        if (typeof cam.id !== 'string' || !/^[a-z0-9]{1,16}$/.test(cam.id)) return []
        return [{ id: cam.id, name: String(cam.name ?? cam.id).slice(0, 40), online: cam.online === true }]
      })
    : []

  const db = createAdminClient() as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
  }
  const { data, error } = await db.rpc('camera_agent_hello', {
    p_key: key,
    p_url: url,
    p_cameras: cameras,
    p_version: typeof body.version === 'string' ? body.version.slice(0, 20) : null,
  })
  if (error) {
    console.error('[cámaras]', error.message)
    return json({ status: 'error' }, 500)
  }
  const result = (data ?? {}) as { status?: string }
  return json(result, result.status === 'unauthorized' ? 401 : 200)
}
