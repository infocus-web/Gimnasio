import type { MetadataRoute } from 'next'

/** Permite instalar la app en el celular (Android / Chrome) como una app más */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Evolution Fitness GYM',
    short_name: 'Evolution',
    description: 'Tu pase, tus clases y tu entrenamiento.',
    id: '/evolution/app',
    start_url: '/evolution/app',   // socios → su pase; el equipo sin ficha de socio va al panel
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#09090b',
    theme_color: '#09090b',
    lang: 'es-AR',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Mi pase', url: '/evolution/app/pase', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'Clases', url: '/evolution/app/clases', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'Panel del equipo', url: '/equipo?next=/evolution/admin', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
    ],
  }
}
