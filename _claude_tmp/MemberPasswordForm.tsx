'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const MIN = 8

export function MemberPasswordForm({ next, email }: { next: string; email: string }) {
  const router = useRouter()
  const [pass, setPass] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (pass.length < MIN) return setError(`Usá al menos ${MIN} caracteres.`)
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: pass })
    if (error) {
      setBusy(false)
      setError(
        /weak|pwned|leaked|compromised/i.test(error.message)
          ? 'Esa contraseña es muy fácil o apareció en filtraciones. Elegí otra.'
          : /same|different/i.test(error.message)
            ? 'Tiene que ser distinta a la anterior.'
            : 'No se pudo guardar la contraseña. Probá de nuevo.',
      )
      return
    }
    router.replace(next as Route)
    router.refresh()
  }

  const input =
    'min-h-[52px] w-full rounded-xl border border-zinc-800 bg-black px-4 pr-14 text-base text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]'

  return (
    <main className="grid min-h-dvh place-items-center bg-black p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-lg border border-white/10 bg-[#141414] p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-zinc-700 bg-zinc-900">
            <KeyRound className="h-6 w-6 text-[#edcc36]" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-extrabold text-white">Elegí tu contraseña</h1>
            <p className="text-xs text-zinc-400">{email}</p>
          </div>
        </div>
        <p className="text-sm text-zinc-300">Con este email y esta contraseña vas a entrar siempre a la app.</p>
        <label className="block space-y-1">
          <span className="text-sm text-zinc-300">Contraseña</span>
          <span className="relative block">
            <input
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={MIN}
              autoFocus
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              className={input}
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
          <span className="block text-xs text-zinc-500">Mínimo {MIN} caracteres.</span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="btn-tac flex min-h-[54px] w-full items-center justify-center gap-2 rounded-xl bg-[#edcc36] font-bold text-black disabled:opacity-60">
          {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
          Guardar
        </button>
        <a href={next} className="block min-h-[44px] pt-2 text-center text-sm text-zinc-400 hover:text-white">
          Cancelar
        </a>
      </form>
    </main>
  )
}
