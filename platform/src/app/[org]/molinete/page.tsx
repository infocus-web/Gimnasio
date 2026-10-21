import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { getPublicGym } from '@/features/public/profile'
import { TurnstileKiosk } from './TurnstileKiosk'

export const metadata: Metadata = {
  title: 'Molinete',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { themeColor: '#000000' }

/** Pantalla para la tablet junto al molinete de musculación. Se vincula desde Panel → Accesos. */
export default async function TurnstilePage({ params }: PageProps<'/[org]/molinete'>) {
  const { org: slug } = await params
  const gym = await getPublicGym(slug)
  if (!gym) notFound()
  return <TurnstileKiosk gymName={gym.name} storageKey={`molinete:${slug}`} />
}
