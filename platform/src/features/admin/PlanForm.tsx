'use client'

import { useState } from 'react'
import type { ActionState } from './errors'
import { Field, inputClass, Notice, SubmitButton, useActionForm } from './ui'

export interface PlanValues {
  name: string
  description: string | null
  kind: 'recurring' | 'class_pack' | 'drop_in' | 'trial'
  priceCents: number
  billingInterval: string | null
  intervalCount: number
  classCredits: number | null
  creditsValidDays: number | null
  maxMembers: number
  maxBookingsPerWeek: number | null
  bookingWindowDays: number
  isPublic: boolean
  active: boolean
  sort: number
  classTypeIds: string[]
}

const KINDS = [
  { value: 'recurring', label: 'Cuota (mensual, semanal…)' },
  { value: 'class_pack', label: 'Pack de clases' },
  { value: 'drop_in', label: 'Clase suelta / pase diario' },
  { value: 'trial', label: 'Prueba (7 días)' },
] as const

export function PlanForm({
  action,
  values,
  classTypes,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  values?: PlanValues
  classTypes: { id: string; name: string }[]
}) {
  const [state, formAction] = useActionForm(action, {})
  const [kind, setKind] = useState<PlanValues['kind']>(values?.kind ?? 'recurring')
  const err = state.fieldErrors ?? {}
  const v = values

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre *" name="name" error={err.name}>
          <input id="name" name="name" defaultValue={v?.name ?? ''} className={inputClass} placeholder="Ej. Pase libre mensual" />
        </Field>
        <Field label="Precio ($) *" name="price" error={err.price}>
          <input id="price" name="price" inputMode="decimal" defaultValue={v ? String(v.priceCents / 100) : ''} className={inputClass} />
        </Field>
        <Field label="Tipo" name="kind">
          <select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as PlanValues['kind'])} className={inputClass}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
        {kind === 'recurring' && (
          <div className="grid grid-cols-[90px_1fr] gap-2">
            <Field label="Cada" name="intervalCount">
              <input id="intervalCount" name="intervalCount" type="number" min={1} defaultValue={v?.intervalCount ?? 1} className={inputClass} />
            </Field>
            <Field label="Período" name="billingInterval" error={err.billingInterval}>
              <select id="billingInterval" name="billingInterval" defaultValue={v?.billingInterval ?? 'month'} className={inputClass}>
                <option value="month">Mes(es)</option>
                <option value="week">Semana(s)</option>
                <option value="year">Año(s)</option>
                <option value="day">Día(s)</option>
              </select>
            </Field>
          </div>
        )}
        {kind === 'class_pack' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Clases" name="classCredits" error={err.classCredits}>
              <input id="classCredits" name="classCredits" type="number" min={1} defaultValue={v?.classCredits ?? 8} className={inputClass} />
            </Field>
            <Field label="Válido (días)" name="creditsValidDays">
              <input id="creditsValidDays" name="creditsValidDays" type="number" min={1} defaultValue={v?.creditsValidDays ?? 30} className={inputClass} />
            </Field>
          </div>
        )}
        <Field label="Personas que cubre" name="maxMembers" hint="Más de 1 = plan familiar">
          <input id="maxMembers" name="maxMembers" type="number" min={1} max={10} defaultValue={v?.maxMembers ?? 1} className={inputClass} />
        </Field>
        <Field label="Máx. reservas por semana" name="maxBookingsPerWeek" hint="Vacío = sin límite">
          <input id="maxBookingsPerWeek" name="maxBookingsPerWeek" type="number" min={1} defaultValue={v?.maxBookingsPerWeek ?? ''} className={inputClass} />
        </Field>
        <Field label="Puede reservar con (días de anticipación)" name="bookingWindowDays">
          <input id="bookingWindowDays" name="bookingWindowDays" type="number" min={0} max={90} defaultValue={v?.bookingWindowDays ?? 14} className={inputClass} />
        </Field>
        <Field label="Orden en la web" name="sort">
          <input id="sort" name="sort" type="number" defaultValue={v?.sort ?? 0} className={inputClass} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Descripción (se ve en la web)" name="description">
            <textarea id="description" name="description" rows={2} defaultValue={v?.description ?? ''} className={`${inputClass} py-2`} />
          </Field>
        </div>
      </div>

      {classTypes.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-zinc-400">Actividades incluidas (ninguna tildada = todas)</legend>
          <div className="flex flex-wrap gap-2">
            {classTypes.map((t) => (
              <label key={t.id} className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl border border-zinc-800 px-3 text-sm text-zinc-200 has-[:checked]:border-[#edcc36]/60">
                <input type="checkbox" name="classTypes" value={t.id} defaultChecked={v?.classTypeIds.includes(t.id)} className="h-4 w-4 accent-[#edcc36]" />
                {t.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap gap-4">
        <label className="flex min-h-[40px] items-center gap-2 text-sm text-zinc-200">
          <input type="checkbox" name="isPublic" defaultChecked={v?.isPublic ?? true} className="h-4 w-4 accent-[#edcc36]" />
          Mostrar en la web
        </label>
        <label className="flex min-h-[40px] items-center gap-2 text-sm text-zinc-200">
          <input type="checkbox" name="active" defaultChecked={v?.active ?? true} className="h-4 w-4 accent-[#edcc36]" />
          Activo (se puede vender)
        </label>
      </div>
      <Notice state={state} />
      <div className="flex justify-end">
        <SubmitButton>{v ? 'Guardar plan' : 'Crear plan'}</SubmitButton>
      </div>
    </form>
  )
}
