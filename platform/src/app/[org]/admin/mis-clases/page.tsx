import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { CalendarClock, Clock, Users } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { fmtTime, todayYMD } from '@/features/admin/format'

export const metadata: Metadata = { title: 'Mis clases' }

const DAYS_AHEAD = 14

export default async function MyClassesPage({ params }: PageProps<'/[org]/admin/mis-clases'>) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx) return null // sin sesión de staff: el layout ya muestra el aviso
  const tz = ctx.org.timezone
  const supabase = await createClient()
  const from = new Date(Date.now() - 3 * 3600_000).toISOString()
  const to = new Date(Date.now() + DAYS_AHEAD * 86_400_000).toISOString()
  const { data: sessions } = await supabase
    .from('class_sessions_availability')
    .select('id, class_name, color, room_name, starts_at, ends_at, status, capacity, spots_left')
    .eq('org_id', ctx.org.id)
    .eq('instructor_id', ctx.staff.id)
    .gte('starts_at', from)
    .lt('starts_at', to)
    .order('starts_at')

  // Lista de espera por clase (el profe ve las reservas de SUS clases)
  const ids = (sessions ?? []).map((s) => s.id!).filter(Boolean)
  const { data: waiting } = ids.length
    ? await supabase.from('bookings').select('session_id').in('session_id', ids).eq('status', 'waitlisted')
    : { data: [] }
  const waitCount = new Map<string, number>()
  for (const w of waiting ?? []) waitCount.set(w.session_id, (waitCount.get(w.session_id) ?? 0) + 1)

  const ymd = (iso: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  const today = todayYMD(tz)
  const tomorrow = ymd(new Date(Date.now() + 86_400_000).toISOString())
  const dayLabel = (iso: string) => {
    const d = ymd(iso)
    const long = new Intl.DateTimeFormat('es-AR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso))
    return d === today ? `Hoy · ${long}` : d === tomorrow ? `Mañana · ${long}` : long
  }
  const groups = new Map<string, NonNullable<typeof sessions>>()
  for (const s of sessions ?? []) groups.set(dayLabel(s.starts_at!), [...(groups.get(dayLabel(s.starts_at!)) ?? []), s])

  const active = (sessions ?? []).filter((s) => s.status === 'scheduled')
  const todayList = active.filter((s) => ymd(s.starts_at!) === today)
  const weekBooked = active
    .filter((s) => new Date(s.starts_at!).getTime() < Date.now() + 7 * 86_400_000)
    .reduce((n, s) => n + ((s.capacity ?? 0) - (s.spots_left ?? 0)), 0)
  const full = active.filter((s) => (s.spots_left ?? 0) <= 0).length

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-400">Tocá una clase para ver quién viene, tomar asistencia, anotar o sacar socios, cambiarle el horario o el cupo y mandar WhatsApp a los anotados.</p>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Clases hoy" value={todayList.length} />
        <Stat label="Anotados (7 días)" value={weekBooked} />
        <Stat label="Clases llenas" value={full} />
      </div>

      {groups.size ? (
        [...groups.entries()].map(([day, list]) => (
          <section key={day} className="space-y-2">
            <h2 className="text-sm font-bold capitalize text-zinc-300">{day}</h2>
            <ul className="space-y-2">
              {list.map((s) => {
                const booked = (s.capacity ?? 0) - (s.spots_left ?? 0)
                const wl = waitCount.get(s.id!) ?? 0
                const canceled = s.status === 'canceled'
                const isFull = !canceled && (s.spots_left ?? 0) <= 0
                const now = Date.now()
                const live = !canceled && new Date(s.starts_at!).getTime() <= now && new Date(s.ends_at!).getTime() > now
                return (
                  <li key={s.id}>
                    <Link
                      href={`/${slug}/admin/agenda/${s.id}` as Route}
                      className={`flex items-center gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4 hover:border-[#edcc36]/50 ${canceled ? 'opacity-50' : ''}`}
                      style={{ borderLeft: `5px solid ${s.color ?? '#edcc36'}` }}
                    >
                      <span className="w-14 text-lg font-extrabold tabular-nums text-white">{fmtTime(s.starts_at!, tz)}</span>
                      <span className="min-w-0 flex-1">
                        <span className={`block font-semibold text-white ${canceled ? 'line-through' : ''}`}>{s.class_name}</span>
                        <span className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
                          {s.room_name}
                          {canceled && <span className="text-red-300">cancelada</span>}
                          {live && <span className="font-semibold text-emerald-300">en curso</span>}
                          {wl > 0 && <span className="text-amber-200">{wl} en espera</span>}
                        </span>
                      </span>
                      <span className={`inline-flex items-center gap-1 text-sm tabular-nums ${isFull ? 'font-bold text-[#edcc36]' : 'text-zinc-300'}`}>
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
        <div className="space-y-3 rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          <CalendarClock className="mx-auto h-8 w-8 text-zinc-600" aria-hidden="true" />
          <p>No tenés clases en los próximos {DAYS_AHEAD} días.</p>
          {(ctx.can('schedule.own') || ctx.can('schedule.manage')) && (
            <Link
              href={`/${slug}/admin/mis-clases/horarios` as Route}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#edcc36] px-4 text-sm font-bold text-black"
            >
              <Clock className="h-4 w-4" aria-hidden="true" /> Cargar mis horarios
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-3 sm:p-4">
      <p className="text-2xl font-extrabold tabular-nums text-white">{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  )
}
