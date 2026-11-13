'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { HeartPulse, MessageCircle, Search } from 'lucide-react'
import { PLAN_STATE_UI, type PlanState } from './format'
import { WhatsAppComposer, type ComposerFilter } from './WhatsAppComposer'
import type { MessageTemplate } from './whatsapp'
import { PaymentLinkButton } from '@/features/payments/PaymentLinkButton'
import type { LinkState } from '@/features/payments/actions'

export interface TrainerMemberRow {
  id: string
  name: string
  /** Normalizado 549… o null */
  phone: string | null
  medical: boolean
  state: PlanState
  planName: string | null
  /** "vence 12/11" / "venció 01/11" */
  planNote: string | null
  attended: number
  noShows: number
  /** Clases pasadas sin tomar asistencia */
  pending: number
  /** Días desde la última entrada al gimnasio (null = nunca) */
  daysAway: number | null
  /** "mar 12/11 19:00 · Funcional" */
  nextClass: string | null
  isClient: boolean
  /** Etiquetas de filtro (ver FILTERS) */
  tags: string[]
}

export const TRAINER_MEMBER_FILTERS: ComposerFilter[] = [
  { key: 'all', label: 'Todos' },
  { key: 'proxima', label: 'Anotados a una clase' },
  { key: 'vencido', label: 'Plan vencido / sin plan' },
  { key: 'por_vencer', label: 'Por vencer' },
  { key: 'faltas', label: 'Faltan seguido' },
  { key: 'ausente', label: 'No vienen hace +14 días' },
  { key: 'alumno', label: 'Mis alumnos' },
]

export function TrainerMembers({
  slug,
  senderName,
  templates,
  rows,
  days,
  payAction,
}: {
  slug: string
  senderName: string
  templates: MessageTemplate[]
  rows: TrainerMemberRow[]
  days: number
  /** Link de pago de Mercado Pago para alumnos vencidos o por vencer (solo si el gimnasio lo conectó) */
  payAction?: (slug: string, memberId: string, prev: LinkState) => Promise<LinkState>
}) {
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const f of TRAINER_MEMBER_FILTERS) c[f.key] = f.key === 'all' ? rows.length : rows.filter((r) => r.tags.includes(f.key)).length
    return c
  }, [rows])
  const visible = rows.filter(
    (r) =>
      (filter === 'all' || r.tags.includes(filter)) &&
      (!q.trim() || r.name.toLocaleLowerCase('es-AR').includes(q.trim().toLocaleLowerCase('es-AR'))),
  )

  return (
    <div className="space-y-4">
      <WhatsAppComposer
        slug={slug}
        senderName={senderName}
        templates={templates}
        students={rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone, tags: r.tags }))}
        filters={TRAINER_MEMBER_FILTERS.filter((f) => (counts[f.key] ?? 0) > 0)}
        buttonLabel="WhatsApp a varios"
      />

      <div className="flex flex-wrap items-center gap-2">
        {TRAINER_MEMBER_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            disabled={f.key !== 'all' && counts[f.key] === 0}
            className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold disabled:opacity-40 ${
              filter === f.key ? 'border-[#edcc36] bg-[#edcc36] text-black' : 'border-zinc-800 text-zinc-300 hover:border-zinc-600'
            }`}
          >
            {f.label} <span className="tabular-nums opacity-70">{counts[f.key]}</span>
          </button>
        ))}
      </div>
      <label className="relative block max-w-sm">
        <span className="sr-only">Buscar por nombre</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre"
          className="min-h-[44px] w-full rounded-xl border border-zinc-800 bg-black pl-9 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-[#edcc36] focus:outline-none"
        />
      </label>

      {visible.length ? (
        <ul className="divide-y divide-zinc-900 overflow-hidden rounded-2xl border border-zinc-800/80">
          {visible.map((r) => {
            const ui = PLAN_STATE_UI[r.state]
            const nameEl = (
              <span className="flex items-center gap-2 font-semibold text-white">
                <span className="truncate">{r.name}</span>
                {r.medical && <HeartPulse className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-label="Tiene notas médicas" />}
              </span>
            )
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-black px-4 py-3">
                <div className="min-w-0 flex-1 basis-56">
                  {r.isClient ? (
                    <Link href={`/${slug}/admin/alumnos/${r.id}` as Route} className="hover:text-[#edcc36]">
                      {nameEl}
                    </Link>
                  ) : (
                    nameEl
                  )}
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className={`rounded-full border px-2 py-0.5 font-semibold ${ui.className}`}>{ui.label}</span>
                    {r.planName && <span className="text-zinc-400">{r.planName}</span>}
                    {r.planNote && <span className="text-zinc-500">· {r.planNote}</span>}
                  </span>
                </div>
                <div className="text-xs tabular-nums">
                  <p className="text-zinc-300">
                    {r.attended} {r.attended === 1 ? 'clase' : 'clases'}
                    {r.noShows > 0 && <span className="text-red-300"> · {r.noShows} {r.noShows === 1 ? 'falta' : 'faltas'}</span>}
                    {r.pending > 0 && <span className="text-zinc-500"> · {r.pending} sin marcar</span>}
                  </p>
                  <p className={r.daysAway === null || r.daysAway > 14 ? 'text-amber-200' : 'text-zinc-500'}>
                    {r.daysAway === null ? 'Nunca entró al gimnasio' : r.daysAway === 0 ? 'Vino hoy' : `Última entrada hace ${r.daysAway} ${r.daysAway === 1 ? 'día' : 'días'}`}
                  </p>
                  {r.nextClass && <p className="text-emerald-300/90">Próxima: {r.nextClass}</p>}
                </div>
                {payAction && (r.state === 'vencido' || r.state === 'por_vencer') && (
                  <PaymentLinkButton compact action={payAction.bind(null, slug, r.id)} />
                )}
                {r.phone ? (
                  <a
                    href={`https://wa.me/${r.phone}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`WhatsApp a ${r.name}`}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#25D366]/50 text-[#7ee2a8] hover:bg-[#25D366]/15"
                  >
                    <MessageCircle className="h-5 w-5" aria-hidden="true" />
                  </a>
                ) : (
                  <span className="w-11 shrink-0 text-center text-[10px] leading-tight text-zinc-600">sin tel.</span>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          {rows.length ? 'Nadie en este filtro.' : `Nadie se anotó a tus clases en los últimos ${days} días.`}
        </p>
      )}
    </div>
  )
}
