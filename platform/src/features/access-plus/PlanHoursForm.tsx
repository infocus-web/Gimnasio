'use client'

import { useState } from 'react'
import { Clock, Plus, Trash2 } from 'lucide-react'
import type { ActionState } from '@/features/admin/errors'
import { inputClass, Notice, SubmitButton, useActionForm } from '@/features/admin/ui'
import { formatWindows, parseWindows, type AccessWindow } from './windows'

const DAYS = [
  { n: 1, label: 'Lun' },
  { n: 2, label: 'Mar' },
  { n: 3, label: 'Mié' },
  { n: 4, label: 'Jue' },
  { n: 5, label: 'Vie' },
  { n: 6, label: 'Sáb' },
  { n: 7, label: 'Dom' },
]
const MAX = 3
const EMPTY: AccessWindow = { days: [1, 2, 3, 4, 5], from: '07:00', to: '14:00' }

/**
 * "Solo puede entrar: Lun–Vie 7:00 a 14:00". Se guarda aparte del resto del plan
 * (el molinete de musculación lo aplica en la hora del gimnasio; recepción solo avisa).
 */
export function PlanHoursForm({
  action,
  windows,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  windows: unknown
}) {
  const initial = parseWindows(windows)
  const [state, formAction] = useActionForm(action, {})
  const [mode, setMode] = useState<'always' | 'custom'>(initial ? 'custom' : 'always')
  const [rows, setRows] = useState<AccessWindow[]>(initial ?? [EMPTY])
  const err = state.fieldErrors ?? {}
  const summary = formatWindows(windows)

  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-zinc-800 bg-black/40 p-4" noValidate>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white">
          <Clock className="h-4 w-4 text-[#edcc36]" aria-hidden="true" /> Horario de acceso a musculación
        </h3>
        <span className="text-xs text-zinc-400">{summary ? `Hoy: solo puede entrar ${summary}` : 'Hoy: puede entrar siempre'}</span>
      </div>

      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">¿Cuándo puede entrar?</legend>
        {(
          [
            ['always', 'Puede entrar siempre'],
            ['custom', 'Solo en estos horarios'],
          ] as const
        ).map(([v, label]) => (
          <label
            key={v}
            className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-zinc-800 px-3 text-sm text-zinc-200 has-[:checked]:border-[#edcc36]/70 has-[:checked]:bg-[#edcc36]/10"
          >
            <input type="radio" name="mode" value={v} checked={mode === v} onChange={() => setMode(v)} className="h-4 w-4 accent-[#edcc36]" />
            {label}
          </label>
        ))}
      </fieldset>

      {mode === 'custom' && (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-zinc-800 p-3">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Días de la franja ${i + 1}`}>
                {DAYS.map((d) => (
                  <label
                    key={d.n}
                    className="grid min-h-[44px] min-w-[48px] cursor-pointer place-items-center rounded-lg border border-zinc-800 px-2 text-sm text-zinc-300 has-[:checked]:border-[#edcc36] has-[:checked]:bg-[#edcc36] has-[:checked]:font-bold has-[:checked]:text-black has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#edcc36]"
                  >
                    <input
                      type="checkbox"
                      name={`days_${i}`}
                      value={d.n}
                      checked={r.days.includes(d.n)}
                      onChange={(e) =>
                        setRows((all) =>
                          all.map((x, j) =>
                            j === i ? { ...x, days: e.target.checked ? [...x.days, d.n] : x.days.filter((n) => n !== d.n) } : x,
                          ),
                        )
                      }
                      className="sr-only"
                    />
                    {d.label}
                  </label>
                ))}
              </div>
              {err[`days_${i}`] && <p className="text-xs text-red-300">{err[`days_${i}`]}</p>}
              <div className="flex flex-wrap items-end gap-2">
                <label className="space-y-1">
                  <span className="block text-xs text-zinc-400">Desde</span>
                  <input
                    type="time"
                    name={`from_${i}`}
                    value={r.from}
                    onChange={(e) => setRows((all) => all.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))}
                    className={`${inputClass} w-32`}
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-xs text-zinc-400">Hasta</span>
                  <input
                    type="time"
                    name={`to_${i}`}
                    value={r.to === '24:00' ? '23:59' : r.to}
                    onChange={(e) => setRows((all) => all.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))}
                    className={`${inputClass} w-32`}
                  />
                </label>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRows((all) => all.filter((_, j) => j !== i))}
                    aria-label={`Quitar franja ${i + 1}`}
                    className="grid h-11 w-11 place-items-center rounded-xl border border-zinc-800 text-zinc-500 hover:border-red-500/50 hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
              {(err[`from_${i}`] || err[`to_${i}`]) && <p className="text-xs text-red-300">{err[`from_${i}`] ?? err[`to_${i}`]}</p>}
            </div>
          ))}
          {rows.length < MAX && (
            <button
              type="button"
              onClick={() => setRows((all) => [...all, { days: [6], from: '09:00', to: '13:00' }])}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-dashed border-zinc-700 px-4 text-sm text-zinc-300 hover:border-[#edcc36]/60"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Agregar otra franja (ej. sábados)
            </button>
          )}
          <p className="text-xs text-zinc-500">
            Fuera de estos horarios el molinete no abre y la tablet le dice al socio en qué horario puede entrar. En recepción
            se puede dar la entrada igual (aparece un aviso).
          </p>
        </div>
      )}
      <Notice state={state} />
      <div className="flex justify-end">
        <SubmitButton variant="ghost">Guardar horario</SubmitButton>
      </div>
    </form>
  )
}
