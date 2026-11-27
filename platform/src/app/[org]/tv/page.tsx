import type { Route } from 'next'
import { redirect } from 'next/navigation'

/**
 * Pantalla para el TV de la sala. Se vincula desde Panel → Pantallas.
 *
 * Todas las TVs usan la versión compatible (/<gym>/tv/lite): es liviana, anda en navegadores
 * viejos (Chrome 72) y nuevos (Fully Kiosk, Chromecast) y es la que tiene todo: pizarra del profe,
 * cronómetro con sonido, textos sobre las imágenes, publicidad con videos y música.
 * (La versión anterior en React, features/floor/TvScreen, queda sin usar.)
 */
export default async function TvPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  redirect(`/${slug}/tv/lite` as Route)
}
