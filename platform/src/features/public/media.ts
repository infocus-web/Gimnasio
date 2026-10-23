/**
 * Fotos y videos de la web pública (Envato Elements, licencia de Evolution).
 * Están en /public/img/web. Si el perfil del gimnasio en la base trae su propia
 * imagen para una actividad, se usa la de acá solo cuando la actividad tiene
 * foto propia en este mapa (son las que reemplazan a las de stock viejas).
 */
export const WEB_MEDIA = {
  heroVideo: '/img/web/hero.mp4',
  heroPoster: '/img/web/hero-poster.jpg',
  about: ['/img/web/nosotros-1.jpg', '/img/web/nosotros-2.jpg'],
  app: '/img/web/app.jpg',
  cta: '/img/web/cta.jpg',
  gallery: [
    '/img/web/galeria-1.jpg',
    '/img/web/galeria-2.jpg',
    '/img/web/galeria-3.jpg',
    '/img/web/galeria-4.jpg',
  ],
} as const

const ACTIVITY_IMAGES: Record<string, string> = {
  spinning: '/img/web/spinning.jpg',
  funcional: '/img/web/funcional.jpg',
  musculacion: '/img/web/musculacion.jpg',
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function activityImage(name: string, fallback: string | null) {
  return ACTIVITY_IMAGES[norm(name)] ?? fallback
}
