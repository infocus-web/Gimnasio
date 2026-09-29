import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { generateSessions } from '@/features/admin/schedule-actions'
import { fmtTime, startOfToday, todayYMD } from '@/features/admin/format'
import { GenerateButton, WEEKDAYS } from '@/features/admin/ScheduleForms'

export const metadata: Metadata = { title: 'Agenda' }

function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function mondayOf(ymd: string) {
  const dow = (new Date(`${ymd}T12:00:00Z`).getUTCDay() + 6) % 7
  return addDays(ymd, -dow)
}

export default async function AgendaWeek({ params, searchParams }: PageProps<'/[org]/admin/agenda'>) {
  const { org: slug } = await params
  const sp = await searchParams
  const ctx = (await getAdminContext(slug))!
  const tz = ctx.org.timezone
  const today = todayYMD(tz)
  const monday = mondayOf(typeof sp.semana === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.semana) ? sp.semana : today)

  const offsetMs = Date.parse(`${today}T00:00:00Z`) - Date.parse(startOfToday(tz))
  const toUtc = (ymd: string) => new Date(Date.parse(`${ymd}T00:00:00Z`) - offsetMs).toISOString()
  const localYMD = (iso: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

  const supabase = await createClient()
  const { data: sessions } = await supabase
    .from('class_sessions_availability')
    .select('id, class_name, color, room_name, instructor_name, starts_at, ends_at, status, capacity, spots_left, waitlist_left')
    .eq('org_id', ctx.org.id)
    .gte('starts_at', toUtc(monday))
    .lt('starts_at', toUtc(addDays(monday, 7)))
    .order('starts_at')

  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const byDay = new Map<string, NonNullable<typeof sessions>>()
  for (const s of sessions ?? []) {
    const k = localYMD(s.starts_at!)
    byDay.set(k, [...(byDay.get(k) ?? []), s])
  }
  const fmtDay = (ymd: string) =>
    new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(`${ymd}T12:00:00Z`))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`/${slug}/admin/agenda?semana=${addDays(monday, -7)}` as Route} aria-label="Semana anterior"
            className="grid h-11 w-11 place-items-center rounded-xl border border-zinc-800 text-zinc-300 hover:text-white">
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <p className="min-w-[150px] text-center text-sm font-semibold text-white">
            {fmtDay(monday)} – {fmtDay(addDays(monday, 6))}
          </p>
          <Link href={`/${slug}/admin/agenda?semana=${addDays(monday, 7)}` as Route} aria-label="Semana siguiente"
            className="grid h-11 w-11 place-items-center rounded-xl border border-zinc-800 text-zinc-300 hover:text-white">
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </Link>
          {monday !== mondayOf(today) && (
            <Link href={`/${slug}/admin/agenda` as Route} className="text-xs text-[#edcc36]">
              Hoy
            </Link>
          )}
        </div>
        {ctx.can('schedule.manage') && <GenerateButton action={generateSessions.bind(null, slug)} />}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {days.map((d, i) => {
          const list = byDay.get(d) ?? []
          return (
            <section key={d} className={`rounded-2xl border bg-zinc-950 p-3 ${d === today ? 'border-[#edcc36]/50' : 'border-zinc-800/80'}`}>
              <h2 className="mb-2 flex items-baseline justify-between text-sm font-bold text-white">
                {WEEKDAYS[i]} <span className="text-xs font-normal text-zinc-500">{fmtDay(d)}</span>
              </h2>
              {list.length ? (
                <ul className="space-y-2">
                  {list.map((s) => {
                    const booked = (s.capacity ?? 0) - (s.spots_left ?? 0)
                    const canceled = s.status === 'canceled'
                    return (
                      <li key={s.id}>
                        <Link
                          href={`/${slug}/admin/agenda/${s.id}` as Route}
                          className={`block rounded-xl border border-zinc-800 p-2.5 hover:border-[#edcc36]/50 ${canceled ? 'opacity-50' : ''}`}
                          style={{ borderLeft: `4px solid ${s.color ?? '#edcc36'}` }}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className={`text-sm font-semibold text-white ${canceled ? 'line-through' : ''}`}>{s.class_name}</span>
                            <span className="text-xs tabular-nums text-zinc-400">{fmtTime(s.starts_at!, tz)}</span>
                          </span>
                          <span className="mt-0.5 flex items-center justify-between gap-2 text-xs text-zinc-500">
                            <span className="truncate">
                              {s.instructor_name} · {s.room_name}
                            </span>
                            <span className={`inline-flex shrink-0 items-center gap-1 tabular-nums ${booked >= (s.capacity ?? 0) ? 'text-amber-200' : ''}`}>
                              <Users className="h-3 w-3" aria-hidden="true" />
                              {canceled ? 'cancelada' : `${booked}/${s.capacity}`}
                            </span>
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-xs text-zinc-600">Sin clases</p>
              )}
            </section>
          )
        })}
      </div>
      {!(sessions ?? []).length && ctx.can('schedule.manage') && (
        <p className="text-sm text-zinc-400">
          No hay clases esta semana. Armá la <Link href={`/${slug}/admin/agenda/grilla` as Route} className="text-[#edcc36]">grilla semanal</Link> y
          el sistema crea las clases solo, todos los días a la madrugada.
        </p>
      )}
    </div>
  )
}
