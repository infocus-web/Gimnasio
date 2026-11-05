import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /<gym>/referido?code=XXX → quién invita y qué promos hay (para la inscripción online). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const code = (req.nextUrl.searchParams.get('code') ?? '').slice(0, 30)
  const supabase = await createClient()
  const { data } = await supabase.rpc('public_referral_lookup', { p_slug: org, p_code: code })
  return Response.json(data ?? { valid: false }, { headers: { 'Cache-Control': 'no-store' } })
}
