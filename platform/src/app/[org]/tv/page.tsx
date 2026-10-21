import type { Metadata, Viewport } from 'next'
import { TvScreen } from '@/features/floor/TvScreen'

export const metadata: Metadata = { title: 'Pantalla de la sala', robots: { index: false, follow: false } }
export const viewport: Viewport = { themeColor: '#000000' }

/** Pantalla para el TV de la sala. Se vincula desde Panel → Máquinas → Pantalla de TV. */
export default async function TvPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  return <TvScreen slug={slug} />
}
