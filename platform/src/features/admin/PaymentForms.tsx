'use client'

import { useState } from 'react'
import { Banknote, Ban } from 'lucide-react'
import type { ActionState } from './errors'
import { Field, inputClass, Notice, SubmitButton, useActionForm } from './ui'

export const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  mercadopago: 'Mercado Pago',
  card_terminal: 'Tarjeta (posnet)',
  other: 'Otro',
  stripe: 'Tarjeta online',
}

export interface PlanOption {
  id: string
  label: string
  priceCents: number
}

function PaymentFormInner({
  action,
  plans,
  currentPlanId,
  onDone,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  plans: PlanOption[]
  currentPlanId: string | null
  onDone: () => void
}) {
  const [state, formAction] = useActionForm(action, {})
  const initial = plans.find((p) => p.id === currentPlanId) ?? plans[0]
  const [planId, setPlanId] = useState(initial?.id ?? '')
  const [renew, setRenew] = useState(true)
  const [amount, setAmount] = useState(initial ? String(initial.priceCents / 100) : '')
  const err = state.fieldErrors ?? {}

  // Cobro registrado: el formulario se cierra para que un segundo toque no cobre dos veces
  if (state.ok) {
    return (
      <div className="space-y-3">
        <Notice state={state} />
        <button type="button" onClick={onDone}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-semibold text-zinc-200 hover:border-[#edcc36]/60">
          <Banknote className="h-4 w-4" aria-hidden="true" /> Registrar otro cobro
        </button>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-3" noValidate>
      <label className="flex min-h-[40px] items-center gap-2 text-sm text-zinc-200">
        <input type="checkbox" name="renew" checked={renew} onChange={(e) => setRenew(e.target.checked)} className="h-4 w-4 accent-[#edcc36]" />
        Renovar plan con este cobro
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        {renew && (
          <Field label="Plan" name="planId" error={err.planId}>
            <select
              id="planId"
              name="planId"
              value={planId}
              onChange={(e) => {
                setPlanId(e.target.value)
                const p = plans.find((x) => x.id === e.target.value)
                if (p) setAmount(String(p.priceCents / 100))
              }}
              className={inputClass}
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Monto ($)" name="amount" error={err.amount}>
          <input id="amount" name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Medio de pago" name="method" error={err.method}>
          <select id="method" name="method" defaultValue="cash" className={inputClass}>
            {['cash', 'transfer', 'mercadopago', 'card_terminal', 'other'].map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nota (opcional)" name="note">
          <input id="note" name="note" placeholder="Ej. matrícula, descuento…" className={inputClass} />
        </Field>
      </div>
      {renew && (
        <p className="text-xs text-zinc-500">
          Si paga el mismo plan, se extiende desde el vencimiento actual (no pierde días). Si cambia de plan, arranca hoy.
        </p>
      )}
      <Notice state={state} />
      <div className="flex justify-end">
        <SubmitButton>
          <Banknote className="h-4 w-4" aria-hidden="true" /> Registrar cobro
        </SubmitButton>
      </div>
    </form>
  )
}

export function VoidPaymentForm({ action }: { action: (prev: ActionState, form: FormData) => Promise<ActionState> }) {
  const [state, formAction] = useActionForm(action, {})
  if (state.ok) return <span className="text-xs text-emerald-300">Anulado</span>
  return (
    <details className="group">
      <summary className="inline-flex min-h-[36px] cursor-pointer list-none items-center gap-1 rounded-lg px-2 text-xs text-zinc-500 hover:text-red-300">
        <Ban className="h-3.5 w-3.5" aria-hidden="true" /> Anular
      </summary>
      <form action={formAction} className="mt-2 flex flex-wrap items-start gap-2">
        <label className="sr-only" htmlFor="reason">
          Motivo
        </label>
        <input id="reason" name="reason" placeholder="Motivo" className={`${inputClass} min-h-[36px] w-44`} />
        <SubmitButton variant="ghost">Confirmar</SubmitButton>
        {(state.message || state.fieldErrors?.reason) && (
          <span role="alert" className="w-full text-xs text-red-300">
            {state.fieldErrors?.reason ?? state.message}
          </span>
        )}
      </form>
    </details>
  )
}

export function PaymentForm(props: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  plans: PlanOption[]
  currentPlanId: string | null
}) {
  const [round, setRound] = useState(0)
  return <PaymentFormInner key={round} {...props} onDone={() => setRound((r) => r + 1)} />
}
