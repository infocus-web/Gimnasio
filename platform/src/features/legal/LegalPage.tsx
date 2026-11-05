import Image from 'next/image'
import Link from 'next/link'
import type { Route } from 'next'
import { BRAND } from '@/features/public/media'
import { display, text } from '@/features/public/fonts'

/** Marco común de las páginas legales (privacidad / términos). */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className={`${display.variable} ${text.variable} min-h-dvh bg-black font-text text-[#e9e7e1]`}>
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-8">
        <Link href={'/evolution' as Route} aria-label="Volver a la web">
          <Image src={BRAND.logo} alt="Evolution Fitness Gym" width={BRAND.logoWidth} height={BRAND.logoHeight} className="h-9 w-auto" />
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-8">
        <h1 className="font-display text-4xl font-bold tracking-[-0.03em] text-white">{title}</h1>
        <p className="mt-2 text-sm text-white/45">Última actualización: {updated}</p>
        <div className="legal mt-8 space-y-6 text-[17px] leading-relaxed text-white/75 [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc [&_a]:text-brand [&_a]:underline">
          {children}
        </div>
      </main>
    </div>
  )
}

export function contactLine(email?: string, whatsapp?: string) {
  const parts: string[] = []
  if (email) parts.push(`por email a ${email}`)
  if (whatsapp) parts.push(`por WhatsApp al ${whatsapp}`)
  parts.push('o en la recepción del gimnasio')
  return parts.join(', ')
}
