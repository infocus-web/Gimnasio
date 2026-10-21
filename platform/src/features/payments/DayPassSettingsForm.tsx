'use client'

import { Save } from 'lucide-react'
import type { ActionState } from '@/features/admin/errors'
import { Field, inputClass, Notice, SubmitButton, useActionForm } from '@/features/admin/ui'

export function DayPassSettingsForm({
  action,
  initial,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  initial: { enabled: boolean; price: string; days: number; entries: number }
}) {
  const [state, formAction] = useActionForm(action, {})
  const err = state.fieldErrors ?? {}
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <label className="flex min-h-[44px] items-center gap-2 text-sm text-zinc-200">
        <input type="checkbox" name="enabled" defaultChecked={initial.enabled} className="h-4 w-4 accent-[#edcc36]" />
        Vender el pase por día online (se paga con Mercado Pago y llega por email)
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Precio ($)" name="price" error={err.price}>
          <input name="price" inputMode="decimal" defaultValue={initial.price} placeholder="5.000" className={inputClass} />
        </Field>
        <Field label="Vale por (días)" name="days" error={err.days}>
          <input name="days" type="number" min={1} max={31} defaultValue={initial.days} className={inputClass} />
        </Field>
        <Field label="Entradas" name="entries" error={err.entries}>
          <input name="entries" type="number" min={1} max={60} defaultValue={initial.entries} className={inputClass} />
        </Field>
      </div>
      <Notice state={state} />
      <div className="flex justify-end">
        <SubmitButton>
          <Save className="h-4 w-4" aria-hidden="true" /> Guardar
        </SubmitButton>
      </div>
    </form>
  )
}
