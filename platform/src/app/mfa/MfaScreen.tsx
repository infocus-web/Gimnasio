'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'
import { ShieldCheck, Loader2, Copy } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { SignOutButton } from '@/features/member/SignOutButton'

interface Props {
  next: string
  mode: 'enroll' | 'verify'
  factorId: string | null
  email: string
}

export function MfaScreen({ next, mode, factorId: initialFactor, email }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [factorId, setFactorId] = useState<string | null>(initialFactor)
  const [qr, setQr] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Alta: se descartan intentos anteriores sin terminar y se genera un QR nuevo
  useEffect(() => {
    if (mode !== 'enroll') return
    let cancelled = false
    ;(async () => {
      const { data: list } = await supabase.auth.mfa.listFactors()
      for (const f of list?.all ?? []) {
        if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Evolution ${new Date().toISOString().slice(0, 10)}`,
      })
      if (cancelled) return
      if (error || !data) {
        setError('No se pudo iniciar la configuración. Recargá la página.')
        return
      }
      setFactorId(data.id)
      setQr(data.totp.qr_code)
      setSecret(data.totp.secret)
    })()
    return () => {
      cancelled = true
    }
  }, [mode, supabase])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!factorId || code.length !== 6) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
    if (error) {
      setBusy(false)
      setCode('')
      setError('Código incorrecto o vencido. Probá con el que aparece ahora en la app.')
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
            <ShieldCheck className="h-6 w-6 text-[#edcc36]" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-extrabold text-white">Verificación en dos pasos</h1>
            <p className="text-xs text-zinc-400">{email}</p>
          </div>
        </div>

        {mode === 'enroll' ? (
          <div className="space-y-4 text-sm text-zinc-300">
            <p>
              Por seguridad, las cuentas de <strong className="text-white">dueño y administración</strong> usan un código
              del celular además del email.
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-zinc-400">
              <li>
                Instalá <strong className="text-zinc-200">Google Authenticator</strong> (o Microsoft Authenticator).
              </li>
              <li>Tocá “+” y escaneá este código.</li>
              <li>Escribí el número de 6 dígitos que te muestra.</li>
            </ol>
            <div className="grid place-items-center rounded-2xl bg-white p-3">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="Código QR para la app de autenticación" className="h-48 w-48" />
              ) : (
                <Loader2 className="h-8 w-8 animate-spin text-zinc-500" aria-label="Generando código" />
              )}
            </div>
            {secret && (
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(secret)}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-800 px-3 py-2 text-left text-xs text-zinc-400 hover:text-white"
              >
                <span className="truncate">
                  ¿No podés escanear? Clave: <span className="font-mono text-zinc-200">{secret}</span>
                </span>
                <Copy className="h-4 w-4 shrink-0" aria-label="Copiar clave" />
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-300">Abrí tu app de autenticación y escribí el código de Evolution.</p>
        )}

        <form onSubmit={submit} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm text-zinc-300">Código de 6 dígitos</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              aria-invalid={!!error}
              className="min-h-[52px] w-full rounded-xl border border-zinc-800 bg-black px-4 text-center font-mono text-2xl tracking-[0.5em] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || code.length !== 6 || !factorId}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#edcc36] font-bold text-black disabled:opacity-60"
          >
            {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
            {mode === 'enroll' ? 'Activar y entrar' : 'Verificar'}
          </button>
        </form>
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>¿Perdiste el celular? Pedile al soporte que reinicie tu 2FA.</span>
          <SignOutButton compact to="/equipo" />
        </div>
      </div>
    </main>
  )
}
