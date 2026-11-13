import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { getPublicGym } from '@/features/public/profile'
import { SignageScreen } from './SignageScreen'

export const metadata: Metadata = {
  title: 'Pantalla',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { themeColor: '#000000' }

/**
 * Televisores del gimnasio: pasan a pantalla completa las imágenes que el administrador
 * carga en Panel → Pantalla del molinete (las mismas que la tablet). Sin cámara ni vinculación.
 * Opcional: ?seg=10 para cambiar cada cuántos segundos pasa la imagen (3 a 60).
 */
export default async function SignagePage({ params, searchParams }: PageProps<'/[org]/pantalla'>) {
  const { org: slug } = await params
  const gym = await getPublicGym(slug)
  if (!gym) notFound()
  const seg = Number((await searchParams).seg)
  const seconds = Number.isFinite(seg) ? Math.min(60, Math.max(3, Math.round(seg))) : 8
  return <SignageScreen slug={slug} gymName={gym.name} seconds={seconds} />
}
