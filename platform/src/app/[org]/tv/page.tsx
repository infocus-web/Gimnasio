import type { Metadata, Route, Viewport } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { TvScreen } from '@/features/floor/TvScreen'

export const metadata: Metadata = { title: 'Pantalla de la sala', robots: { index: false, follow: false } }
export const viewport: Viewport = { themeColor: '#000000' }

/** Chrome anterior al 111 (televisores viejos) no puede mostrar esta pantalla: va a la versión compatible */
function isOldChrome(ua: string) {
  const m = /Chrome\/(\d+)/.exec(ua)
  return !!m && Number(m[1]) < 111
}

/** Pantalla para el TV de la sala. Se vincula desde Panel → Pantallas. */
export default async function TvPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  if (isOldChrome((await headers()).get('user-agent') ?? '')) redirect(`/${slug}/tv/lite` as Route)
  return <TvScreen slug={slug} />
}
