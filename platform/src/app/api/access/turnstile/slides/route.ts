import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { kioskSlideUrl } from '@/features/admin/kiosk-slides'

/**
 * Publicidad de la tablet del molinete: GET ?org=<slug> → { slides: [url, …] } (solo las activas, en orden).
 * Son imágenes públicas del gimnasio: no hace falta la clave de la tablet.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get('org') ?? '').trim()
  const headers = { 'Cache-Control': 'public, max-age=60' }
  if (!/^[a-z0-9-]{1,60}$/.test(slug) || !process.env.SUPABASE_SECRET_KEY) return Response.json({ slides: [] }, { headers })
  const admin = createAdminClient()
  const { data: org } = await admin.from('organizations').select('id').eq('slug', slug).maybeSingle()
  if (!org) return Response.json({ slides: [] }, { headers })
  const { data } = await admin
    .from('kiosk_slides')
    .select('image_path')
    .eq('org_id', org.id)
    .eq('active', true)
    .order('sort')
    .order('created_at')
    .limit(30)
  const slides = (data ?? []).map((s) => kioskSlideUrl(s.image_path)).filter((u): u is string => !!u)
  return Response.json({ slides }, { headers })
}
