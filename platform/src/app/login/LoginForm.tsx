'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import Image from 'next/image'
import { Eye, EyeOff, Loader2, MailCheck } from 'lucide-react'
import { BRAND } from '@/features/public/media'
import { createClient } from '@/lib/supabase/client'
import { safeInternalPath } from '@/lib/safe-path'

/** Solo rutas internas: evita redirecciones abiertas a otros sitios. */
function safeNext(value: string | null) {
  return safeInternalPath(value, '/evolution/app/pase')
}

type Mode = 'login' | 'signup' | 'reset'
const MIN = 8

/**
 * Acceso simple para todos (socios y quien se quiere inscribir):
 *  · Crear cuenta: email + contraseña → llega UN email "Confirmá tu cuenta" → al tocarlo queda adentro.
 *  · Ingresar: email + contraseña. La sesión queda guardada (no hay que volver a entrar).
 *  · Olvidé mi contraseña: llega un link para elegir una nueva (/cuenta/clave).
 */
export function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = safeNext(params.get('next'))
  const [mode, setMode] = useState<Mode>(params.get('modo') === 'crear' ? 'signup' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<null | 'signup' | 'reset'>(null)
  const [message, setMessage] = useState<string | null>(
    params.get('error') ? 'El link venció o ya se usó. Ingresá con tu email y contraseña, o pedí uno nuevo.' : null,
  )

  const go = (m: Mode) => {
    setMode(m)
    setMessage(null)
    setSent(null)
  }

  const callback = (path: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(path)}`
  const rateLimited = (e: { status?: number; code?: string }) => e.status === 429 || (e.code ?? '').includes('rate_limit')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    const mail = email.trim().toLowerCase()
    if (mode !== 'reset' && password.length < MIN) {
      setMessage(`La contraseña tiene que tener al menos ${MIN} caracteres.`)
      return
    }
    setBusy(true)
    const supabase = createClient()
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: mail, password })
        if (error) {
          setMessage(
            error.code === 'email_not_confirmed'
              ? 'Todavía no confirmaste tu email. Abrí el mail "Confirmá tu cuenta" que te mandamos (mirá también en Spam).'
              : rateLimited(error)
                ? 'Demasiados intentos. Esperá un minuto y probá de nuevo.'
                : 'Email o contraseña incorrectos. Si nunca elegiste una contraseña, tocá "Olvidé mi contraseña".',
          )
          return
        }
        router.replace(next as Route)
        router.refresh()
        return
      }

      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: mail,
          password,
          options: { emailRedirectTo: callback(next) },
        })
        if (error) {
          setMessage(
            rateLimited(error)
              ? 'Ya te mandamos el email hace un momento. Revisá tu correo (también Spam) o probá en un minuto.'
              : /weak|pwned|leaked/i.test(error.message)
                ? 'Esa contraseña es muy fácil o apareció en filtraciones. Elegí otra.'
                : /already|registered|exists/i.test(error.message)
                  ? 'Ese email ya tiene cuenta. Ingresá, o tocá "Olvidé mi contraseña" para elegir una.'
                  : 'No pudimos crear la cuenta. Probá de nuevo en un minuto.',
          )
          return
        }
        // Si el email ya existe, Supabase no da error: devuelve el usuario sin identidades.
        if (data.user && (data.user.identities?.length ?? 0) === 0) {
          setMode('login')
          setMessage('Ese email ya tiene cuenta. Ingresá con tu contraseña, o tocá "Olvidé mi contraseña" para elegir una nueva.')
          return
        }
        // Si la confirmación de email estuviera apagada, ya queda adentro.
        if (data.session) {
          router.replace(next as Route)
          router.refresh()
          return
        }
        setSent('signup')
        return
      }

      // Olvidé mi contraseña
      const { error } = await supabase.auth.resetPasswordForEmail(mail, {
        redirectTo: callback(`/cuenta/clave?next=${encodeURIComponent(next)}`),
      })
      if (error && rateLimited(error)) {
        setMessage('Ya te mandamos el link hace un momento. Revisá tu correo (también Spam) o probá en un minuto.')
        return
      }
      setSent('reset') // por seguridad no se dice si el email existe o no
    } finally {
      setBusy(false)
    }
  }

  const input =
    'min-h-[52px] w-full rounded-xl border border-zinc-800 bg-black px-4 text-base text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]'
  const title = mode === 'signup' ? 'Crear cuenta' : mode === 'reset' ? 'Olvidé mi contraseña' : 'Ingresar'

  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-white/10 bg-[#141414] p-6 sm:p-8">
        <div>
          <Image src={BRAND.logo} alt="Evolution Fitness Gym" width={BRAND.logoWidth} height={BRAND.logoHeight} priority sizes="240px" className="h-10 w-auto" />
          <h1 className="mt-4 text-2xl font-extrabold text-white">{title}</h1>
        </div>

        {mode !== 'reset' && !sent && (
          <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-black p-1">
            {(['login', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => go(m)}
                className={`min-h-[44px] rounded-lg text-sm font-bold transition-colors ${
                  mode === m ? 'bg-[#edcc36] text-black' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {m === 'login' ? 'Ingresar' : 'Crear cuenta'}
              </button>
            ))}
          </div>
        )}

        {sent ? (
          <div className="space-y-4">
            <div role="status" className="space-y-2 rounded-2xl border border-[#edcc36]/30 bg-[#edcc36]/10 p-4 text-sm text-zinc-100">
              <MailCheck className="h-6 w-6 text-[#edcc36]" aria-hidden="true" />
              {sent === 'signup' ? (
                <p>
                  Listo. Te mandamos un email a <strong>{email}</strong>. Abrilo y tocá <strong>“Confirmar cuenta”</strong>. Es una sola
                  vez: después entrás siempre con tu email y tu contraseña.
                </p>
              ) : (
                <p>
                  Si <strong>{email}</strong> tiene cuenta, te llega un email con el botón <strong>“Elegir contraseña nueva”</strong>.
                </p>
              )}
              <p className="text-zinc-400">Si no lo ves en un par de minutos, mirá en Spam o Promociones.</p>
            </div>
            <button
              type="button"
              onClick={() => go('login')}
              className="btn-tac min-h-[52px] w-full rounded-xl border border-zinc-700 font-bold text-white hover:border-white"
            >
              Ya lo confirmé · Ingresar
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block space-y-1">
              <span className="text-sm text-zinc-300">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={input}
              />
            </label>

            {mode !== 'reset' && (
              <label className="block space-y-1">
                <span className="text-sm text-zinc-300">{mode === 'signup' ? 'Elegí una contraseña' : 'Contraseña'}</span>
                <span className="relative block">
                  <input
                    type={show ? 'text' : 'password'}
                    required
                    minLength={MIN}
                    maxLength={72}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${input} pr-14`}
                  />
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute inset-y-0 right-0 grid w-12 place-items-center text-zinc-400 hover:text-white"
                  >
                    {show ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                  </button>
                </span>
                {mode === 'signup' && <span className="block text-xs text-zinc-500">Mínimo {MIN} caracteres.</span>}
              </label>
            )}

            {mode === 'reset' && <p className="text-sm text-zinc-400">Escribí tu email y te mandamos un link para elegir una contraseña nueva.</p>}

            {message && (
              <p role="alert" className="text-sm text-red-300">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="btn-tac relative flex min-h-[54px] w-full items-center justify-center gap-2 border border-brand bg-brand text-sm font-bold uppercase tracking-[0.14em] text-black transition-colors hover:border-white hover:bg-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
              {mode === 'login' ? 'Ingresar' : mode === 'signup' ? 'Crear cuenta' : 'Enviarme el link'}
            </button>

            {mode === 'login' && (
              <button type="button" onClick={() => go('reset')} className="min-h-[44px] w-full text-sm text-zinc-400 underline-offset-4 hover:text-white hover:underline">
                Olvidé mi contraseña
              </button>
            )}
            {mode === 'reset' && (
              <button type="button" onClick={() => go('login')} className="min-h-[44px] w-full text-sm text-zinc-400 underline-offset-4 hover:text-white hover:underline">
                ← Volver a ingresar
              </button>
            )}
          </form>
        )}
      </div>
    </main>
  )
}
