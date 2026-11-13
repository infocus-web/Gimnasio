import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Vincular la TV con un código de 6 números (/<gym>/tv sin clave).
 *   POST {}                 → { status: 'ok', code, nonce }   la TV muestra el código
 *   POST { nonce }          → { status: 'waiting' | 'ok' (+ token) | 'expired' }
 * El administrador escribe el código en Panel → Pantallas (floor_tv_pair_claim).
 */
export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(req: NextRequest, { params }: { params: Promise<{ org: string }> }) {
  if (!process.env.SUPABASE_SECRET_KEY) return json({ status: 'server_not_configured' }, 503)
  const { org: slug } = await params
  let body: { nonce?: unknown } = {}
  try {
    body = (await req.json()) as { nonce?: unknown }
  } catch {
    /* sin cuerpo: pide código */
  }
  const admin = createAdminClient()
  const nonce = typeof body.nonce === 'string' ? body.nonce.trim() : ''
  const { data, error } = nonce
    ? await admin.rpc('tv_pair_poll', { p_nonce: nonce })
    : await admin.rpc('tv_pair_start', { p_slug: slug })
  if (error) {
    console.error('[tv pair]', error.message)
    return json({ status: 'error' }, 500)
  }
  return json(data ?? { status: 'error' })
}
