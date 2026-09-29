'use client'

import { useState } from 'react'
import { Check, X, Copy, Link2, Phone, IdCard, Mail } from 'lucide-react'
import type { ActionState } from './errors'
import { inputClass, Notice, SubmitButton, useActionForm } from './ui'
import { SecretBox } from './TeamForms'

export function ShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const wa = `https://wa.me/?text=${encodeURIComponent(`Hola! Para sumarte al sistema del gimnasio completá tus datos acá: ${url}`)}`
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-black p-2 pl-3">
        <Link2 className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
        <code className="min-w-0 flex-1 truncate text-xs text-zinc-300">{url}</code>
        <button type="button" onClick={() => { void navigator.clipboard?.writeText(url); setCopied(true) }}
          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-zinc-700 px-2.5 text-xs text-zinc-200 hover:text-white">
          <Copy className="h-3.5 w-3.5" aria-hidden="true" /> {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <a href={wa} target="_blank" rel="noreferrer" className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-emerald-500/30 px-3 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10">
        Compartir por WhatsApp
      </a>
    </div>
  )
}

export interface RequestRow {
  id: string
  first_name: string
  last_name: string
  document_id: string
  phone: string
  email: string
  requested_role: string
  message: string | null
  created_at: string
}

export function RequestCard({
  r,
  allowAdmin,
  approve,
  reject,
  when,
}: {
  r: RequestRow
  allowAdmin: boolean
  approve: (p: ActionState, f: FormData) => Promise<ActionState>
  reject: (p: ActionState) => Promise<ActionState>
  when: string
}) {
  const [aState, aAction] = useActionForm(approve, {})
  const [rState, rAction] = useActionForm(reject, {})
  if (aState.ok || rState.ok) {
    return (
      <li className="space-y-2 py-4">
        <p className="font-semibold text-white">{r.first_name} {r.last_name}</p>
        <Notice state={aState.ok ? aState : rState} />
        <SecretBox secret={aState.secret} />
      </li>
    )
  }
  return (
    <li className="space-y-3 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-white">{r.first_name} {r.last_name}</p>
          <p className="text-xs text-zinc-500">Se anotó {when} como {r.requested_role === 'trainer' ? 'profesor/a' : 'recepción'}</p>
        </div>
      </div>
      <ul className="grid gap-1 text-xs text-zinc-300 sm:grid-cols-3">
        <li className="flex items-center gap-1.5"><IdCard className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" /> DNI {r.document_id}</li>
        <li className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" /> {r.phone}</li>
        <li className="flex min-w-0 items-center gap-1.5"><Mail className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" /> <span className="truncate">{r.email}</span></li>
      </ul>
      {r.message && <p className="rounded-lg bg-zinc-900 p-2 text-xs italic text-zinc-400">“{r.message}”</p>}
      <form action={aAction} className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`role-${r.id}`}>Rol</label>
        <select id={`role-${r.id}`} name="role" defaultValue={r.requested_role} className={`${inputClass} w-auto`}>
          <option value="trainer">Profesor</option>
          <option value="staff">Recepción</option>
          {allowAdmin && <option value="admin">Administrador</option>}
        </select>
        <label className="sr-only" htmlFor={`method-${r.id}`}>Cómo recibe el acceso</label>
        <select id={`method-${r.id}`} name="method" defaultValue="email" className={`${inputClass} w-auto`}>
          <option value="email">Le llega un email para crear su contraseña</option>
          <option value="password">Generar contraseña temporal</option>
        </select>
        <SubmitButton>
          <Check className="h-4 w-4" aria-hidden="true" /> Aprobar
        </SubmitButton>
      </form>
      <form action={rAction}>
        <button type="submit" className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-red-300">
          <X className="h-3.5 w-3.5" aria-hidden="true" /> Rechazar
        </button>
      </form>
      <Notice state={aState.message ? aState : rState} />
    </li>
  )
}
