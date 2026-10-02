'use client'

import { useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { ClipboardCheck, Loader2, CheckCircle2 } from 'lucide-react'
import type { ActionState } from '@/features/admin/errors'
import { KeepValues, useActionForm } from '@/features/admin/ui'

const input =
  'min-h-[48px] w-full rounded-xl border border-zinc-800 bg-black px-4 text-white placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36] aria-[invalid=true]:border-red-500/60'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
      className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#edcc36] font-bold text-black disabled:opacity-60">
      {pending && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
      Enviar mis datos
    </button>
  )
}

function F({ label, name, error, children }: { label: string; name: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1" htmlFor={name}>
      <span className="text-sm text-zinc-300">{label}</span>
      {children}
      {error && <span id={`${name}-err`} className="block text-xs text-red-300">{error}</span>}
    </label>
  )
}

export function PadronForm({ gymName, action }: { gymName: string; action: (p: ActionState, f: FormData) => Promise<ActionState> }) {
  const [state, formAction] = useActionForm(action, {})
  // Tiempo de llenado medido en el propio celular (no depende de que su reloj esté en hora)
  const [openedAt] = useState(() => (typeof performance !== 'undefined' ? performance.now() : 0))
  const elapsedRef = useRef<HTMLInputElement>(null)
  const e = state.fieldErrors ?? {}

  return (
    <main className="grid min-h-dvh place-items-center bg-[#050506] p-4">
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-[#edcc36]/40 bg-[#edcc36]/10">
            <ClipboardCheck className="h-6 w-6 text-[#edcc36]" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-extrabold text-white">Padrón del equipo</h1>
            <p className="text-xs text-zinc-400">{gymName} · profesores y recepción</p>
          </div>
        </div>

        {state.ok ? (
          <p role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-50">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
            {state.message}
          </p>
        ) : (
          <form
            action={formAction}
            onSubmit={() => {
              if (elapsedRef.current) elapsedRef.current.value = String(Math.round(performance.now() - openedAt))
            }}
            className="space-y-4"
            noValidate
          >
            <input ref={elapsedRef} type="hidden" name="elapsed_ms" defaultValue="0" />
            <KeepValues values={state.values} />
            {/* Campo trampa para bots: invisible para personas */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>
                No completar <input name="hp_field" tabIndex={-1} autoComplete="off" />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <F label="Nombre" name="firstName" error={e.firstName}>
                <input id="firstName" name="firstName" required autoComplete="given-name" className={input} aria-invalid={!!e.firstName} />
              </F>
              <F label="Apellido" name="lastName" error={e.lastName}>
                <input id="lastName" name="lastName" required autoComplete="family-name" className={input} aria-invalid={!!e.lastName} />
              </F>
            </div>
            <F label="DNI" name="documentId" error={e.documentId}>
              <input id="documentId" name="documentId" required inputMode="numeric" placeholder="Sin puntos" className={input} aria-invalid={!!e.documentId} />
            </F>
            <F label="Teléfono / WhatsApp" name="phone" error={e.phone}>
              <input id="phone" name="phone" required type="tel" inputMode="tel" autoComplete="tel" placeholder="11 1234-5678" className={input} aria-invalid={!!e.phone} />
            </F>
            <F label="Email (va a ser tu usuario)" name="email" error={e.email}>
              <input id="email" name="email" required type="email" inputMode="email" autoComplete="email" className={input} aria-invalid={!!e.email} />
            </F>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm text-zinc-300">Puesto</legend>
              {[
                { v: 'trainer', l: 'Profesor/a', h: 'Clases, alumnos y rutinas' },
                { v: 'staff', l: 'Recepción', h: 'Entrada, altas y cobros' },
              ].map((r, i) => (
                <label key={r.v} className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border border-zinc-800 px-3 has-[:checked]:border-[#edcc36]/60">
                  <input type="radio" name="role" value={r.v} defaultChecked={i === 0} className="h-4 w-4 accent-[#edcc36]" />
                  <span className="text-sm">
                    <span className="font-semibold text-white">{r.l}</span> <span className="text-zinc-500">· {r.h}</span>
                  </span>
                </label>
              ))}
              {e.role && <span className="block text-xs text-red-300">{e.role}</span>}
            </fieldset>
            <F label="Comentario (opcional)" name="message">
              <textarea id="message" name="message" rows={2} maxLength={500} placeholder="Ej. doy funcional y spinning" className={`${input} py-3`} />
            </F>
            {state.message && (
              <p role="alert" className="text-sm text-red-300">
                {state.message}
              </p>
            )}
            <Submit />
            <p className="text-center text-xs text-zinc-500">
              Tus datos los ve solo la administración del gimnasio. Cuando te aprueben, la administración te pasa tu contraseña para entrar.
            </p>
          </form>
        )}
      </div>
    </main>
  )
}
