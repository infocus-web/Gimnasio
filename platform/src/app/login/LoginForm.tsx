'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import Image from 'next/image'
import { Mail, KeyRound, ArrowLeft } from 'lucide-react'
import { BRAND } from '@/features/public/media'
import { createClient } from '@/lib/supabase/client'
import { safeInternalPath } from '@/lib/safe-path'
import { emailForDniLogin, resetPasswordWithCode, sendPasswordResetCode } from './actions'

/** Solo rutas internas: evita redirecciones abiertas a otros sitios. */
function safeNext(value: string | null) {
  return safeInternalPath(value, '/evolution/app/pase')
}

/**
 * Ingreso de socios:
 *  · password (por defecto): DNI o email + contraseña.
 *  · code: código de 6 números por email (sin contraseña).
 *  · reset: "Olvidé mi contraseña" → código por email + contraseña nueva, todo sin salir de la app.
 *  · newpass: ya tiene sesión (entró por el botón del email de recuperación) y elige la contraseña nueva.
 * Todo pasa dentro de la app: en iPhone, abrir un link del email lleva a Safari y la sesión quedaba allá.
 */
type Mode = 'password' | 'code' | 'reset' | 'newpass'

const inputCls =
  'min-h-[48px] w-full rounded-xl border border-zinc-800 bg-black px-4 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]'
const codeCls =
  'min-h-[56px] w-full rounded-xl border border-zinc-800 bg-black px-4 text-center text-2xl tracking-[0.4em] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]'
const primaryCls =
  'btn-tac relative flex min-h-[54px] w-full items-center justify-center gap-2 border border-brand bg-brand text-xs font-bold uppercase tracking-[0.18em] text-black transition-colors hover:border-white hover:bg-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white'
const linkCls = 'min-h-[44px] w-full text-sm text-zinc-400 underline-offset-4 hover:text-white hover:underline'

const isEmail = (s: string) => s.includes('@')

export function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = safeNext(params.get('next'))
  const [mode, setMode] = useState<Mode>(params.get('nueva') ? 'newpass' : 'password')
  const [user, setUser] = useState('') // DNI o email
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(params.get('error') ? 'El link venció o ya se usó. Pedí uno nuevo.' : null)

  const go = (m: Mode) => {
    setMode(m)
    setMessage(null)
    setCode('')
    setCodeSent(false)
    setPassword('')
    setPassword2('')
  }
  const done = () => {
    router.replace(next as Route)
    router.refresh()
  }

  /** DNI o email + contraseña */
  const loginWithPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    let email = user.trim().toLowerCase()
    if (!isEmail(email)) {
      const r = await emailForDniLogin(email, password)
      if (!r.ok) {
        setBusy(false)
        setMessage(r.error)
        return
      }
      email = r.email
    }
    const { error } = await createClient().auth.signInWithPassword({ email, password })
    if (error) {
      setBusy(false)
      setMessage(
        error.code === 'email_not_confirmed'
          ? 'Tu cuenta todavía no está activada. Tocá "Olvidé mi contraseña" para elegir una y entrar.'
          : error.status === 429
            ? 'Demasiados intentos. Esperá un minuto y probá de nuevo.'
            : isEmail(user)
              ? 'Email o contraseña incorrectos.'
              : 'DNI o contraseña incorrectos.',
      )
      return
    }
    done()
  }

  /** Entrar con un código por email (sin contraseña) */
  const sendLoginCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const { error } = await createClient().auth.signInWithOtp({
      email: user.trim().toLowerCase(),
      options: {
        shouldCreateUser: false, // solo socios/staff ya cargados por el gimnasio
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
    setBusy(false)
    if (error) {
      const c = error.code ?? ''
      setMessage(
        c.includes('rate_limit') || error.status === 429
          ? 'Ya te mandamos un código hace un momento. Revisá tu correo (también Spam) o probá de nuevo en un minuto.'
          : c === 'otp_disabled' || c === 'signup_disabled' || c === 'user_not_found' || error.status === 422
            ? 'No encontramos ese email. Pedile a recepción que lo cargue en tu ficha.'
            : 'No pudimos enviar el código. Probá de nuevo en un minuto.',
      )
      return
    }
    setCode('')
    setCodeSent(true)
  }
  const verifyLoginCode = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = code.replace(/\D/g, '')
    if (token.length < 6) return setMessage('El código tiene 6 números.')
    setBusy(true)
    setMessage(null)
    const { error } = await createClient().auth.verifyOtp({ email: user.trim().toLowerCase(), token, type: 'email' })
    if (error) {
      setBusy(false)
      setMessage(error.status === 429 ? 'Demasiados intentos. Esperá un minuto y probá de nuevo.' : 'El código no es correcto o ya venció. Revisalo o pedí uno nuevo.')
      return
    }
    done()
  }

  /** Olvidé mi contraseña */
  const sendResetCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const r = await sendPasswordResetCode(user)
    setBusy(false)
    if (!r.ok) return setMessage(r.error)
    setCode('')
    setCodeSent(true)
  }
  const saveNewPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) return setMessage('La contraseña tiene que tener al menos 8 caracteres.')
    if (password !== password2) return setMessage('Las dos contraseñas no coinciden.')
    setBusy(true)
    setMessage(null)
    if (mode === 'reset') {
      const r = await resetPasswordWithCode(user, code, password)
      if (!r.ok) {
        setBusy(false)
        setMessage(r.error)
        if (r.loggedIn) {
          setMode('newpass') // el código ya se usó: solo falta la contraseña
          setPassword('')
          setPassword2('')
        }
        return
      }
      return done()
    }
    // newpass: ya tiene sesión
    const { error } = await createClient().auth.updateUser({ password })
    if (error && error.code !== 'same_password') {
      setBusy(false)
      setMessage(
        error.code === 'weak_password'
          ? 'Esa contraseña es muy fácil. Probá con otra más larga o con números.'
          : error.status === 401 || error.code === 'session_not_found'
            ? 'Tu sesión venció. Pedí un código nuevo con "Olvidé mi contraseña".'
            : 'No pudimos guardar la contraseña nueva. Probá de nuevo.',
      )
      return
    }
    done()
  }

  const alert = message && (
    <p role="alert" className="text-sm text-red-300">
      {message}
    </p>
  )
  const newPasswordFields = (
    <>
      <label className="block space-y-1">
        <span className="text-sm text-zinc-300">Contraseña nueva</span>
        <input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        <span className="block text-xs text-zinc-500">Mínimo 8 caracteres.</span>
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-zinc-300">Repetí la contraseña</span>
        <input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} className={inputCls} />
      </label>
    </>
  )
  const codeField = (
    <label className="block space-y-1">
      <span className="text-sm text-zinc-300">Código del email</span>
      <input
        type="text"
        required
        autoFocus
        autoComplete="one-time-code"
        inputMode="numeric"
        pattern="[0-9 ]*"
        maxLength={12}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className={codeCls}
      />
    </label>
  )

  const title = { password: 'Ingresá a tu cuenta de socio', code: 'Entrar con un código por email', reset: 'Recuperar tu contraseña', newpass: 'Elegí tu contraseña nueva' }[mode]

  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-white/10 bg-[#141414] p-6 sm:p-8">
        <div>
          <h1>
            <Image src={BRAND.logo} alt="Evolution Fitness Gym" width={BRAND.logoWidth} height={BRAND.logoHeight} priority sizes="240px" className="h-10 w-auto" />
          </h1>
          <p className="mt-2 text-sm text-zinc-400">{title}</p>
        </div>

        {mode === 'password' && (
          <form onSubmit={loginWithPassword} className="space-y-3">
            <label className="block space-y-1">
              <span className="text-sm text-zinc-300">DNI o email</span>
              <input type="text" required autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={user} onChange={(e) => setUser(e.target.value)} className={inputCls} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-zinc-300">Contraseña</span>
              <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
            </label>
            {alert}
            <button type="submit" disabled={busy} className={primaryCls}>
              <KeyRound className="h-5 w-5" aria-hidden="true" />
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
            <button type="button" onClick={() => go('reset')} className={linkCls}>
              Olvidé mi contraseña
            </button>
            <button type="button" onClick={() => go('code')} className={linkCls}>
              Prefiero entrar con un código por email
            </button>
          </form>
        )}

        {mode === 'code' && !codeSent && (
          <form onSubmit={sendLoginCode} className="space-y-3">
            <label className="block space-y-1">
              <span className="text-sm text-zinc-300">Email</span>
              <input type="email" required autoComplete="email" inputMode="email" value={user} onChange={(e) => setUser(e.target.value)} className={inputCls} />
            </label>
            {alert}
            <button type="submit" disabled={busy} className={primaryCls}>
              <Mail className="h-5 w-5" aria-hidden="true" />
              {busy ? 'Enviando…' : 'Enviarme un código'}
            </button>
          </form>
        )}

        {mode === 'code' && codeSent && (
          <form onSubmit={verifyLoginCode} className="space-y-3">
            <p role="status" className="rounded-2xl border border-[#edcc36]/30 bg-[#edcc36]/10 p-4 text-sm text-zinc-100">
              Te mandamos un código a <strong>{user}</strong>. Escribilo acá abajo. Si no llega en un par de minutos, revisá Spam o Promociones.
            </p>
            {codeField}
            {alert}
            <button type="submit" disabled={busy} className={primaryCls}>
              <KeyRound className="h-5 w-5" aria-hidden="true" />
              {busy ? 'Verificando…' : 'Entrar'}
            </button>
            <button type="button" onClick={() => go('code')} className={linkCls}>
              Usar otro email o pedir otro código
            </button>
          </form>
        )}

        {mode === 'reset' && !codeSent && (
          <form onSubmit={sendResetCode} className="space-y-3">
            <p className="text-sm text-zinc-400">Te mandamos un código al email de tu cuenta para que elijas una contraseña nueva.</p>
            <label className="block space-y-1">
              <span className="text-sm text-zinc-300">DNI o email</span>
              <input type="text" required autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={user} onChange={(e) => setUser(e.target.value)} className={inputCls} />
            </label>
            {alert}
            <button type="submit" disabled={busy} className={primaryCls}>
              <Mail className="h-5 w-5" aria-hidden="true" />
              {busy ? 'Enviando…' : 'Enviarme el código'}
            </button>
          </form>
        )}

        {mode === 'reset' && codeSent && (
          <form onSubmit={saveNewPassword} className="space-y-3">
            <p role="status" className="rounded-2xl border border-[#edcc36]/30 bg-[#edcc36]/10 p-4 text-sm text-zinc-100">
              Si hay una cuenta con ese dato, te mandamos un código al email. Escribilo acá y elegí tu contraseña nueva. Si no llega en un par de minutos, revisá Spam o Promociones.
            </p>
            {codeField}
            {newPasswordFields}
            {alert}
            <button type="submit" disabled={busy} className={primaryCls}>
              <KeyRound className="h-5 w-5" aria-hidden="true" />
              {busy ? 'Guardando…' : 'Guardar y entrar'}
            </button>
            <button type="button" onClick={() => go('reset')} className={linkCls}>
              No me llegó: pedir otro código
            </button>
          </form>
        )}

        {mode === 'newpass' && (
          <form onSubmit={saveNewPassword} className="space-y-3">
            {newPasswordFields}
            {alert}
            <button type="submit" disabled={busy} className={primaryCls}>
              <KeyRound className="h-5 w-5" aria-hidden="true" />
              {busy ? 'Guardando…' : 'Guardar y entrar'}
            </button>
          </form>
        )}

        {mode !== 'password' && (
          <button type="button" onClick={() => go('password')} className={`${linkCls} flex items-center justify-center gap-1.5`}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver a entrar con contraseña
          </button>
        )}
      </div>
    </main>
  )
}
