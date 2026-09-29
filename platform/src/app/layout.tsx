import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Evolution Fitness', template: '%s · Evolution Fitness' },
}
export const viewport: Viewport = { themeColor: '#0a0a0a', width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es-AR">
      <body className="min-h-dvh bg-ink text-white antialiased">{children}</body>
    </html>
  )
}
