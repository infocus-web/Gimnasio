'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useState } from 'react'
import { Check, MessageCircle, PhoneOff } from 'lucide-react'
import type { ActionState } from '@/features/admin/errors'
import { Notice, SubmitButton, useActionForm } from '@/features/admin/ui'
import { normalizeArPhone, whatsappLink } from '@/features/admin/whatsapp'
import { logWhatsappMessage } from '@/features/admin/message-actions'
import { firstName, type RiskRow } from './shared'

function fmt(d: string | null, tz: string) {
  if (!d) return null
  return new Intl.DateTimeFormat('es-AR', { timeZone: tz, day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(d))
}

function message(r: RiskRow, gym: string) {
  const n = firstName(r.first_name)
  if (r.reason === 'dropped') {
    return `¡Hola ${n}! Te notamos con menos ritmo en las últimas semanas. ¿Todo bien? Si querés que te ajustemos la rutina o los horarios, avisanos. ¡Te esperamos en ${gym}! 💪`
  }
  if (r.reason === 'never') {
    return `¡Hola ${n}! Somos de ${gym}. Vimos que todavía no pudiste venir a entrenar. ¿Te ayudamos a arrancar? Te esperamos 💪`
  }
  return `¡Hola ${n}! Hace ${r.days_away} días que no te vemos por ${gym}. ¿Todo bien? Te esperamos para retomar 💪`
}

function Row({ r, slug, gym, tz, mark }: { r: RiskRow; slug: string; gym: string; tz: string; mark: (prev: ActionState) => Promise<ActionState> }) {
  const [state, submit] = useActionForm(mark)
  const [opened, setOpened] = useState(false)
  const phone = normalizeArPhone(r.phone)
  const text = message(r, gym)
  const reason =
    r.reason === 'never'
      ? `No vino nunca (${r.days_away} días desde que arrancó)`
      : r.reason === 'away'
        ? `${r.days_away} días sin venir`
        : `Bajó la frecuencia: ${r.recent} ${r.recent === 1 ? 'visita' : 'visitas'} en 2 semanas (antes ${r.previous} en 4)`
  if (state.ok) {
    return (
      <li className="flex items-center gap-2 bg-black px-4 py-3 text-sm text-emerald-200">
        <Check className="h-4 w-4" aria-hidden="true" /> {r.first_name} {r.last_name}: contactado.
      </li>
    )
  }
  return (
    <li className="space-y-3 bg-black px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/${slug}/admin/socios/${r.member_id}` as Route} className="font-semibold text-white hover:text-[#edcc36]">
            {r.first_name} {r.last_name}
          </Link>
          {r.number ? <span className="ml-2 text-xs text-zinc-500">N° {r.number}</span> : null}
          <p className={`text-sm ${r.days_away >= 14 || r.reason === 'never' ? 'text-red-300' : 'text-amber-200'}`}>{reason}</p>
          <p className="text-xs text-zinc-500">
            Último ingreso: {fmt(r.last_checkin_at, tz) ?? 'nunca'} · Plan hasta {fmt(r.period_end, tz)}
            {r.phone ? ` · ${r.phone}` : ''}
          </p>
        </div>
        <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] tabular-nums text-zinc-400" title="Puntaje de riesgo">
          riesgo {r.risk}
        </span>
      </div>
      <form action={submit} className="flex flex-wrap items-center gap-2">
        {phone ? (
          <a
            href={whatsappLink(phone, text)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              setOpened(true)
              void logWhatsappMessage(slug, { memberId: r.member_id, phone, body: text, templateKey: 'te_extranamos' })
            }}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" /> WhatsApp
          </a>
        ) : (
          <span className="inline-flex min-h-[44px] items-center gap-2 text-xs text-zinc-500">
            <PhoneOff className="h-4 w-4" aria-hidden="true" /> Sin celular válido
          </span>
        )}
        <SubmitButton variant={opened ? 'primary' : 'ghost'}>
          <Check className="h-4 w-4" aria-hidden="true" /> Marcar como contactado
        </SubmitButton>
      </form>
      <Notice state={state} />
    </li>
  )
}

export function RiskList({
  rows,
  slug,
  gym,
  tz,
}: {
  /** Cada fila trae su acción "contactado" ya bindeada (acción de servidor) */
  rows: (RiskRow & { mark: (prev: ActionState) => Promise<ActionState> })[]
  slug: string
  gym: string
  tz: string
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
        ¡Muy bien! No hay socios en riesgo ahora. Los que ya contactaste vuelven a aparecer a los 14 días si siguen sin venir.
      </p>
    )
  }
  return (
    <ul className="divide-y divide-zinc-900 overflow-hidden rounded-2xl border border-zinc-800/80">
      {rows.map((r) => (
        <Row key={r.member_id} r={r} slug={slug} gym={gym} tz={tz} mark={r.mark} />
      ))}
    </ul>
  )
}
