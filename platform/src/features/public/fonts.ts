import { DM_Sans } from 'next/font/google'

/**
 * Tipografía única de la plataforma: DM Sans (estilo W3Admin).
 * Se exporta dos veces con las variables de siempre (--ff-display y --ff-text)
 * para no tocar las clases font-display / font-sans que ya usan las pantallas.
 */
export const display = DM_Sans({
  subsets: ['latin'],
  weight: ['500', '700', '800', '900'],
  variable: '--ff-display',
  display: 'swap',
})

export const text = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--ff-text',
  display: 'swap',
})
