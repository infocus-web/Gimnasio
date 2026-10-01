'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { ShieldCheck, KeyRound, Mail, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/** Solo rutas del panel: evita redirecciones abiertas */
function safeNext(value: string | null) {
  return value && /^\/[a-z0-9-]+\/admin(\/|$|\?)/.test(value) ? value : '/evolution/admin'
}

export function StaffLoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = safeNext(params.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'password' | 'link'>('password')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [message, setMessage] = useState<string | null>(params.get('error') ? 'El link venció o ya se usó. Pedí uno nuevo.' : null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('sending')
    setMessage(null)
    const supabase = createClient()

    if (mode === 'link') {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}${next}` },
      })
      // Mismo mensaje exista o no el email: no revela quién es parte del equipo
      setStatus(error && !/not found|signups/i.test(error.message) ? 'idle' : 'sent')
      if (error && !/not found|signups/i.test(error.message)) setMessage('No se pudo enviar el link. Probá en unos minutos.')
      return
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.user) {
      setStatus('idle')
      setMessage(
        error?.code === 'email_not_confirmed'
          ? 'Tu cuenta todavía no está activada: abrí el mail que te mandamos o pedí una contraseña nueva en el gimnasio.'
          : 'Email o contraseña incorrectos.',
      )
      return
    }
    // Esta puerta es solo para el equipo
    const { data: staff } = await supabase.from('staff').select('id').eq('user_id', data.user.id).eq('active', true).limit(1)
    if (!staff?.length) {
      await supabase.auth.signOut()
      setStatus('idle')
      setMessage('Esta cuenta no pertenece al equipo del gimnasio. Si sos socio, ingresá desde la web.')
      return
    }
    router.replace(next as Route)
    router.refresh()
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[#050506] p-4">
      <div className="w-full max-w-sm space-y-6 rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-zinc-700 bg-zinc-900">
            <ShieldCheck className="h-6 w-6 text-[#edcc36]" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-extrabold text-white">Acceso equipo</h1>
            <p className="text-xs text-zinc-400">Administración, recepción y profesores</p>
          </div>
        </div>

        {status === 'sent' ? (
          <p role="status" className="rounded-2xl border border-zinc-700 bg-zinc-900 p-4 text-sm text-zinc-100">
            Si <strong>{email}</strong> pertenece al equipo, te llegó un link para entrar. Revisá tu correo (y el spam).
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label className="block space-y-1">
              <span className="text-sm text-zinc-300">Email</span>
              <input type="email" required autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="min-h-[48px] w-full rounded-xl border border-zinc-800 bg-black px-4 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]" />
            </label>
            {mode === 'password' && (
              <label className="block space-y-1">
                <span className="text-sm text-zinc-300">Contraseña</span>
                <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
                  className="min-h-[48px] w-full rounded-xl border border-zinc-800 bg-black px-4 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]" />
              </label>
            )}
            {message && (
              <p role="alert" className="text-sm text-red-300">
                {message}
              </p>
            )}
            <button type="submit" disabled={status === 'sending'}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#edcc36] font-bold text-black disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              {status === 'sending' ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : mode === 'password' ? <KeyRound className="h-5 w-5" aria-hidden="true" /> : <Mail className="h-5 w-5" aria-hidden="true" />}
              {mode === 'password' ? 'Entrar' : 'Enviarme un link'}
            </button>
            <button type="button" onClick={() => setMode(mode === 'password' ? 'link' : 'password')}
              className="min-h-[44px] w-full text-sm text-zinc-400 underline-offset-4 hover:text-white hover:underline">
              {mode === 'password' ? 'Olvidé mi contraseña / entrar con link por email' : 'Entrar con contraseña'}
            </button>
          </form>
        )}
        <p className="text-center text-xs text-zinc-600">Dueño y administradores: se pide el código de 2 pasos.</p>
      </div>
    </main>
  )
}
