import { Suspense } from 'react'
import type { Metadata } from 'next'
import Image from 'next/image'
import { LoginForm } from './LoginForm'
import { display, text } from '@/features/public/fonts'
import { WEB_MEDIA } from '@/features/public/media'

export const metadata: Metadata = { title: 'Ingresar' }

export default function LoginPage() {
  return (
    <div className={`${display.variable} ${text.variable} grid min-h-dvh bg-black font-text lg:grid-cols-2`}>
      <aside className="relative isolate hidden overflow-hidden lg:flex lg:flex-col lg:justify-end lg:p-12">
        <Image src={WEB_MEDIA.app} alt="" fill priority sizes="50vw" className="-z-20 object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black via-black/40 to-black/10" aria-hidden="true" />
        <p className="max-w-md font-display text-5xl font-bold leading-[1.02] tracking-[-0.035em] text-white">Tu rutina, tus clases y tu plan</p>
        <p className="mt-4 max-w-sm text-white/70">Entrá con el email que dejaste en recepción.</p>
      </aside>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  )
}
