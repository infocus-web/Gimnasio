'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import type { ActionState } from '@/features/admin/errors'

/** Activa / pausa las encuestas en la app de los socios */
export function NpsToggle({ enabled, action, canManage }: { enabled: boolean; action: (on: boolean) => Promise<ActionState>; canManage: boolean }) {
  const [on, setOn] = useState(enabled)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={!canManage || pending}
        onClick={() =>
          start(async () => {
            const r = await action(!on)
            if (r.ok) setOn(!on)
            setMsg(r.ok ? null : (r.message ?? 'No se pudo cambiar.'))
          })
        }
        className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36] disabled:opacity-60 ${
          on ? 'border-[#edcc36] bg-[#edcc36]' : 'border-zinc-600 bg-zinc-800'
        }`}
      >
        <span className={`inline-block h-6 w-6 rounded-full bg-black transition-transform ${on ? 'translate-x-7' : 'translate-x-1'}`} />
        <span className="sr-only">Encuestas en la app</span>
      </button>
      <span className="text-sm text-zinc-300">
        {pending ? <Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> : on ? 'Encuestas activas' : 'Encuestas pausadas'}
      </span>
      {msg && <span className="text-xs text-red-300">{msg}</span>}
    </div>
  )
}
