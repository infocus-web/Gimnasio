import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Datos de la pantalla de TV de la sala (/<gym>/tv).
 *   POST { "k": "<clave de la TV>" }  →  tv_feed() + opening_hours (horario del gimnasio)
 * La clave se valida en la base (solo se guarda su hash). Sin clave válida: 401.
 */
export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(req: NextRequest, { params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  if (!process.env.SUPABASE_SECRET_KEY) return json({ status: 'server_not_configured' }, 503)
  let body: { k?: unknown }
  try {
    body = (await req.json()) as { k?: unknown }
  } catch {
    return json({ status: 'bad_request' }, 400)
  }
  const k = typeof body.k === 'string' ? body.k.trim() : ''
  if (!/^[0-9a-f]{48}$/.test(k)) return json({ status: 'unauthorized' }, 401)

  const admin = createAdminClient()
  // Horario del gimnasio (Configuración → Web): la TV lo usa para decidir cada cuánto pregunta
  const [{ data, error }, org] = await Promise.all([
    admin.rpc('tv_feed', { p_token: k }),
    admin.from('organizations').select('opening_hours').eq('slug', slug).maybeSingle(),
  ])
  if (error) {
    console.error('[tv]', error.message)
    return json({ status: 'error' }, 500)
  }
  const result = (data ?? {}) as { status?: string }
  if (result.status !== 'ok') return json(result, result.status === 'unauthorized' ? 401 : 200)
  return json({ ...result, opening_hours: Array.isArray(org.data?.opening_hours) ? org.data.opening_hours : [] })
}
