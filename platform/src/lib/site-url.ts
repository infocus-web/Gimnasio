import 'server-only'
import { headers } from 'next/headers'

/**
 * URL pública del sitio para links en emails. No se arma con el header Host
 * (lo controla quien hace el pedido): primero variables de entorno.
 */
export async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  const h = await headers()
  return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`   // desarrollo local
}
