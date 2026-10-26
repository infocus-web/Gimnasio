'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { Mail, KeyRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { safeInternalPath } from '@/lib/safe-path'

/** Solo rutas internas: evita redirecciones abiertas a otros sitios. */
function safeNext(value: string | null) {
  return safeInternalPath(value, '/evolution/app/pase')
}

export function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = safeNext(params.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'link' | 'password'>('link')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(params.get('error') ? 'El link venció o ya se usó. Pedí uno nuevo.' : null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('sending')
    setMessage(null)
    const supabase = createClient()
    if (mode === 'link') {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false, // solo socios/staff ya cargados por el gimnasio
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      })
      if (error) {
        setStatus('error')
        const code = error.code ?? ''
        setMessage(
          code.includes('rate_limit') || error.status === 429
            ? 'Ya te mandamos un link hace un momento. Revisá tu correo (también Spam) o probá de nuevo en un minuto.'
            : code === 'otp_disabled' || code === 'signup_disabled' || code === 'user_not_found' || error.status === 422
              ? 'No encontramos ese email. Pedile a recepción que lo cargue en tu ficha.'
              : 'No pudimos enviar el link. Probá de nuevo en un minuto.',
        )
      } else {
        setStatus('sent')
      }
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setStatus('error')
      setMessage(
        error?.code === 'email_not_confirmed'
          ? 'Tu cuenta todavía no está activada: abrí el mail que te mandamos o pedí una contraseña nueva en el gimnasio.'
          : 'Email o contraseña incorrectos.',
      )
      return
    }
    router.replace(next as Route)
    router.refresh()
  }

  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-white/10 bg-[#141414] p-6 sm:p-8">
        <div>
          <h1 className="font-display text-4xl font-black uppercase leading-none text-white">
            Evolution <span className="text-brand">Fitness</span>
          </h1>
          <p className="mt-2 text-sm text-zinc-400">Ingresá a tu cuenta de socio</p>
        </div>

        {status === 'sent' ? (
          <div className="space-y-3">
            <p role="status" className="rounded-2xl border border-[#edcc36]/30 bg-[#edcc36]/10 p-4 text-sm text-zinc-100">
              Te mandamos un link a <strong>{email}</strong>. Abrí el email y tocá el link para entrar. Si no llega en un par de
              minutos, revisá la carpeta de Spam o Promociones.
            </p>
            <button
              type="button"
              onClick={() => {
                setStatus('idle')
                setMessage(null)
              }}
              className="min-h-[44px] w-full text-sm text-zinc-400 underline-offset-4 hover:text-white hover:underline"
            >
              Usar otro email o pedir otro link
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label className="block space-y-1">
              <span className="text-sm text-zinc-300">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-[48px] w-full rounded-xl border border-zinc-800 bg-black px-4 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
              />
            </label>
            {mode === 'password' && (
              <label className="block space-y-1">
                <span className="text-sm text-zinc-300">Contraseña</span>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="min-h-[48px] w-full rounded-xl border border-zinc-800 bg-black px-4 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
                />
              </label>
            )}
            {message && (
              <p role="alert" className="text-sm text-red-300">
                {message}
              </p>
            )}
            <button
              type="submit"
              disabled={status === 'sending'}
              className="relative flex min-h-[54px] w-full items-center justify-center gap-2 border border-brand bg-brand text-xs font-bold uppercase tracking-[0.18em] text-black transition-colors hover:border-white hover:bg-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <span className="pointer-events-none absolute left-0 top-0 h-1.5 w-1.5 border-l-2 border-t-2 border-black" aria-hidden="true" />
              <span className="pointer-events-none absolute bottom-0 right-0 h-1.5 w-1.5 border-b-2 border-r-2 border-black" aria-hidden="true" />
              {mode === 'link' ? <Mail className="h-5 w-5" aria-hidden="true" /> : <KeyRound className="h-5 w-5" aria-hidden="true" />}
              {status === 'sending' ? 'Enviando…' : mode === 'link' ? 'Enviarme un link para entrar' : 'Entrar'}
            </button>
            <button
              type="button"
              onClick={() => setMode(mode === 'link' ? 'password' : 'link')}
              className="min-h-[44px] w-full text-sm text-zinc-400 underline-offset-4 hover:text-white hover:underline"
            >
              {mode === 'link' ? 'Prefiero usar contraseña' : 'Prefiero recibir un link por email'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
