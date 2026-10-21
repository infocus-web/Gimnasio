'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { ActionState } from './errors'
import { Notice, SubmitButton, useActionForm } from './ui'

/** Eliminar socio definitivamente, con confirmación (escribir ELIMINAR). */
export function DeleteMemberButton({ action, name }: { action: (prev: ActionState) => Promise<ActionState>; name: string }) {
  const [state, submit] = useActionForm(action)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-red-500/30 px-4 text-sm font-semibold text-red-300 hover:bg-red-500/10"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" /> Eliminar socio
      </button>
    )
  }
  return (
    <form action={submit} className="space-y-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
      <p>
        Se borra <strong>{name}</strong> para siempre: su ficha, plan, <strong>pagos</strong>, entradas, rutinas y su cara/huella del lector.
        No se puede deshacer. Si solo deja de venir, mejor ponelo en <em>Archivado</em>.
      </p>
      <label className="block space-y-1">
        <span className="text-xs text-red-200">Para confirmar escribí ELIMINAR</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
          className="w-full rounded-xl border border-red-500/40 bg-black px-3 py-2 text-white"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {text.trim().toUpperCase() === 'ELIMINAR' && (
          <SubmitButton variant="ghost">
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Sí, eliminar definitivamente
          </SubmitButton>
        )}
        <button type="button" onClick={() => { setOpen(false); setText('') }} className="min-h-[44px] px-3 text-zinc-300">
          Cancelar
        </button>
      </div>
      <Notice state={state} />
    </form>
  )
}
