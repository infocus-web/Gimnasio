'use client'

import { Save } from 'lucide-react'
import type { ActionState } from '@/features/admin/errors'
import { Field, inputClass, Notice, SubmitButton, useActionForm } from '@/features/admin/ui'

/**
 * Descuento por pagar en efectivo. El precio de cada plan es el de efectivo (lo que cobra recepción);
 * online (Mercado Pago) se cobra ese precio + el %. Al socio se le muestra como "X% off abonando en efectivo".
 */
export function CashDiscountForm({
  action,
  initial,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  initial: { enabled: boolean; pct: string }
}) {
  const [state, formAction] = useActionForm(action, {})
  const err = state.fieldErrors ?? {}
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <label className="flex min-h-[44px] items-center gap-2 text-sm text-zinc-200">
        <input type="checkbox" name="enabled" defaultChecked={initial.enabled} className="h-4 w-4 accent-[#edcc36]" />
        Descuento abonando en efectivo
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Descuento (%)" name="pct" error={err.pct}>
          <input name="pct" inputMode="decimal" defaultValue={initial.pct} placeholder="10" className={inputClass} />
        </Field>
      </div>
      <p className="text-xs text-zinc-400">
        El precio de cada plan es la <b>cuota</b> y es lo que se cobra con Mercado Pago. Al registrar un cobro <b>en efectivo</b>
        en el panel, el monto se pone solo con el descuento (redondeado a los $100). Ej.: cuota de $66.000 con 10% → $60.000 en efectivo.
        En la web y en la app se muestra como &ldquo;10% off abonando en efectivo&rdquo;.
      </p>
      <Notice state={state} />
      <div className="flex justify-end">
        <SubmitButton>
          <Save className="h-4 w-4" aria-hidden="true" /> Guardar
        </SubmitButton>
      </div>
    </form>
  )
}
