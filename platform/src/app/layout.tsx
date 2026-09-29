import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'Evolution Fitness', template: '%s · Evolution Fitness' },
  description: 'Tu pase, tus clases y tu entrenamiento.',
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
