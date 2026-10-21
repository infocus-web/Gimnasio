import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://evolutiongym.fitness').replace(/\/$/, '')

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: 'Evolution Fitness GYM', template: '%s · Evolution Fitness' },
  description: 'Musculación, clases y entrenamiento personalizado. Tu pase, tus clases y tu progreso en una sola app.',
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    siteName: 'Evolution Fitness GYM',
    images: [{ url: '/img/hero.jpg', width: 1200, height: 630, alt: 'Evolution Fitness GYM' }],
  },
  twitter: { card: 'summary_large_image' },
  applicationName: 'Evolution Fitness GYM',
  appleWebApp: { capable: true, title: 'Evolution', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icon-192.png', apple: '/apple-touch-icon.png' },
}
export const viewport: Viewport = { themeColor: '#09090b', width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es-AR" className={inter.variable}>
      <body className="min-h-dvh bg-ink font-sans text-zinc-100 antialiased selection:bg-brand/30 selection:text-brand">
        {children}
      </body>
    </html>
  )
}
