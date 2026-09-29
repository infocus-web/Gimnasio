'use client'

import { useActionState, useState } from 'react'
import { UserPlus, KeyRound, Copy, Lock, Unlock, Trash2 } from 'lucide-react'
import type { ActionState } from './errors'
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
  allowAdmin,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  role: string
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
      <SubmitButton variant="ghost">Cambiar rol</SubmitButton>
      {state.message && (
        <span role={state.ok ? 'status' : 'alert'} className={`text-xs ${state.ok ? 'text-emerald-300' : 'text-red-300'}`}>
          {state.message}
        </span>
      )}
    </form>
  )
}

// ---------------------------------------------------------------------
// Cuentas con contraseña, bloqueo y baja
// ---------------------------------------------------------------------

/** Muestra la contraseña generada UNA sola vez, con botón de copiar */
export function SecretBox({ secret }: { secret?: string }) {
  const [copied, setCopied] = useState(false)
  if (!secret) return null
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#edcc36]/40 bg-[#edcc36]/10 p-3">
      <KeyRound className="h-4 w-4 text-[#edcc36]" aria-hidden="true" />
      <code className="select-all font-mono text-base font-bold tracking-wider text-white">{secret}</code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(secret)
          setCopied(true)
        }}
        className="ml-auto inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-zinc-700 px-2.5 text-xs text-zinc-200 hover:text-white"
      >
        <Copy className="h-3.5 w-3.5" aria-hidden="true" /> {copied ? 'Copiada' : 'Copiar'}
      </button>
      <p className="w-full text-xs text-zinc-400">No la vas a poder volver a ver: copiala ahora y pasásela en persona o por WhatsApp.</p>
    </div>
  )
}

export function CreateStaffAccountForm({
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
          <input id="acc-name" name="displayName" className={inputClass} autoComplete="off" />
        </Field>
        <Field label="Email (será su usuario)" name="email" error={err.email}>
          <input id="acc-email" name="email" type="email" inputMode="email" className={inputClass} autoComplete="off" />
        </Field>
        <Field label="Rol" name="role">
          <select id="acc-role" name="role" defaultValue="trainer" className={inputClass}>
            {ROLE_OPTIONS.filter((r) => allowAdmin || r.value !== 'admin').map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Contraseña inicial" name="password" error={err.password} hint="Vacío = la generamos segura. Al entrar la tiene que cambiar.">
          <input id="acc-pass" name="password" type="text" autoComplete="new-password" className={inputClass} placeholder="Generar automáticamente" />
        </Field>
      </div>
      <Notice state={state} />
      <SecretBox secret={state.secret} />
      <div className="flex justify-end">
        <SubmitButton>
          <UserPlus className="h-4 w-4" aria-hidden="true" /> Crear cuenta
        </SubmitButton>
      </div>
    </form>
  )
}

export function StaffAccountActions({
  name,
  active,
  resetAction,
  blockAction,
  deleteAction,
}: {
  name: string
  active: boolean
  resetAction: (prev: ActionState) => Promise<ActionState>
  blockAction: (prev: ActionState) => Promise<ActionState>
  deleteAction: (prev: ActionState, form: FormData) => Promise<ActionState>
}) {
  const [resetState, reset] = useActionState(resetAction, {})
  const [blockState, block] = useActionState(blockAction, {})
  const [delState, del] = useActionState(deleteAction, {})
  const shown = delState.message ? delState : blockState.message ? blockState : resetState
  return (
    <div className="w-full space-y-2">
      <div className="flex flex-wrap gap-2">
        <form action={reset}>
          <SubmitButton variant="ghost">
            <KeyRound className="h-4 w-4" aria-hidden="true" /> Nueva contraseña
          </SubmitButton>
        </form>
        <form action={block}>
          <SubmitButton variant="ghost">
            {active ? <Lock className="h-4 w-4" aria-hidden="true" /> : <Unlock className="h-4 w-4" aria-hidden="true" />}
            {active ? 'Bloquear' : 'Desbloquear'}
          </SubmitButton>
        </form>
        <details className="group">
          <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-2 rounded-xl border border-red-500/30 px-4 text-sm font-semibold text-red-300 hover:bg-red-500/10">
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Eliminar
          </summary>
          <form action={del} className="mt-2 flex flex-wrap items-start gap-2">
            <label className="sr-only" htmlFor={`confirm-${name}`}>Escribí ELIMINAR</label>
            <input id={`confirm-${name}`} name="confirm" placeholder="Escribí ELIMINAR" autoComplete="off" className={`${inputClass} w-44`} />
            <SubmitButton variant="ghost">Confirmar</SubmitButton>
            {delState.fieldErrors?.confirm && <span className="w-full text-xs text-red-300">{delState.fieldErrors.confirm}</span>}
          </form>
        </details>
      </div>
      <Notice state={shown} />
      <SecretBox secret={resetState.secret} />
    </div>
  )
}
