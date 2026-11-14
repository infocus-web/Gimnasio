'use client'

import { Repeat } from 'lucide-react'
import type { ActionState } from '@/features/admin/errors'
import { formatMoney } from '@/features/admin/format'
import { Notice, SubmitButton, useActionForm } from '@/features/admin/ui'
import type { PayPlanOption } from './PayPlanForm'

/**
 * Activar el débito automático: elige el plan, confirma el email de su cuenta de Mercado Pago
 * (MP exige que coincida con la cuenta que autoriza) y va a Mercado Pago a dar el OK una sola vez.
 */
export function AutoDebitForm({
  action,
  plans,
  defaultEmail,
  startsAtLabel,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  plans: PayPlanOption[]
  defaultEmail: string
  /** "el 12/12" si el primer cobro espera al vencimiento actual */
  startsAtLabel: string | null
}) {
  const [state, formAction] = useActionForm(action, {})
  const initial = plans.find((p) => p.current) ?? plans[0]
  return (
    <form action={formAction} className="space-y-4">
      {plans.length > 1 && (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold text-white">Plan</legend>
          {plans.map((p) => (
            <label
              key={p.id}
              className="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-2xl border border-zinc-800 bg-black/30 p-3 has-[:checked]:border-[#edcc36] has-[:checked]:bg-[#edcc36]/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#edcc36]"
            >
              <input type="radio" name="planId" value={p.id} defaultChecked={p.id === initial?.id} className="h-4 w-4 accent-[#edcc36]" />
              <span className="min-w-0 flex-1 font-semibold text-white">{p.name}</span>
              <span className="font-bold tabular-nums text-white">{formatMoney(p.priceCents, p.currency)}</span>
            </label>
          ))}
        </fieldset>
      )}
      {plans.length === 1 && <input type="hidden" name="planId" value={plans[0]?.id ?? ""} />}

      <label className="block space-y-1">
        <span className="text-sm font-semibold text-white">Email de tu cuenta de Mercado Pago</span>
        <input
          name="mpEmail"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          defaultValue={defaultEmail}
          className="min-h-[48px] w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 text-base text-white placeholder:text-zinc-500 focus-visible:border-[#edcc36] focus-visible:outline-none"
        />
        <span className="block text-xs text-zinc-500">Tiene que ser el mismo con el que entrás a Mercado Pago.</span>
      </label>

      <ul className="space-y-1 text-xs text-zinc-400">
        <li>· Autorizás tu tarjeta una sola vez en Mercado Pago.</li>
        <li>· {startsAtLabel ? `El primer cobro es ${startsAtLabel}, cuando vence tu plan actual.` : 'El primer cobro se hace al autorizar.'}</li>
        <li>· Si un cobro rebota, Mercado Pago lo reintenta y te avisamos.</li>
        <li>· Lo das de baja cuando quieras desde esta pantalla.</li>
      </ul>

      <Notice state={state} />
      <div className="[&>button]:w-full">
        <SubmitButton>
          <Repeat className="h-4 w-4" aria-hidden="true" /> Activar débito automático
        </SubmitButton>
      </div>
    </form>
  )
}
