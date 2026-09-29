'use client'

import type { ActionState } from './actions'
import { Field, inputClass, Notice, SubmitButton, useActionForm } from './ui'

export interface MemberValues {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  documentId: string | null
  birthDate: string | null
  medicalNotes: string | null
  status: string
}

type Props =
  | {
      mode: 'create'
      action: (prev: ActionState, form: FormData) => Promise<ActionState>
      plans: { id: string; label: string }[]
      payer: { id: string; email: string | null } | null
      today: string
    }
  | {
      mode: 'edit'
      action: (prev: ActionState, form: FormData) => Promise<ActionState>
      values: MemberValues
      readOnly?: boolean
    }

export function MemberForm(props: Props) {
  const [state, formAction] = useActionForm(props.action, {})
  const v = props.mode === 'edit' ? props.values : null
  const err = state.fieldErrors ?? {}
  const disabled = props.mode === 'edit' && props.readOnly

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Datos personales</legend>
        <Field label="Nombre *" name="firstName" error={err.firstName}>
          <input id="firstName" name="firstName" required defaultValue={v?.firstName ?? ''} autoComplete="off" className={inputClass}
            aria-invalid={!!err.firstName} aria-describedby={err.firstName ? 'firstName-error' : undefined} />
        </Field>
        <Field label="Apellido" name="lastName" error={err.lastName}>
          <input id="lastName" name="lastName" defaultValue={v?.lastName ?? ''} autoComplete="off" className={inputClass} />
        </Field>
        <Field label="DNI" name="documentId" error={err.documentId}>
          <input id="documentId" name="documentId" inputMode="numeric" defaultValue={v?.documentId ?? ''} className={inputClass} />
        </Field>
        <Field label="Fecha de nacimiento" name="birthDate" error={err.birthDate}>
          <input id="birthDate" name="birthDate" type="date" defaultValue={v?.birthDate ?? ''} className={inputClass} />
        </Field>
        <Field
          label="Email"
          name="email"
          error={err.email}
          hint={props.mode === 'create' && props.payer ? 'Si es menor, podés dejar vacío o usar el del titular.' : 'Con este email entra a la app.'}
        >
          <input id="email" name="email" type="email" inputMode="email" defaultValue={v?.email ?? ''} className={inputClass}
            aria-invalid={!!err.email} aria-describedby={err.email ? 'email-error' : undefined} />
        </Field>
        <Field label="Teléfono / WhatsApp" name="phone" error={err.phone}>
          <input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={v?.phone ?? ''} className={inputClass} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Notas médicas / lesiones" name="medicalNotes" hint="Se muestran en recepción al escanear.">
            <textarea id="medicalNotes" name="medicalNotes" rows={2} defaultValue={v?.medicalNotes ?? ''}
              className={`${inputClass} py-2`} />
          </Field>
        </div>
        {props.mode === 'edit' && (
          <Field label="Estado" name="status">
            <select id="status" name="status" defaultValue={v?.status ?? 'active'} className={inputClass}>
              <option value="active">Activo</option>
              <option value="frozen">Congelado</option>
              <option value="lead">Interesado (todavía no se inscribió)</option>
              <option value="archived">Archivado (dado de baja)</option>
            </select>
          </Field>
        )}
      </fieldset>

      {props.mode === 'create' && !props.payer && (
        <fieldset className="grid gap-4 rounded-2xl border border-zinc-800 p-4 sm:grid-cols-2">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">Plan</legend>
          <Field label="Plan" name="planId" hint="Podés dejarlo sin plan y asignarlo después.">
            <select id="planId" name="planId" defaultValue="" className={inputClass}>
              <option value="">Sin plan por ahora</option>
              {props.plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Desde" name="startDate">
            <input id="startDate" name="startDate" type="date" defaultValue={props.today} className={inputClass} />
          </Field>
        </fieldset>
      )}
      {props.mode === 'create' && props.payer && <input type="hidden" name="payerId" value={props.payer.id} />}

      {props.mode === 'create' && (
        <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-zinc-800 p-3">
          <input type="checkbox" name="invite" defaultChecked={!props.payer} className="mt-0.5 h-5 w-5 accent-[#edcc36]" />
          <span className="text-sm">
            <span className="font-semibold text-white">Invitar a la app</span>
            <span className="block text-xs text-zinc-400">
              Le llega un email para entrar y ver su pase QR, reservar clases y cargar entrenamientos.
            </span>
          </span>
        </label>
      )}

      <Notice state={state} />
      {!disabled && (
        <div className="flex justify-end">
          <SubmitButton>{props.mode === 'create' ? 'Guardar socio' : 'Guardar cambios'}</SubmitButton>
        </div>
      )}
    </form>
  )
}
