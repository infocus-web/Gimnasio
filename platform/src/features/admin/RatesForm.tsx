'use client'

import type { ActionState } from './errors'
import { Notice, SubmitButton, useActionForm, inputClass } from './ui'

export interface RateRow {
  id: string
  name: string
  detail: string
  priceCents: number
}

/** Tarifas: todos los precios en una sola pantalla. Vacío o 0 = sin tarifa (no se muestra ni se vende en la web). */
export function RatesForm({ action, rows }: { action: (prev: ActionState, form: FormData) => Promise<ActionState>; rows: RateRow[] }) {
  const [state, formAction] = useActionForm(action, {})
  const err = state.fieldErrors ?? {}
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <ul className="divide-y divide-zinc-900 overflow-hidden rounded-xl border border-zinc-800">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 bg-zinc-950 px-4 py-3">
            <label htmlFor={`price_${r.id}`} className="min-w-0 flex-1">
              <span className="block font-bold text-white">{r.name}</span>
              <span className="block text-xs text-zinc-500">{r.detail}</span>
            </label>
            <div className="w-40">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
                <input
                  id={`price_${r.id}`}
                  name={`price_${r.id}`}
                  inputMode="decimal"
                  defaultValue={r.priceCents > 0 ? String(r.priceCents / 100) : ''}
                  placeholder="Sin tarifa"
                  aria-invalid={!!err[`price_${r.id}`]}
                  className={`${inputClass} pl-7 text-right tabular-nums`}
                />
              </div>
              {err[`price_${r.id}`] && <p className="mt-1 text-xs text-red-300">{err[`price_${r.id}`]}</p>}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-zinc-500">
        Escribí el precio sin puntos (ej. 60000). Si lo dejás vacío, ese plan no aparece en la web ni se puede comprar online.
      </p>
      <Notice state={state} />
      <div className="flex justify-end">
        <SubmitButton>Guardar tarifas</SubmitButton>
      </div>
    </form>
  )
}
