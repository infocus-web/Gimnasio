import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { kioskSlideUrl } from '@/features/admin/kiosk-slides'
import { isPromoOrientation, isPromoPosition, isPromoStyle, type PromoSlideData } from '@/features/screens/promo'

/**
 * Publicidad de la tablet del molinete y los TVs: GET ?org=<slug> → { slides: PromoSlideData[] }
 * (solo las activas, en orden). Son imágenes públicas del gimnasio: no hace falta clave.
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
    .select('image_path, badge, title, subtitle, style, text_position, orientation')
    .eq('org_id', org.id)
    .eq('active', true)
    .order('sort')
    .order('created_at')
    .limit(30)
  const slides: PromoSlideData[] = (data ?? []).flatMap((s) => {
    const url = kioskSlideUrl(s.image_path)
    if (!url) return []
    return [
      {
        url,
        badge: s.badge,
        title: s.title,
        subtitle: s.subtitle,
        style: isPromoStyle(s.style) ? s.style : 'impacto',
        position: isPromoPosition(s.text_position) ? s.text_position : 'bottom',
        orientation: isPromoOrientation(s.orientation) ? s.orientation : 'both',
      },
    ]
  })
  return Response.json({ slides }, { headers })
}
