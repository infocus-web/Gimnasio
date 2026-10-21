'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'
import type { ActionState } from '@/features/admin/errors'
import { formatMoney } from '@/features/admin/format'
import { Field, inputClass, Notice, SubmitButton, useActionForm } from '@/features/admin/ui'

/** Mismo criterio que el servidor: punto = miles, coma = decimales */
function parseArs(raw: string): number | null {
  const clean = raw.replace(/[^\d,.]/g, '')
  if (!clean) return null
  const n = Number(clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean.replace(/\./g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

export function CloseShiftForm({
  action,
  expectedCashCents,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  expectedCashCents: number
}) {
  const [state, formAction] = useActionForm(action, {})
  const [counted, setCounted] = useState('')
  const c = parseArs(counted)
  const diff = c === null ? null : c - expectedCashCents

  if (state.ok) return <Notice state={state} />

  return (
    <form action={formAction} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Efectivo que contaste ($)" name="counted" error={state.fieldErrors?.counted}>
          <input name="counted" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)}
            placeholder="0" className={`${inputClass} text-lg font-bold`} />
        </Field>
        <div className="rounded-xl border border-zinc-800 bg-black p-3" aria-live="polite">
          <p className="text-xs text-zinc-400">Diferencia</p>
          <p className={`text-xl font-extrabold tabular-nums ${diff === null ? 'text-zinc-500' : diff === 0 ? 'text-emerald-300' : diff < 0 ? 'text-red-300' : 'text-amber-200'}`}>
            {diff === null ? '—' : diff === 0 ? 'Justo' : `${diff > 0 ? 'Sobran' : 'Faltan'} ${formatMoney(Math.abs(diff))}`}
          </p>
        </div>
      </div>
      <Field label="Nota (opcional)" name="note">
        <input name="note" maxLength={500} placeholder="Ej. retiré $10.000 para cambio" className={inputClass} />
      </Field>
      <Notice state={state} />
      <div className="flex justify-end">
        <SubmitButton>
          <Lock className="h-4 w-4" aria-hidden="true" /> Cerrar mi turno
        </SubmitButton>
      </div>
    </form>
  )
}
