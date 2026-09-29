'use client'

import { Send } from 'lucide-react'
import type { ActionState } from './actions'
import { Field, inputClass, Notice, SubmitButton, useActionForm } from './ui'

export function AssignPlanForm({
  action,
  plans,
  today,
  currentPlanId,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  plans: { id: string; label: string }[]
  today: string
  currentPlanId: string | null
}) {
  const [state, formAction] = useActionForm(action, {})
  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_170px]">
        <Field label="Plan" name="planId" error={state.fieldErrors?.planId}>
          <select id="planId" name="planId" defaultValue={currentPlanId ?? ''} className={inputClass}>
            <option value="" disabled>
              Elegí un plan
            </option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Desde" name="startDate">
          <input id="startDate" name="startDate" type="date" defaultValue={today} className={inputClass} />
        </Field>
      </div>
      <p className="text-xs text-zinc-500">
        Asignar o renovar reemplaza la membresía vigente y cubre a todo el grupo familiar. El registro del cobro llega con la
        sección Planes y pagos.
      </p>
      <Notice state={state} />
      <div className="flex justify-end">
        <SubmitButton>{currentPlanId ? 'Renovar / cambiar plan' : 'Asignar plan'}</SubmitButton>
      </div>
    </form>
  )
}

export function InviteButton({
  action,
  label = 'Invitar a la app',
}: {
  action: (prev: ActionState) => Promise<ActionState>
  label?: string
}) {
  const [state, formAction] = useActionForm(action, {})
  return (
    <form action={formAction} className="space-y-3">
      <SubmitButton variant="ghost">
        <Send className="h-4 w-4" aria-hidden="true" /> {label}
      </SubmitButton>
      <Notice state={state} />
    </form>
  )
}
