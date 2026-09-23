import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Activity } from 'lucide-react'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { useAuth, useSettings } from '../lib/auth'
import { Button, Field } from '../components/ui'

type Mode = 'login' | 'signup' | 'reset'

export function Login() {
  const { session, loading } = useAuth()
  const { settings } = useSettings()
  const location = useLocation()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  if (!loading && session) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from && from !== '/login' ? from : '/admin'} replace />
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name }, emailRedirectTo: `${window.location.origin}/admin` },
        })
        if (error) throw error
        if (!data.session) setMsg({ ok: true, text: 'Te enviamos un email para confirmar la cuenta. Después podés ingresar.' })
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/cambiar-clave`,
        })
        if (error) throw error
        setMsg({ ok: true, text: 'Si el email existe, te llega un link para crear una nueva contraseña.' })
      }
    } catch (err) {
      const m = (err as Error).message
      setMsg({
        ok: false,
        text: m.includes('Invalid login') ? 'Email o contraseña incorrectos' : m.includes('already registered') ? 'Ese email ya tiene cuenta' : m,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {settings?.logo_url ? (
            <img src={settings.logo_url} alt="" className="mb-3 size-14 rounded-xl object-cover" />
          ) : (
            <div className="mb-3 flex size-14 items-center justify-center rounded-xl bg-brand-400 text-zinc-950">
              <Activity className="size-7" />
            </div>
          )}
          <h1 className="font-display text-3xl font-bold uppercase text-white">{settings?.gym_name ?? 'Gimnasio'}</h1>
          <p className="text-sm text-zinc-500">Acceso para administración y staff</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-6 shadow-xl">
          {!supabaseConfigured && (
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.
            </p>
          )}
          {mode === 'signup' && (
            <Field label="Nombre">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
          )}
          <Field label="Email">
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          {mode !== 'reset' && (
            <Field label="Contraseña">
              <input
                className="input"
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
          )}
          {msg && <p className={`rounded-lg p-3 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
          <Button type="submit" className="w-full" size="lg" loading={busy}>
            {mode === 'login' ? 'Ingresar' : mode === 'signup' ? 'Crear cuenta' : 'Enviar link'}
          </Button>
          <div className="flex justify-between text-xs">
            {mode === 'login' ? (
              <>
                <button type="button" className="text-zinc-500 hover:text-zinc-900" onClick={() => setMode('reset')}>
                  Olvidé mi contraseña
                </button>
                <button type="button" className="font-semibold text-zinc-900" onClick={() => setMode('signup')}>
                  Crear cuenta de staff
                </button>
              </>
            ) : (
              <button type="button" className="text-zinc-500 hover:text-zinc-900" onClick={() => setMode('login')}>
                ← Volver a ingresar
              </button>
            )}
          </div>
        </form>
        <p className="mt-4 text-center text-xs text-zinc-600">
          ¿Sos socio? Entrá con el link personal que te llegó por email.
        </p>
      </div>
    </div>
  )
}

export function ChangePassword() {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(error.message)
    else setDone(true)
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6">
        <h1 className="font-display text-2xl font-bold uppercase">Nueva contraseña</h1>
        {done ? (
          <p className="text-sm text-emerald-700">
            Listo. <a className="font-semibold underline" href="/admin">Ir al panel</a>
          </p>
        ) : (
          <>
            <input className="input" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" loading={busy}>
              Guardar
            </Button>
          </>
        )}
      </form>
    </div>
  )
}
