'use client'

import { useActionState, useState } from 'react'
import { Copy, Link2, Loader2, MessageCircle } from 'lucide-react'
import type { LinkState } from './actions'

/**
 * "Mandar link de pago": genera el link de Mercado Pago del plan del socio
 * y lo deja listo para mandar por WhatsApp (o copiar).
 */
export function PaymentLinkButton({
  action,
  compact = false,
}: {
  action: (prev: LinkState) => Promise<LinkState>
  compact?: boolean
}) {
  const [state, run, pending] = useActionState(action, {} as LinkState)
  const [copied, setCopied] = useState(false)

  if (state.ok && state.url) {
    return (
      <div className="flex flex-wrap items-center gap-2" role="status">
        {state.waUrl ? (
          <a
            href={state.waUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" /> Enviar por WhatsApp
          </a>
        ) : (
          <span className="text-xs text-zinc-400">No tiene un celular válido cargado: copiá el link y mandalo vos.</span>
        )}
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(state.text ?? state.url!).then(() => setCopied(true))
          }}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-semibold text-zinc-200 hover:border-[#edcc36]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
        >
          <Copy className="h-4 w-4" aria-hidden="true" /> {copied ? 'Copiado' : 'Copiar mensaje'}
        </button>
      </div>
    )
  }

  return (
    <form action={run} className="space-y-2">
      <button
        type="submit"
        disabled={pending}
        className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-emerald-500/40 px-4 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${compact ? 'px-3 text-xs' : ''}`}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
        {compact ? 'Link de pago' : 'Mandar link de pago'}
      </button>
      {state.message && !state.ok && (
        <p role="alert" className="text-xs text-red-300">
          {state.message}
        </p>
      )}
    </form>
  )
}
