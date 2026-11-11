import { Suspense } from 'react'
import type { Metadata, Route } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeInternalPath } from '@/lib/safe-path'
import Image from 'next/image'
import { LoginForm } from './LoginForm'
import { display, text } from '@/features/public/fonts'
import { WEB_MEDIA } from '@/features/public/media'

export const metadata: Metadata = { title: 'Ingresar' }

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  // Si ya tiene la sesión abierta (ej. tocó "Anotarme" en la web), va directo a donde iba.
  const sp = await searchParams
  const rawNext = typeof sp.next === 'string' ? sp.next : null
  if (rawNext) {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    if (data.user) redirect(safeInternalPath(rawNext, '/evolution/app/pase') as Route)
  }

  return (
    <div className={`${display.variable} ${text.variable} grid min-h-dvh bg-black font-text lg:grid-cols-2`}>
      <aside className="relative isolate hidden overflow-hidden lg:flex lg:flex-col lg:justify-end lg:p-12">
        <Image src={WEB_MEDIA.app} alt="" fill priority sizes="50vw" className="-z-20 object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black via-black/40 to-black/10" aria-hidden="true" />
        <p className="max-w-md font-display text-5xl font-bold leading-[1.02] tracking-[-0.035em] text-white">Tu rutina, tus clases y tu plan</p>
        <p className="mt-4 max-w-sm text-white/70">Entrá con tu email y tu contraseña. ¿Primera vez? Creá tu cuenta.</p>
      </aside>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  )
}
