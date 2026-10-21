'use client'

import type { ActionState } from '@/features/admin/errors'
import { Field, Notice, SubmitButton, inputClass, useActionForm } from '@/features/admin/ui'
import type { Rules } from './shared'

export function RulesForm({ rules, canManage, action }: { rules: Rules; canManage: boolean; action: (prev: ActionState, form: FormData) => Promise<ActionState> }) {
  const [state, submit] = useActionForm(action)
  const num = (name: string, value: number, min: number, max: number) => (
    <input
      name={name}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={1}
      defaultValue={value}
      required
      disabled={!canManage}
      className={`${inputClass} max-w-[140px] tabular-nums`}
    />
  )
  return (
    <form action={submit} className="space-y-5">
      <Field label="Días de regalo por cumpleaños (0 a 7)" name="birthdayGiftDays" error={state.fieldErrors?.birthdayGiftDays}
        hint="Se suman al vencimiento del plan vigente, una vez por año. 0 = solo el saludo.">
        {num('birthdayGiftDays', rules.birthday_gift_days, 0, 7)}
      </Field>
      <Field label="Días gratis por referido (0 a 60)" name="referralRewardDays" error={state.fieldErrors?.referralRewardDays}
        hint="Los reciben los dos (quien recomendó y el nuevo) cuando el nuevo registra su primer pago.">
        {num('referralRewardDays', rules.referral_reward_days, 0, 60)}
      </Field>
      <Field label="Máximo de días para congelar por año (0 a 90)" name="freezeMaxDays" error={state.fieldErrors?.freezeMaxDays}
        hint="El socio titular congela desde la app de 7 días en adelante, hasta este tope por año calendario. 0 = no se puede congelar.">
        {num('freezeMaxDays', rules.freeze_max_days_year, 0, 90)}
      </Field>
      {canManage ? (
        <SubmitButton>Guardar reglas</SubmitButton>
      ) : (
        <p className="text-xs text-zinc-500">Solo el dueño o un administrador pueden cambiar estas reglas.</p>
      )}
      <Notice state={state} />
    </form>
  )
}
