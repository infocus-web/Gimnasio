'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { Dumbbell, Mail, KeyRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/** Solo rutas internas: evita redirecciones abiertas a otros sitios. */
function safeNext(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/evolution/app/pase'
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
        setMessage('No encontramos ese email. Pedile a recepción que lo cargue en tu ficha.')
      } else {
        setStatus('sent')
      }
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setStatus('error')
      setMessage('Email o contraseña incorrectos.')
      return
    }
    router.replace(next as Route)
    router.refresh()
  }

  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-sm space-y-6 rounded-3xl border border-[#edcc36]/20 bg-zinc-950 p-6 shadow-[0_0_25px_-5px_rgba(237,204,54,0.15)]">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-[#edcc36]/40 bg-[#edcc36]/10">
            <Dumbbell className="h-6 w-6 text-[#edcc36]" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-extrabold text-white">Evolution Fitness</h1>
            <p className="text-xs text-zinc-400">Ingresá a tu cuenta</p>
          </div>
        </div>

        {status === 'sent' ? (
          <p role="status" className="rounded-2xl border border-[#edcc36]/30 bg-[#edcc36]/10 p-4 text-sm text-zinc-100">
            Te mandamos un link a <strong>{email}</strong>. Abrilo desde este mismo celular para entrar.
          </p>
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
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#edcc36] font-bold text-black disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {mode === 'link' ? <Mail className="h-5 w-5" aria-hidden="true" /> : <KeyRound className="h-5 w-5" aria-hidden="true" />}
              {status === 'sending' ? 'Enviando…' : mode === 'link' ? 'Enviarme un link para entrar' : 'Entrar'}
            </button>
            <button
              type="button"
              onClick={() => setMode(mode === 'link' ? 'password' : 'link')}
              className="min-h-[44px] w-full text-sm text-zinc-400 underline-offset-4 hover:text-white hover:underline"
            >
              {mode === 'link' ? 'Prefiero usar contraseña (staff)' : 'Prefiero recibir un link por email'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
