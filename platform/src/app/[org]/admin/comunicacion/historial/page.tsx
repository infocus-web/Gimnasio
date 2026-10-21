import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { Mail, MessageCircle } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { fmtDateTime } from '@/features/admin/format'
import { createClient } from '@/lib/supabase/server'
import { NOTICE_META, STATUS_UI, type HistoryRow, type NoticeKind } from '@/features/engagement/shared'

export const metadata: Metadata = { title: 'Historial de mensajes' }

const FILTERS = [
  { key: '', label: 'Todos' },
  { key: 'pending', label: 'Pendientes' },
  { key: 'sent', label: 'Enviados' },
  { key: 'failed', label: 'Fallidos' },
  { key: 'manual', label: 'WhatsApp' },
] as const

export default async function HistorialPage({ params, searchParams }: PageProps<'/[org]/admin/comunicacion/historial'>) {
  const { org: slug } = await params
  const sp = await searchParams
  const ctx = await getAdminContext(slug)
  if (!ctx || !ctx.can('members.write')) return null
  const estado = FILTERS.find((f) => f.key === sp.estado)?.key ?? ''

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('engagement_history', { p_org: ctx.org.id, p_status: estado || null, p_limit: 100 })
  const rows = (data ?? []) as unknown as HistoryRow[]
  const base = `/${slug}/admin/comunicacion/historial`
  const tz = ctx.org.timezone

  return (
    <div className="space-y-4">
      <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={(f.key ? `${base}?estado=${f.key}` : base) as Route}
            aria-current={estado === f.key ? 'page' : undefined}
            className={`inline-flex min-h-[44px] items-center rounded-xl border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36] ${
              estado === f.key ? 'border-[#edcc36] bg-[#edcc36] text-black' : 'border-zinc-800 text-zinc-300 hover:text-white'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {error ? (
        <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          No pudimos cargar el historial. Recargá la página en un rato.
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          No hay mensajes {estado ? 'con ese estado' : 'todavía'}. Últimos 100 mensajes, los más nuevos arriba.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-900 overflow-hidden rounded-2xl border border-zinc-800/80">
          {rows.map((r) => {
            const ui = STATUS_UI[r.status] ?? STATUS_UI.manual
            const kind = r.kind && r.kind in NOTICE_META ? NOTICE_META[r.kind as NoticeKind].title : null
            return (
              <li key={r.id} className="space-y-1 bg-black px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  {r.channel === 'email' ? (
                    <Mail className="h-4 w-4 text-zinc-500" aria-label="Email" />
                  ) : (
                    <MessageCircle className="h-4 w-4 text-emerald-400" aria-label="WhatsApp" />
                  )}
                  <Link href={`/${slug}/admin/socios/${r.member_id}` as Route} className="font-semibold text-white hover:text-[#edcc36]">
                    {r.member_name}
                  </Link>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${ui.className}`}>{ui.label}</span>
                  <span className="ml-auto text-xs tabular-nums text-zinc-500">{fmtDateTime(r.sent_at ?? r.created_at, tz)}</span>
                </div>
                <p className="text-sm text-zinc-200">
                  {kind && <span className="text-zinc-500">{kind} · </span>}
                  {r.subject ?? r.body.slice(0, 120)}
                </p>
                <p className="text-xs text-zinc-500">
                  {[r.email ?? r.phone, r.sender && `por ${r.sender}`].filter(Boolean).join(' · ')}
                </p>
                {r.error && r.status !== 'sent' && <p className="text-xs text-red-300">Error: {r.error}</p>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
