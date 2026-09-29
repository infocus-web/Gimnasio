import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { Users } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { fmtTime } from '@/features/admin/format'

export const metadata: Metadata = { title: 'Mis clases' }

export default async function MyClassesPage({ params }: PageProps<'/[org]/admin/mis-clases'>) {
  const { org: slug } = await params
  const ctx = (await getAdminContext(slug))!
  const tz = ctx.org.timezone
  const supabase = await createClient()
  const from = new Date(Date.now() - 3 * 3600_000).toISOString()
  const to = new Date(Date.now() + 7 * 86_400_000).toISOString()
  const { data: sessions } = await supabase
    .from('class_sessions_availability')
    .select('id, class_name, color, room_name, starts_at, status, capacity, spots_left')
    .eq('org_id', ctx.org.id)
    .eq('instructor_id', ctx.staff.id)
    .gte('starts_at', from)
    .lt('starts_at', to)
    .order('starts_at')

  const dayKey = (iso: string) => new Intl.DateTimeFormat('es-AR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso))
  const groups = new Map<string, NonNullable<typeof sessions>>()
  for (const s of sessions ?? []) groups.set(dayKey(s.starts_at!), [...(groups.get(dayKey(s.starts_at!)) ?? []), s])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Mis clases</h1>
        <p className="text-sm text-zinc-400">Tocá una clase para ver quién viene y tomar asistencia.</p>
      </div>
      {groups.size ? (
        [...groups.entries()].map(([day, list]) => (
          <section key={day} className="space-y-2">
            <h2 className="text-sm font-bold capitalize text-zinc-300">{day}</h2>
            <ul className="space-y-2">
              {list.map((s) => {
                const booked = (s.capacity ?? 0) - (s.spots_left ?? 0)
                return (
                  <li key={s.id}>
                    <Link href={`/${slug}/admin/agenda/${s.id}` as Route}
                      className={`flex items-center gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4 hover:border-[#edcc36]/50 ${s.status === 'canceled' ? 'opacity-50' : ''}`}
                      style={{ borderLeft: `5px solid ${s.color ?? '#edcc36'}` }}>
                      <span className="w-14 text-lg font-extrabold tabular-nums text-white">{fmtTime(s.starts_at!, tz)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-white">{s.class_name}</span>
                        <span className="text-xs text-zinc-500">{s.room_name}{s.status === 'canceled' ? ' · cancelada' : ''}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-sm tabular-nums text-zinc-300">
                        <Users className="h-4 w-4" aria-hidden="true" /> {booked}/{s.capacity}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      ) : (
        <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          No tenés clases asignadas en los próximos 7 días.
        </p>
      )}
    </div>
  )
}
