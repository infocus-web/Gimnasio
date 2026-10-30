import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { Users, ScanLine, AlarmClock, UserX, UserPlus, ArrowRight } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { CHECKIN_REASON, fmtDate, fmtTime, startOfToday } from '@/features/admin/format'
import type { StatTone } from '@/features/admin/stat-tones'
import { StatCard } from '@/features/admin/StatCard'

export const metadata: Metadata = { title: 'Panel' }

export default async function AdminHome({ params }: PageProps<'/[org]/admin'>) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx) return null // sin sesión de staff: el layout ya muestra el aviso
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
          .select('id, first_name, last_name, plan_name, current_period_end', { count: 'exact' })
          .eq('org_id', orgId)
          .eq('status', 'active')
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

  const activeCount = active?.count ?? 0
  const todayCount = checkinsToday?.count ?? 0
  // Barra de la primera tarjeta: qué parte de los socios activos ya vino hoy
  const todayPct = activeCount ? Math.min(100, Math.round((todayCount / activeCount) * 100)) : 0
  const stats: { label: string; value: number; icon: typeof Users; href: string; tone: StatTone; note?: string }[] = [
    { label: 'Entradas hoy', value: todayCount, icon: ScanLine, href: `/${slug}/admin/recepcion`, tone: 'brand', note: `${todayPct}% de los socios activos` },
    { label: 'Socios activos', value: activeCount, icon: Users, href: `/${slug}/admin/socios`, tone: 'salmon' },
    { label: 'Vencen en 7 días', value: expiring?.count ?? expiring?.data?.length ?? 0, icon: AlarmClock, href: `/${slug}/admin/socios?estado=por_vencer`, tone: 'mint' },
    { label: 'Vencidos o sin plan', value: noPlan?.count ?? 0, icon: UserX, href: `/${slug}/admin/socios?estado=vencido`, tone: 'lavender' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">Hola, {ctx.staff.display_name.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-zinc-400">Así viene el gimnasio hoy.</p>
        </div>
        {ctx.can('members.write') && (
          <Link
            href={`/${slug}/admin/socios/nuevo` as Route}
            className="btn-tac inline-flex min-h-[44px] items-center gap-2 bg-brand px-4 text-sm text-black lg:hidden"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" /> Nuevo socio
          </Link>
        )}
      </div>

      {canMembers ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {stats.map((s) => (
              <StatCard
                key={s.label}
                label={s.label}
                value={s.value}
                icon={s.icon}
                href={s.href}
                tone={s.tone}
                note={s.note}
                progress={s.note !== undefined ? todayPct : undefined}
              />
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-[#444] bg-[#2c2c2c] p-5">
              <h2 className="mb-3 text-base font-bold text-white">Vencen esta semana</h2>
              {expiring?.data?.length ? (
                <ul className="divide-y divide-[#3d3d3d]">
                  {expiring.data.map((m) => (
                    <li key={m.id}>
                      <Link
                        href={`/${slug}/admin/socios/${m.id}` as Route}
                        className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-brand"
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

            <section className="rounded-2xl border border-[#444] bg-[#2c2c2c] p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-bold text-white">Últimas entradas</h2>
                {ctx.can('checkins.manage') && (
                  <Link href={`/${slug}/admin/recepcion` as Route} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white">
                    Recepción <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                )}
              </div>
              {recent?.data?.length ? (
                <ul className="divide-y divide-[#3d3d3d]">
                  {recent.data.map((c) => {
                    const m = c.members as unknown as { first_name: string; last_name: string } | null
                    return (
                      <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <span className="truncate text-zinc-100">{m ? `${m.first_name} ${m.last_name}` : 'Socio'}</span>
                        <span className={`shrink-0 text-xs tabular-nums ${c.allowed ? 'text-emerald-300' : 'text-red-300'}`}>
                          {c.allowed ? '' : `Rechazado${c.reason && CHECKIN_REASON[c.reason] ? ` (${CHECKIN_REASON[c.reason]})` : ''} · `}
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
