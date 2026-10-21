'use client'

import { Save } from 'lucide-react'
import type { ActionState } from '@/features/admin/errors'
import { Field, inputClass, Notice, SubmitButton, useActionForm } from '@/features/admin/ui'

export interface ProductValues {
  name: string
  price: string
  stock: string
  active: boolean
  sort: number
}

export function ProductForm({
  action,
  initial,
  submitLabel = 'Guardar',
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  initial?: ProductValues
  submitLabel?: string
}) {
  const [state, formAction] = useActionForm(action, {})
  const err = state.fieldErrors ?? {}
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <Field label="Nombre" name="name" error={err.name}>
          <input name="name" defaultValue={initial?.name} placeholder="Ej. Agua 500 ml" maxLength={80} className={inputClass} />
        </Field>
        <Field label="Precio ($)" name="price" error={err.price}>
          <input name="price" inputMode="decimal" defaultValue={initial?.price} placeholder="1.500" className={inputClass} />
        </Field>
        <Field label="Stock" name="stock" error={err.stock} hint="Vacío = no se controla">
          <input name="stock" inputMode="numeric" defaultValue={initial?.stock} className={inputClass} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-zinc-200">
            <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} className="h-4 w-4 accent-[#edcc36]" />
            Activo (se puede vender)
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            Orden
            <input name="sort" type="number" defaultValue={initial?.sort ?? 0} className={`${inputClass} w-20`} />
          </label>
        </div>
        <SubmitButton>
          <Save className="h-4 w-4" aria-hidden="true" /> {submitLabel}
        </SubmitButton>
      </div>
      <Notice state={state} />
    </form>
  )
}
