'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'
import { Sparkles, X, Loader2, AlertTriangle } from 'lucide-react'
import { Field, inputClass } from '@/features/admin/ui'
import { InfoTip } from '@/components/InfoTip'
import { GOALS } from './types'

export function AiRoutineButton({
  slug,
  configured,
  remaining,
  machines,
}: {
  slug: string
  configured: boolean
  remaining: number | null
  machines: { id: string; name: string }[]
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [left, setLeft] = useState(remaining)

  const open = () => {
    setError(null)
    dialog.current?.showModal()
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const form = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/routine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org: slug,
          goal: form.get('goal'),
          days: Number(form.get('days')),
          level: form.get('level'),
          limitations: String(form.get('limitations') ?? ''),
          machineIds: form.getAll('machine').map(String),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { programId?: string; remaining?: number; message?: string }
      if (!res.ok || !data.programId) {
        setError(data.message ?? 'Ocurrió un error. Probá de nuevo.')
        setBusy(false)
        return
      }
      setLeft(data.remaining ?? null)
      router.push(`/${slug}/admin/rutinas/${data.programId}?ia=1` as Route)
    } catch {
      setError('Sin conexión. Probá de nuevo.')
      setBusy(false)
    }
  }

  return (
    <>
      <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={open}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#edcc36]/50 bg-[#edcc36]/10 px-4 text-sm font-bold text-[#f5e38a] hover:bg-[#edcc36]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" /> Sugerir con IA
      </button>
        <InfoTip label="Sugerir con IA">
          <p>Le pedís a la IA que arme una rutina a partir del objetivo, los días por semana, el nivel, las lesiones y las máquinas que marques.</p>
          <p>Se crea como <strong>borrador</strong>: el alumno no la ve. La revisás, cambiás lo que haga falta y la aprobás. Hay un límite de 20 sugerencias por día.</p>
        </InfoTip>
      </span>

      <dialog
        ref={dialog}
        aria-labelledby="ai-title"
        className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-2xl border border-zinc-800 bg-zinc-950 p-0 text-zinc-100 backdrop:bg-black/70"
        onClose={() => setBusy(false)}
      >
        <div className="flex items-center justify-between border-b border-zinc-900 p-4">
          <h2 id="ai-title" className="flex items-center gap-2 text-base font-bold text-white">
            <Sparkles className="h-4 w-4 text-[#edcc36]" aria-hidden="true" /> Rutina sugerida con IA
          </h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Cerrar"
            className="grid h-11 w-11 place-items-center rounded-xl text-zinc-400 hover:bg-zinc-900 hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {!configured ? (
          <div className="space-y-2 p-4 text-sm">
            <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Falta conectar la IA.
            </p>
            <p className="text-zinc-400">
              El dueño tiene que cargar la clave de Anthropic (variable <code className="text-zinc-200">ANTHROPIC_API_KEY</code>) en Vercel. Cuando esté, este botón arma
              un borrador de rutina usando solo los ejercicios de tu biblioteca.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="max-h-[75vh] space-y-4 overflow-y-auto p-4">
            <p className="text-xs text-zinc-400">
              La IA arma un <strong className="text-zinc-200">borrador</strong> solo con ejercicios de tu biblioteca. Lo revisás y lo editás antes de asignarlo.
              {left != null && ` Quedan ${left} sugerencias hoy en el gimnasio.`}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Objetivo" name="goal">
                <select name="goal" defaultValue="hipertrofia" className={inputClass}>
                  {Object.entries(GOALS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Días por semana" name="days">
                <select name="days" defaultValue="3" className={inputClass}>
                  {[2, 3, 4, 5, 6].map((d) => (
                    <option key={d} value={d}>
                      {d} días
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nivel" name="level">
                <select name="level" defaultValue="beginner" className={inputClass}>
                  <option value="beginner">Principiante</option>
                  <option value="intermediate">Intermedio</option>
                  <option value="advanced">Avanzado</option>
                </select>
              </Field>
            </div>
            <Field label="Lesiones o limitaciones (opcional)" name="limitations" hint="Ej.: dolor lumbar, operado de rodilla derecha, hipertensión">
              <textarea name="limitations" rows={2} maxLength={500} className={`${inputClass} min-h-[72px] py-2`} />
            </Field>
            {machines.length > 0 && (
              <fieldset>
                <legend className="mb-1 text-xs font-medium text-zinc-400">Equipamiento disponible (si no marcás nada, usa todo el catálogo)</legend>
                <div className="grid max-h-48 gap-1 overflow-y-auto rounded-xl border border-zinc-800 p-2 sm:grid-cols-2">
                  {machines.map((m) => (
                    <label key={m.id} className="flex min-h-[40px] items-center gap-3 rounded-lg px-2 text-sm text-zinc-200 hover:bg-zinc-900">
                      <input type="checkbox" name="machine" value={m.id} className="h-4 w-4 accent-[#edcc36]" />
                      {m.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || left === 0}
              className="btn-tac inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#edcc36] px-5 text-sm font-bold text-black disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Armando la rutina… (puede tardar hasta 1 minuto)
                </>
              ) : left === 0 ? (
                'Se usaron las 20 sugerencias de hoy'
              ) : (
                <>
                  <Sparkles className="h-4 w-4" aria-hidden="true" /> Sugerir rutina
                </>
              )}
            </button>
          </form>
        )}
      </dialog>
    </>
  )
}
