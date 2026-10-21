'use client'

import { useMemo, useState } from 'react'
import { Search, UserPlus } from 'lucide-react'
import type { ActionState } from '@/features/admin/errors'
import { Field, Notice, SubmitButton, inputClass, useActionForm } from '@/features/admin/ui'
import type { NewMemberOption } from './shared'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function ReferralForm({
  members,
  action,
  rewardDays,
}: {
  members: NewMemberOption[]
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  rewardDays: number
}) {
  const [state, submit] = useActionForm(action)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState('')
  const visible = useMemo(() => {
    const t = norm(q.trim())
    if (!t) return members.slice(0, 30)
    return members
      .filter((m) => norm(m.name).includes(t) || (m.document ?? '').includes(t) || String(m.number ?? '').includes(t))
      .slice(0, 30)
  }, [q, members])

  return (
    <form action={submit} className="space-y-4">
      <p className="text-sm text-zinc-400">
        Cuando un socio nuevo viene recomendado, buscalo y cargá el código de quien lo recomendó (está en la app del socio, en
        &quot;Yo&quot;). Al registrar su primer pago, <strong className="text-zinc-200">los dos suman {rewardDays} días gratis</strong> a su plan.
      </p>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-zinc-400">Buscar socio nuevo (inscriptos en los últimos 60 días)</span>
        <span className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre, DNI o N° de socio"
            className={`${inputClass} pl-9`}
          />
        </span>
      </label>
      <fieldset className="space-y-1">
        <legend className="mb-1 text-xs font-medium text-zinc-400">Socio nuevo</legend>
        {visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-800 p-4 text-center text-sm text-zinc-500">
            {members.length === 0 ? 'No hay socios nuevos sin referido en los últimos 60 días.' : 'No encontramos a nadie con esa búsqueda.'}
          </p>
        ) : (
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-zinc-800 p-1">
            {visible.map((m) => (
              <label
                key={m.id}
                className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                  picked === m.id ? 'bg-[#edcc36]/10 text-white' : 'text-zinc-300 hover:bg-zinc-900'
                }`}
              >
                <input
                  type="radio"
                  name="memberId"
                  value={m.id}
                  checked={picked === m.id}
                  onChange={() => setPicked(m.id)}
                  className="h-4 w-4 accent-[#edcc36]"
                />
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                <span className="shrink-0 text-xs text-zinc-500">
                  {[m.number && `N° ${m.number}`, m.document && `DNI ${m.document}`].filter(Boolean).join(' · ')}
                </span>
              </label>
            ))}
          </div>
        )}
        {state.fieldErrors?.memberId && <p className="text-xs text-red-300">{state.fieldErrors.memberId}</p>}
      </fieldset>
      <Field label="Código de quien lo recomendó" name="code" error={state.fieldErrors?.code} hint="Ej.: MARTINA4821 (también sirve pegar el link completo)">
        <input name="code" required autoCapitalize="characters" autoComplete="off" className={`${inputClass} uppercase`} />
      </Field>
      <SubmitButton>
        <UserPlus className="h-4 w-4" aria-hidden="true" /> Registrar referido
      </SubmitButton>
      <Notice state={state} />
    </form>
  )
}
