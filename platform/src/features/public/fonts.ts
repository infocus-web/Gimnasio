import { Barlow, Big_Shoulders } from 'next/font/google'

/** Titulares: grotesca condensada de cartelería, como los números de los discos. */
export const display = Big_Shoulders({
  subsets: ['latin'],
  weight: ['700', '800', '900'],
  variable: '--ff-display',
  display: 'swap',
})

/** Texto: Barlow, de la misma familia visual (ruta/señalética), muy legible. */
export const text = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--ff-text',
  display: 'swap',
})
