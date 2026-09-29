import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import type { Route } from 'next'
import type { EmailOtpType } from '@supabase/supabase-js'
import { Dumbbell } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { safeInternalPath } from '@/lib/safe-path'

export const metadata: Metadata = { title: 'Entrar' }

const TYPES: EmailOtpType[] = ['email', 'magiclink', 'invite', 'signup', 'recovery', 'email_change']

/**
 * Destino de los links de los emails (plantillas con {{ .TokenHash }}).
 * El token se canjea recién cuando la persona toca "Entrar": los antivirus
 * y previsualizadores de Gmail abren los links solos y los "gastarían".
 * Funciona aunque el link se abra en otro dispositivo o navegador.
 */
function safeNext(raw: string | undefined) {
  if (!raw) return '/evolution/app/pase'
  let value = raw
  // Las plantillas mandan {{ .RedirectTo }}, que puede venir como URL absoluta
  // (https://…/auth/callback?next=/evolution/app/pase). Nos quedamos con el path.
  if (/^https?:\/\//.test(value)) {
    try {
      const u = new URL(value)
      value = u.pathname === '/auth/callback' ? (u.searchParams.get('next') ?? '/') : `${u.pathname}${u.search}`
    } catch {
      return '/evolution/app/pase'
    }
  }
  return safeInternalPath(value, '/evolution/app/pase')
}

export default async function ConfirmPage({ searchParams }: PageProps<'/auth/confirm'>) {
  const sp = await searchParams
  const tokenHash = typeof sp.token_hash === 'string' ? sp.token_hash : ''
  const type = (typeof sp.type === 'string' ? sp.type : '') as EmailOtpType
  const next = safeNext(typeof sp.next === 'string' ? sp.next : undefined)
  const valid = tokenHash && TYPES.includes(type)

  async function confirm() {
    'use server'
    if (!valid) redirect('/login?error=link')
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (error) redirect('/login?error=link')
    redirect(next as Route)
  }

  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-sm space-y-6 rounded-3xl border border-[#edcc36]/20 bg-zinc-950 p-6 text-center shadow-[0_0_25px_-5px_rgba(237,204,54,0.15)]">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-[#edcc36]/40 bg-[#edcc36]/10">
          <Dumbbell className="h-6 w-6 text-[#edcc36]" aria-hidden="true" />
        </span>
        {valid ? (
          <>
            <div className="space-y-1">
              <h1 className="text-lg font-extrabold text-white">
                {type === 'invite' ? '¡Bienvenido a Evolution Fitness!' : 'Entrar a Evolution Fitness'}
              </h1>
              <p className="text-sm text-zinc-400">Tocá el botón para ingresar a tu cuenta.</p>
            </div>
            <form action={confirm}>
              <button
                type="submit"
                className="min-h-[52px] w-full rounded-xl bg-[#edcc36] font-bold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Entrar
              </button>
            </form>
          </>
        ) : (
          <div className="space-y-2">
            <h1 className="text-lg font-extrabold text-white">Link inválido</h1>
            <p className="text-sm text-zinc-400">Pedí uno nuevo desde la pantalla de ingreso.</p>
            <a href="/login" className="inline-block pt-2 text-sm font-semibold text-[#edcc36]">
              Ir a ingresar
            </a>
          </div>
        )}
      </div>
    </main>
  )
}
