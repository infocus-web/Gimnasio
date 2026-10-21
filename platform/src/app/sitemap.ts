import type { MetadataRoute } from 'next'

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://evolutiongym.fitness').replace(/\/$/, '')

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/evolution`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE}/evolution/padron`, changeFrequency: 'monthly', priority: 0.6 },
  ]
}
