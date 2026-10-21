'use client'

import { CreditCard } from 'lucide-react'
import type { ActionState } from '@/features/admin/errors'
import { formatMoney } from '@/features/admin/format'
import { Notice, SubmitButton, useActionForm } from '@/features/admin/ui'

export interface PayPlanOption {
  id: string
  name: string
  description: string | null
  priceCents: number
  currency: string
  current: boolean
}

/** Elegir plan y pagar (redirige a Mercado Pago). */
export function PayPlanForm({
  action,
  plans,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  plans: PayPlanOption[]
}) {
  const [state, formAction] = useActionForm(action, {})
  const initial = plans.find((p) => p.current) ?? plans[0]
  return (
    <form action={formAction} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold text-white">¿Qué querés pagar?</legend>
        {plans.map((p) => (
          <label key={p.id}
            className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 has-[:checked]:border-[#edcc36] has-[:checked]:bg-[#edcc36]/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#edcc36]">
            <input type="radio" name="planId" value={p.id} defaultChecked={p.id === initial?.id} className="h-4 w-4 accent-[#edcc36]" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-white">
                {p.name}
                {p.current && <span className="ml-2 rounded bg-[#edcc36]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#edcc36]">TU PLAN</span>}
              </span>
              {p.description && <span className="block text-xs text-zinc-400">{p.description}</span>}
            </span>
            <span className="font-bold tabular-nums text-white">{formatMoney(p.priceCents, p.currency)}</span>
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-zinc-500">
        Si pagás tu mismo plan, se suma desde tu vencimiento actual (no perdés días). Si elegís otro plan, arranca hoy.
      </p>
      <Notice state={state} />
      <div className="[&>button]:w-full">
        <SubmitButton>
          <CreditCard className="h-4 w-4" aria-hidden="true" /> Pagar con Mercado Pago
        </SubmitButton>
      </div>
    </form>
  )
}
