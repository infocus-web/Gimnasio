import type { NextRequest } from 'next/server'
import { getPublicToday } from '@/features/public/today'

/**
 * "Hoy en el gimnasio" para la web pública (/<gym>/hoy).
 * GET → public_today(): mensaje, gente ahora y clases que siguen hoy. Sin datos de socios.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const data = await getPublicToday(org)
  return Response.json(data ?? { status: 'error' }, {
    status: data ? 200 : 500,
    headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
  })
}
