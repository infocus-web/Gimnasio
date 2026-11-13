import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Vincular la tablet del molinete con el código de 6 números que muestra el panel (Accesos).
 *   POST { "slug": "<gimnasio>", "code": "123456" } → { status: "ok", token } | { status: "invalid" }
 * El código vale 15 minutos y un solo uso; 5 intentos fallidos lo anulan (ver 0044).
 */
export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SECRET_KEY) return json({ status: 'server_not_configured' }, 503)
  let body: { slug?: unknown; code?: unknown }
  try {
    body = (await req.json()) as { slug?: unknown; code?: unknown }
  } catch {
    return json({ status: 'bad_request' }, 400)
  }
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  const code = typeof body.code === 'string' ? body.code.replace(/\D/g, '') : ''
  if (!/^[a-z0-9-]{1,60}$/.test(slug) || code.length !== 6) return json({ status: 'invalid' })

  const { data, error } = await createAdminClient().rpc('kiosk_pair_with_code' as never, { p_slug: slug, p_code: code } as never)
  if (error) {
    console.error('[turnstile/pair]', (error as { message: string }).message)
    return json({ status: 'error' }, 500)
  }
  const r = (data ?? {}) as { status?: string; token?: string }
  return json(r.status === 'ok' && r.token ? { status: 'ok', token: r.token } : { status: 'invalid' })
}
