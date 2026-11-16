'use client'

import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import type { ActionState } from '@/features/admin/errors'
import { Notice, SubmitButton, useActionForm } from '@/features/admin/ui'
import { CopyValue } from '@/features/admin/AccessForms'

/** Generar la clave del programa de cámaras (se ve una sola vez). */
export function CameraKeyPanel({ hasKey, action }: { hasKey: boolean; action: (prev: ActionState) => Promise<ActionState> }) {
  const [state, submit] = useActionForm(action)
  const [sure, setSure] = useState(!hasKey)
  if (state.secret) {
    return (
      <div className="space-y-2 rounded-xl border border-[#edcc36]/30 bg-[#edcc36]/10 p-3 text-sm text-[#f5e38a]">
        <p>Clave para el programa de cámaras (pegala cuando el asistente te la pida):</p>
        <CopyValue value={state.secret} />
        <Notice state={state} />
      </div>
    )
  }
  if (!sure) {
    return (
      <button type="button" onClick={() => setSure(true)} className="min-h-[44px] text-sm text-zinc-400 underline">
        Generar una clave nueva (la anterior deja de funcionar)
      </button>
    )
  }
  return (
    <form action={submit} className="space-y-2">
      <Notice state={state} />
      <SubmitButton>
        <KeyRound className="h-4 w-4" aria-hidden="true" /> {hasKey ? 'Sí, generar clave nueva' : 'Generar clave'}
      </SubmitButton>
    </form>
  )
}
