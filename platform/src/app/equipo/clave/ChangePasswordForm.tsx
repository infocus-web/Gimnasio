'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'
import { KeyRound, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function ChangePasswordForm({ next, forced, email }: { next: string; forced: boolean; email: string }) {
  const router = useRouter()
  const [pass, setPass] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const strong = pass.length >= 10 && /[a-zA-Z]/.test(pass) && /\d/.test(pass)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!strong) return setError('Usá al menos 10 caracteres, con letras y números.')
    if (pass !== again) return setError('Las contraseñas no coinciden.')
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: pass, data: { must_change_password: false } })
    if (error) {
      setBusy(false)
      setError(
        /weak|pwned|leaked|compromised/i.test(error.message)
          ? 'Esa contraseña apareció en filtraciones de internet. Elegí otra.'
          : /same|different/i.test(error.message)
            ? 'Tiene que ser distinta a la anterior.'
            : 'No se pudo cambiar la contraseña. Probá de nuevo.',
      )
      return
    }
    await supabase.auth.refreshSession()
    router.replace(next as Route)
    router.refresh()
  }

  const input =
    'min-h-[48px] w-full rounded-xl border border-zinc-800 bg-black px-4 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]'

  return (
    <main className="grid min-h-dvh place-items-center bg-[#050506] p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-zinc-700 bg-zinc-900">
            <KeyRound className="h-6 w-6 text-[#edcc36]" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-extrabold text-white">{forced ? 'Elegí tu contraseña' : 'Cambiar contraseña'}</h1>
            <p className="text-xs text-zinc-400">{email}</p>
          </div>
        </div>
        {forced && (
          <p className="text-sm text-zinc-300">
            Por seguridad, la contraseña que te dieron es temporal. Elegí una tuya para seguir.
          </p>
        )}
        <label className="block space-y-1">
          <span className="text-sm text-zinc-300">Nueva contraseña</span>
          <input type="password" autoComplete="new-password" required value={pass} onChange={(e) => setPass(e.target.value)} className={input} aria-describedby="pass-hint" />
          <span id="pass-hint" className={`block text-xs ${strong ? 'text-emerald-300' : 'text-zinc-500'}`}>
            Mínimo 10 caracteres, con letras y números.
          </span>
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-zinc-300">Repetila</span>
          <input type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} className={input} />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#edcc36] font-bold text-black disabled:opacity-60">
          {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
          Guardar contraseña
        </button>
        {!forced && (
          <a href={next} className="block text-center text-sm text-zinc-400 hover:text-white">
            Cancelar
          </a>
        )}
      </form>
    </main>
  )
}
