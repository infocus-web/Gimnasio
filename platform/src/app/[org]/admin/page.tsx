import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { Users, ScanLine, AlarmClock, UserX, UserPlus, ArrowRight } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { fmtDate, fmtTime, startOfToday } from '@/features/admin/format'

export const metadata: Metadata = { title: 'Panel' }

export default async function AdminHome({ params }: PageProps<'/[org]/admin'>) {
  const { org: slug } = await params
  const ctx = (await getAdminContext(slug))!
  const supabase = await createClient()
  const orgId = ctx.org.id
  const canMembers = ctx.can('members.read')

  const now = new Date()
  const in7 = new Date(now.getTime() + 7 * 86_400_000).toISOString()
  const today = startOfToday(ctx.org.timezone)

  const [active, checkinsToday, expiring, noPlan, recent] = canMembers
    ? await Promise.all([
        supabase.from('members').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'active'),
        supabase.from('checkins').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('allowed', true).gte('created_at', today),
        supabase
          .from('member_directory')
          .select('id, first_name, last_name, plan_name, current_period_end')
          .eq('org_id', orgId)
          .eq('is_payer', true)
          .gte('current_period_end', now.toISOString())
          .lte('current_period_end', in7)
          .order('current_period_end')
          .limit(8),
        supabase
          .from('member_directory')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('status', 'active')
          .or(`membership_id.is.null,current_period_end.lt.${now.toISOString()}`),
        supabase
          .from('checkins')
          .select('id, created_at, allowed, reason, members(first_name, last_name)')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(8),
      ])
    : [null, null, null, null, null]

  const stats = [
    { label: 'Socios activos', value: active?.count ?? 0, icon: Users, href: `/${slug}/admin/socios` },
    { label: 'Entradas hoy', value: checkinsToday?.count ?? 0, icon: ScanLine, href: `/${slug}/admin/recepcion` },
    { label: 'Vencen en 7 días', value: expiring?.data?.length ?? 0, icon: AlarmClock, href: `/${slug}/admin/socios?estado=por_vencer` },
    { label: 'Vencidos o sin plan', value: noPlan?.count ?? 0, icon: UserX, href: `/${slug}/admin/socios?estado=vencido` },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#edcc36]">Panel</p>
          <h1 className="text-2xl font-extrabold text-white">Hola, {ctx.staff.display_name.split(' ')[0]}</h1>
        </div>
        {ctx.can('members.write') && (
          <Link
            href={`/${slug}/admin/socios/nuevo` as Route}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#edcc36] px-4 text-sm font-bold text-black"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" /> Nuevo socio
          </Link>
        )}
      </div>

      {canMembers ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {stats.map((s) => (
              <Link
                key={s.label}
                href={s.href as Route}
                className="group rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4 transition-colors hover:border-[#edcc36]/40"
              >
                <s.icon className="h-5 w-5 text-[#edcc36]" aria-hidden="true" />
                <p className="mt-3 text-3xl font-extrabold tabular-nums text-white">{s.value}</p>
                <p className="text-xs text-zinc-400">{s.label}</p>
              </Link>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-300">Vencen esta semana</h2>
              {expiring?.data?.length ? (
                <ul className="divide-y divide-zinc-900">
                  {expiring.data.map((m) => (
                    <li key={m.id}>
                      <Link
                        href={`/${slug}/admin/socios/${m.id}` as Route}
                        className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-[#edcc36]"
                      >
                        <span className="truncate text-zinc-100">
                          {m.first_name} {m.last_name}
                          <span className="ml-2 text-xs text-zinc-500">{m.plan_name}</span>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-amber-200">{fmtDate(m.current_period_end)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">Nadie vence en los próximos 7 días.</p>
              )}
            </section>

            <section className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-300">Últimas entradas</h2>
                <Link href={`/${slug}/admin/recepcion` as Route} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white">
                  Recepción <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              </div>
              {recent?.data?.length ? (
                <ul className="divide-y divide-zinc-900">
                  {recent.data.map((c) => {
                    const m = c.members as unknown as { first_name: string; last_name: string } | null
                    return (
                      <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <span className="truncate text-zinc-100">{m ? `${m.first_name} ${m.last_name}` : 'Socio'}</span>
                        <span className={`shrink-0 text-xs tabular-nums ${c.allowed ? 'text-emerald-300' : 'text-red-300'}`}>
                          {c.allowed ? '' : 'Rechazado · '}
                          {fmtTime(c.created_at)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">Todavía no hubo entradas.</p>
              )}
            </section>
          </div>
        </>
      ) : (
        <p className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
          Desde el menú tenés <strong className="text-white">Mis clases</strong> (asistencia),{' '}
          <strong className="text-white">Mis alumnos</strong> (progreso) y <strong className="text-white">Rutinas</strong> (armado y
          asignación).
        </p>
      )}
    </div>
  )
}
