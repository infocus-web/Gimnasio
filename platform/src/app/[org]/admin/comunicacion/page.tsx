import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { NoticeEditor } from '@/features/engagement/NoticeEditor'
import { saveNotice, sendTestEmail } from '@/features/engagement/actions'
import { NOTICE_ORDER, type AdminData } from '@/features/engagement/shared'

export const metadata: Metadata = { title: 'Comunicación' }

export default async function ComunicacionPage({ params }: PageProps<'/[org]/admin/comunicacion'>) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx || !ctx.can('members.write')) return null

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('engagement_admin_get', { p_org: ctx.org.id })
  if (error || !data) {
    return (
      <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
        No pudimos cargar los avisos. Recargá la página en un rato.
      </p>
    )
  }
  const d = data as unknown as AdminData
  const notices = NOTICE_ORDER.map((k) => d.notices.find((n) => n.kind === k)).filter((n) => n !== undefined)
  const base = `/${slug}/admin/comunicacion`

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-400">
        Emails que el sistema manda solo, todos los días a las 9:00. Cada aviso se manda una sola vez por motivo (no se repite).
        {!d.can_manage && ' Para activar avisos o cambiar los textos hace falta el permiso de automatizaciones (dueño o administrador).'}
      </p>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Pendientes', value: d.stats.queued, href: `${base}/historial?estado=pending` },
          { label: 'Enviados (7 días)', value: d.stats.sent_7d, href: `${base}/historial?estado=sent` },
          { label: 'Fallidos (7 días)', value: d.stats.failed_7d, href: `${base}/historial?estado=failed` },
        ].map((s) => (
          <Link
            key={s.label}
            href={s.href as Route}
            className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-3 hover:border-[#edcc36]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36] sm:p-4"
          >
            <p className="text-xs text-zinc-400">{s.label}</p>
            <p className="text-2xl font-extrabold tabular-nums text-white">{s.value}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {notices.map((n) => (
          <NoticeEditor
            key={n.kind}
            notice={n}
            orgName={ctx.org.name}
            giftDays={d.rules?.birthday_gift_days ?? 1}
            canManage={d.can_manage}
            save={saveNotice.bind(null, slug)}
            test={sendTestEmail.bind(null, slug)}
          />
        ))}
      </div>
      <p className="text-xs text-zinc-500">
        Los días de regalo de cumpleaños, los días por referido y el tope de congelamiento se configuran en{' '}
        <Link href={`${base}/reglas` as Route} className="text-[#edcc36] hover:underline">Reglas</Link>.
      </p>
    </div>
  )
}
