import type { MetadataRoute } from 'next'

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://evolutiongym.fitness').replace(/\/$/, '')

/** Buscadores: solo la web pública del gimnasio; el panel, la app y el molinete no se indexan. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/*/admin', '/*/app', '/*/molinete', '/api/', '/iclock/', '/auth/', '/mfa', '/equipo'] }],
    sitemap: `${SITE}/sitemap.xml`,
  }
}
