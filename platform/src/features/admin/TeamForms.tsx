'use client'

import { useActionState } from 'react'
import { UserPlus } from 'lucide-react'
import type { ActionState } from './actions'
import { Field, inputClass, Notice, SubmitButton } from './ui'

const ROLE_OPTIONS = [
  { value: 'trainer', label: 'Profesor', hint: 'Ve sus clases y sus alumnos, asigna rutinas.' },
  { value: 'staff', label: 'Recepción', hint: 'Check-in, altas de socios y cobros.' },
  { value: 'admin', label: 'Administrador', hint: 'Todo, menos gestionar al dueño.' },
] as const

export function InviteStaffForm({
  action,
  allowAdmin,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  allowAdmin: boolean
}) {
  const [state, formAction] = useActionState(action, {})
  const err = state.fieldErrors ?? {}
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" name="displayName" error={err.displayName}>
          <input id="displayName" name="displayName" className={inputClass} autoComplete="off" />
        </Field>
        <Field label="Email" name="email" error={err.email}>
          <input id="email" name="email" type="email" inputMode="email" className={inputClass} autoComplete="off" />
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-medium text-zinc-400">Rol</legend>
        {ROLE_OPTIONS.filter((r) => allowAdmin || r.value !== 'admin').map((r, i) => (
          <label key={r.value} className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-zinc-800 p-3 has-[:checked]:border-[#edcc36]/60">
            <input type="radio" name="role" value={r.value} defaultChecked={i === 0} className="mt-0.5 h-4 w-4 accent-[#edcc36]" />
            <span className="text-sm">
              <span className="font-semibold text-white">{r.label}</span>
              <span className="block text-xs text-zinc-400">{r.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Notice state={state} />
      <div className="flex justify-end">
        <SubmitButton>
          <UserPlus className="h-4 w-4" aria-hidden="true" /> Enviar invitación
        </SubmitButton>
      </div>
    </form>
  )
}

export function StaffRowForm({
  action,
  role,
  active,
  allowAdmin,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  role: string
  active: boolean
  allowAdmin: boolean
}) {
  const [state, formAction] = useActionState(action, {})
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`role-${role}`}>
        Rol
      </label>
      <select name="role" defaultValue={role} className={`${inputClass} w-auto min-w-[150px]`}>
        {ROLE_OPTIONS.filter((r) => allowAdmin || r.value !== 'admin' || role === 'admin').map((r) => (
          <option key={r.value} value={r.value} disabled={r.value === 'admin' && !allowAdmin}>
            {r.label}
          </option>
        ))}
      </select>
      <label className="flex min-h-[44px] items-center gap-2 px-1 text-sm text-zinc-300">
        <input type="checkbox" name="active" defaultChecked={active} className="h-4 w-4 accent-[#edcc36]" />
        Activo
      </label>
      <SubmitButton variant="ghost">Guardar</SubmitButton>
      {state.message && (
        <span role={state.ok ? 'status' : 'alert'} className={`text-xs ${state.ok ? 'text-emerald-300' : 'text-red-300'}`}>
          {state.message}
        </span>
      )}
    </form>
  )
}
