'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Undo2 } from 'lucide-react'
import type { ActionState } from './errors'
import { Notice, SubmitButton, useActionForm, inputClass } from './ui'

export interface RateOption {
  id: string
  /** null = libre (sin límite de clases por semana) */
  perWeek: number | null
  /** Musculación: cada cuánto se paga */
  period: Period
  priceCents: number
  members: number
}
export interface RateGroup {
  typeId: string
  name: string
  color: string
  /** Musculación: es entrar a la sala, no clases con reserva → sin frecuencia */
  openGym: boolean
  options: RateOption[]
}
export interface RateOther {
  id: string
  name: string
  detail: string
  priceCents: number
}

const FREQS = [1, 2, 3, 4, 5, 6]

export type Period = 'week' | 'month' | 'quarter' | 'semester' | 'year' | 'other'
const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: 'Semanal' },
  { value: 'month', label: 'Mensual' },
  { value: 'quarter', label: 'Trimestral (3 meses)' },
  { value: 'semester', label: 'Semestral (6 meses)' },
  { value: 'year', label: 'Anual' },
]

function PeriodSelect({ name, value }: { name: string; value: Period }) {
  return (
    <select name={name} defaultValue={value} aria-label="Período" className={`${inputClass} w-full sm:w-56`}>
      {value === 'other' && <option value="other">Otro período (editar en el plan)</option>}
      {PERIODS.map((p) => (
        <option key={p.value} value={p.value}>
          {p.label}
        </option>
      ))}
    </select>
  )
}

function PriceInput({ name, cents, error }: { name: string; cents?: number; error?: string }) {
  return (
    <div className="w-36 shrink-0">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
        <input
          name={name}
          aria-label="Precio por mes"
          inputMode="decimal"
          defaultValue={cents && cents > 0 ? String(cents / 100) : ''}
          placeholder="Sin tarifa"
          aria-invalid={!!error}
          className={`${inputClass} pl-7 text-right tabular-nums`}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  )
}

function FreqSelect({ name, value }: { name: string; value: number | null }) {
  return (
    <select name={name} defaultValue={value === null ? '' : String(value)} aria-label="Frecuencia" className={`${inputClass} w-full sm:w-56`}>
      <option value="">Libre (sin límite)</option>
      {FREQS.map((n) => (
        <option key={n} value={n}>
          {n} {n === 1 ? 'vez' : 'veces'} por semana
        </option>
      ))}
    </select>
  )
}

/**
 * Tarifas: cada actividad con sus opciones (libre, 3 veces por semana…) y el precio mensual de cada una.
 * Vacío = sin tarifa (no se muestra ni se vende en la web). Todo se guarda con un solo botón.
 */
export function RatesForm({
  action,
  groups,
  others,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  groups: RateGroup[]
  others: RateOther[]
}) {
  const [state, formAction] = useActionForm(action, {})
  const err = state.fieldErrors ?? {}
  const [added, setAdded] = useState<Record<string, number[]>>({})
  const [removed, setRemoved] = useState<Record<string, boolean>>({})
  // Guardado: las opciones nuevas ya vienen del servidor como opciones normales
  useEffect(() => {
    if (state.ok) {
      setAdded({})
      setRemoved({})
    }
  }, [state])
  const add = (typeId: string) =>
    setAdded((a) => ({ ...a, [typeId]: [...(a[typeId] ?? []), Date.now()] }))
  const drop = (typeId: string, key: number) =>
    setAdded((a) => ({ ...a, [typeId]: (a[typeId] ?? []).filter((k) => k !== key) }))

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {groups.map((g) => (
        <section key={g.typeId} className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
          <header className="flex items-center gap-3 border-b border-zinc-900 px-4 py-3">
            <span className="h-4 w-4 shrink-0 rounded" style={{ background: g.color }} aria-hidden="true" />
            <h3 className="flex-1 font-bold text-white">{g.name}</h3>
            {(
              <button
                type="button"
                onClick={() => add(g.typeId)}
                className="flex min-h-[40px] items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-[#edcc36] hover:bg-zinc-900"
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Agregar opción
              </button>
            )}
          </header>
          <ul className="divide-y divide-zinc-900">
            {g.options.map((o) => {
              const off = removed[o.id]
              return (
                <li key={o.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${off ? 'opacity-50' : ''}`}>
                  <div className="min-w-0 flex-1">
                    {g.openGym ? (
                      <PeriodSelect name={`period_${o.id}`} value={o.period} />
                    ) : (
                      <FreqSelect name={`freq_${o.id}`} value={o.perWeek} />
                    )}
                    {o.members > 0 && <p className="mt-1 text-xs text-zinc-500">{o.members} socios con esta opción</p>}
                  </div>
                  <PriceInput name={`price_${o.id}`} cents={o.priceCents} error={err[`price_${o.id}`]} />
                  {off && <input type="hidden" name={`remove_${o.id}`} value="on" />}
                  {g.options.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setRemoved((r) => ({ ...r, [o.id]: !r[o.id] }))}
                      aria-label={off ? 'No quitar esta opción' : 'Quitar esta opción'}
                      title={off ? 'No quitar' : 'Quitar (deja de venderse; los socios que la tienen la conservan)'}
                      className="grid h-10 w-10 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-white"
                    >
                      {off ? <Undo2 className="h-4 w-4" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  )}
                </li>
              )
            })}
            {(added[g.typeId] ?? []).map((key, i) => (
              <li key={key} className="flex flex-wrap items-center gap-3 bg-[#edcc36]/5 px-4 py-3">
                <div className="min-w-0 flex-1">
                  {g.openGym ? (
                    <PeriodSelect name={`new__${g.typeId}__${i}__period`} value="month" />
                  ) : (
                    <FreqSelect name={`new__${g.typeId}__${i}__freq`} value={3} />
                  )}
                  <p className="mt-1 text-xs text-[#edcc36]">Opción nueva</p>
                </div>
                <PriceInput name={`new__${g.typeId}__${i}__price`} error={err[`new__${g.typeId}__${i}__price`]} />
                <button
                  type="button"
                  onClick={() => drop(g.typeId, key)}
                  aria-label="Descartar opción nueva"
                  className="grid h-10 w-10 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-white"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {others.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
          <header className="border-b border-zinc-900 px-4 py-3">
            <h3 className="font-bold text-white">Combos y otros planes</h3>
            <p className="text-xs text-zinc-500">Para crear un combo (varias actividades o actividad + musculación) usá "Nuevo plan" más abajo.</p>
          </header>
          <ul className="divide-y divide-zinc-900">
            {others.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">{r.name}</p>
                  <p className="text-xs text-zinc-500">{r.detail}</p>
                </div>
                <PriceInput name={`price_${r.id}`} cents={r.priceCents} error={err[`price_${r.id}`]} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-zinc-500">
        Precios sin puntos (ej. 55000): en las clases es el precio por mes; en Musculación, por el período elegido. Si dejás una opción sin precio, no aparece en la web ni se puede comprar online.
        &quot;3 veces por semana&quot; limita las reservas de clases desde la app.
      </p>
      <Notice state={state} />
      <div className="flex justify-end">
        <SubmitButton>Guardar tarifas</SubmitButton>
      </div>
    </form>
  )
}
