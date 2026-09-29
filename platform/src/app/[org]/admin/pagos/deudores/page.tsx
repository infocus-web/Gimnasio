import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { MessageCircle } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { daysUntil, fmtDate } from '@/features/admin/format'

export const metadata: Metadata = { title: 'Vencidos' }

function waLink(phone: string | null, text: string) {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length < 8) return null
  const intl = digits.startsWith('54') ? digits : `549${digits.replace(/^0/, '').replace(/^15/, '')}`
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`
}

export default async function DebtorsPage({ params }: PageProps<'/[org]/admin/pagos/deudores'>) {
  const { org: slug } = await params
  const ctx = (await getAdminContext(slug))!
  if (!ctx.can('billing.read')) return <p className="text-sm text-zinc-400">No tenés permiso.</p>

  const supabase = await createClient()
  const now = new Date().toISOString()
  const in7 = new Date(Date.now() + 7 * 86_400_000).toISOString()
  const [overdue, soon] = await Promise.all([
    supabase
      .from('member_directory')
      .select('id, first_name, last_name, phone, plan_name, current_period_end, last_checkin_at')
      .eq('org_id', ctx.org.id)
      .eq('is_payer', true)
      .eq('status', 'active')
      .not('membership_id', 'is', null)
      .lt('current_period_end', now)
      .order('current_period_end', { ascending: false })
      .limit(200),
    supabase
      .from('member_directory')
      .select('id, first_name, last_name, phone, plan_name, current_period_end, last_checkin_at')
      .eq('org_id', ctx.org.id)
      .eq('is_payer', true)
      .eq('status', 'active')
      .gte('current_period_end', now)
      .lte('current_period_end', in7)
      .order('current_period_end')
      .limit(200),
  ])

  const Section = ({ title, rows, overdueList }: { title: string; rows: typeof overdue.data; overdueList: boolean }) => (
    <section className="space-y-2">
      <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-300">
        {title} <span className="text-zinc-500">({rows?.length ?? 0})</span>
      </h2>
      {rows && rows.length ? (
        <ul className="divide-y divide-zinc-900 overflow-hidden rounded-2xl border border-zinc-800/80">
          {rows.map((m) => {
            const d = daysUntil(m.current_period_end) ?? 0
            const msg = overdueList
              ? `Hola ${m.first_name}! Te escribimos de ${ctx.org.name}: tu plan venció el ${fmtDate(m.current_period_end)}. ¿Querés que te lo renovemos? 💪`
              : `Hola ${m.first_name}! Te recordamos de ${ctx.org.name} que tu plan vence el ${fmtDate(m.current_period_end)}.`
            const wa = waLink(m.phone, msg)
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-black px-4 py-3">
                <span className="min-w-0 flex-1">
                  <Link href={`/${slug}/admin/socios/${m.id}` as Route} className="font-semibold text-white hover:text-[#edcc36]">
                    {m.first_name} {m.last_name}
                  </Link>
                  <span className="block text-xs text-zinc-500">
                    {m.plan_name} · última entrada {fmtDate(m.last_checkin_at)}
                  </span>
                </span>
                <span className={`text-sm tabular-nums ${overdueList ? 'text-red-300' : 'text-amber-200'}`}>
                  {overdueList ? `hace ${Math.abs(d)} días` : d <= 0 ? 'hoy' : `en ${d} días`}
                </span>
                {wa && (
                  <a href={wa} target="_blank" rel="noreferrer" aria-label={`Escribir por WhatsApp a ${m.first_name}`}
                    className="grid h-10 w-10 place-items-center rounded-xl border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10">
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  </a>
                )}
                <Link href={`/${slug}/admin/socios/${m.id}#cobrar` as Route}
                  className="min-h-[40px] rounded-xl bg-[#edcc36] px-3 py-2 text-xs font-bold text-black">
                  Cobrar
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">Nadie en esta lista.</p>
      )}
    </section>
  )

  return (
    <div className="space-y-6">
      <Section title="Vencidos" rows={overdue.data} overdueList />
      <Section title="Vencen en los próximos 7 días" rows={soon.data} overdueList={false} />
    </div>
  )
}
