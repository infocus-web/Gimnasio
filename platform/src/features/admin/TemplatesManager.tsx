'use client'

import { Plus } from 'lucide-react'
import type { ActionState } from './errors'
import { Field, inputClass, Notice, SubmitButton, useActionForm } from './ui'
import { ConfirmAction } from './ConfirmAction'
import { fillMessage } from './whatsapp'

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>
type BareAction = (prev: ActionState) => Promise<ActionState>

export interface TemplateRow {
  id: string
  label: string
  body: string
  mine: boolean
  editable: boolean
  saveAction: Action
  deleteAction: BareAction
}

const EXAMPLE = { nombre: 'Camila', profe: '', clase: 'Funcional', dia: 'martes 12/11', hora: '19:00' }

function TemplateFields({ label, body, err }: { label?: string; body?: string; err: Record<string, string> }) {
  return (
    <>
      <Field label="Nombre del botón" name="label" error={err.label} hint="Corto: es lo que aparece en el botón (ej. «Recordatorio»)">
        <input name="label" defaultValue={label} maxLength={40} className={inputClass} />
      </Field>
      <Field label="Mensaje" name="body" error={err.body}>
        <textarea name="body" defaultValue={body} rows={4} maxLength={1500} className={`${inputClass} py-2.5`} />
      </Field>
    </>
  )
}

function TemplateEditor({ row, profe }: { row: TemplateRow; profe: string }) {
  const [state, formAction] = useActionForm(row.saveAction, {})
  return (
    <li className="space-y-2 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-white">{row.label}</span>
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
            row.mine ? 'border-[#edcc36]/40 text-[#edcc36]' : 'border-zinc-700 text-zinc-400'
          }`}
        >
          {row.mine ? 'Tuyo' : 'Del gimnasio'}
        </span>
      </div>
      <p className="whitespace-pre-line rounded-xl bg-[#0b3d2a]/40 p-3 text-sm text-zinc-200">{fillMessage(row.body, { ...EXAMPLE, profe })}</p>
      {row.editable ? (
        <details className="rounded-xl border border-zinc-800 p-3 open:border-[#edcc36]/40">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-300 hover:text-white">Editar</summary>
          <form action={formAction} className="mt-3 space-y-3">
            <TemplateFields label={row.label} body={row.body} err={state.fieldErrors ?? {}} />
            <Notice state={state} />
            <SubmitButton>Guardar</SubmitButton>
          </form>
          <div className="mt-3 border-t border-zinc-900 pt-3">
            <ConfirmAction action={row.deleteAction} confirmText={`Se borra «${row.label}».`} yesLabel="Sí, borrar">
              Borrar este mensaje
            </ConfirmAction>
          </div>
        </details>
      ) : (
        <p className="text-xs text-zinc-500">Lo cambia administración. Si querés una versión tuya, copiala en «Agregar mensaje».</p>
      )}
    </li>
  )
}

export function TemplatesManager({
  rows,
  createAction,
  canShare,
  profe,
}: {
  rows: TemplateRow[]
  createAction: Action
  canShare: boolean
  profe: string
}) {
  const [state, formAction] = useActionForm(createAction, {})
  return (
    <div className="space-y-5">
      <details className="rounded-2xl border border-dashed border-zinc-700 p-4 open:border-solid open:border-[#edcc36]/40">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-[#edcc36]">
          <Plus className="h-4 w-4" aria-hidden="true" /> Agregar mensaje
        </summary>
        <form action={formAction} className="mt-4 space-y-3" key={state.ok ? 'reset' : 'form'}>
          <TemplateFields err={state.fieldErrors ?? {}} />
          {canShare && (
            <label className="flex min-h-[44px] items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" name="shared" className="h-5 w-5 accent-[#edcc36]" /> Para todo el equipo (si no, queda solo para vos)
            </label>
          )}
          <Notice state={state} />
          <SubmitButton>Agregar</SubmitButton>
        </form>
      </details>
      {rows.length ? (
        <ul className="divide-y divide-zinc-900 rounded-2xl border border-zinc-800/80 bg-zinc-950 px-4">
          {rows.map((r) => (
            <TemplateEditor key={r.id} row={r} profe={profe} />
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">Todavía no hay mensajes cargados.</p>
      )}
    </div>
  )
}
