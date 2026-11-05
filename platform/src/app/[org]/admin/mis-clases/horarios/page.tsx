import type { Metadata } from 'next'
import { Plus } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { createSeriesRpc, editSeries, endSeries } from '@/features/admin/schedule-actions'
import { SeriesForm } from '@/features/admin/ScheduleForms'
import { EditSeriesForm } from '@/features/admin/ClassEditForms'
import { InfoTip } from '@/components/InfoTip'
import { WEEKDAYS, fmtDate, todayYMD } from '@/features/admin/format'

export const metadata: Metadata = { title: 'Mis horarios' }

/** Grilla del profe: sus horarios fijos (se repiten todas las semanas) */
export default async function MyScheduleGridPage({ params }: PageProps<'/[org]/admin/mis-clases/horarios'>) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx) return null
  if (!ctx.can('schedule.own') && !ctx.can('schedule.manage')) {
    return <p className="text-sm text-zinc-400">Administración no te habilitó para cambiar tus horarios. Pediles que lo hagan desde Equipo.</p>
  }

  const supabase = await createClient()
  const today = todayYMD(ctx.org.timezone)
  const [{ data: series }, { data: types }, { data: rooms }] = await Promise.all([
    supabase
      .from('class_series')
      .select('id, weekday, start_time, duration_min, capacity, room_id, valid_from, valid_until, class_types(name, color), rooms(name)')
      .eq('org_id', ctx.org.id)
      .eq('instructor_id', ctx.staff.id)
      .or(`valid_until.is.null,valid_until.gte.${today}`)
      .order('weekday')
      .order('start_time'),
    supabase.from('class_types').select('id, name, default_duration_min, default_capacity').eq('org_id', ctx.org.id).eq('active', true).order('name'),
    supabase.from('rooms').select('id, name, capacity').eq('org_id', ctx.org.id).eq('active', true).order('name'),
  ])
  const roomOpts = (rooms ?? []).map((r) => ({ id: r.id, name: r.name, capacity: r.capacity }))
  const byDay = WEEKDAYS.map((_, i) => (series ?? []).filter((s) => s.weekday === i + 1))

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-400">
        Tus horarios fijos: se repiten todas las semanas y el sistema arma las clases de las próximas 4 semanas solo.
        Si cambiás día u hora, las clases vacías se rearman en el horario nuevo y, a las que ya tienen anotados, les llega un email.
      </p>

      {types?.length && rooms?.length ? (
        <details className="rounded-2xl border border-dashed border-zinc-700 p-4 open:border-solid open:border-[#edcc36]/40">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-[#edcc36]">
            <Plus className="h-4 w-4" aria-hidden="true" /> Agregar un horario
            <InfoTip label="Agregar un horario">
              <p>Crea una clase tuya que <strong>se repite todas las semanas</strong> el mismo día y hora (ej. Funcional, martes 19 h), con su sala y cupo.</p>
              <p>No deja cargarla si la sala o vos ya tienen otra clase en ese horario.</p>
            </InfoTip>
          </summary>
          <div className="mt-4">
            <SeriesForm
              action={createSeriesRpc.bind(null, slug)}
              classTypes={(types ?? []).map((t) => ({ id: t.id, name: t.name, duration: t.default_duration_min, capacity: t.default_capacity }))}
              rooms={roomOpts}
              instructors={[{ id: ctx.staff.id, name: ctx.staff.display_name }]}
            />
          </div>
        </details>
      ) : (
        <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          Todavía no hay actividades o salas cargadas: pedile a administración que las cree en Agenda.
        </p>
      )}

      <div className="space-y-4">
        {byDay.map((list, i) =>
          list.length ? (
            <section key={i} className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-300">{WEEKDAYS[i]}</h2>
              <ul className="divide-y divide-zinc-900">
                {list.map((s) => {
                  const t = s.class_types as unknown as { name: string; color: string } | null
                  const room = s.rooms as unknown as { name: string } | null
                  return (
                    <li key={s.id} className="grid gap-3 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-start">
                      <div className="flex items-center gap-3">
                        <span className="h-10 w-1.5 rounded-full" style={{ background: t?.color ?? '#edcc36' }} aria-hidden="true" />
                        <div>
                          <p className="font-semibold text-white">
                            {s.start_time.slice(0, 5)} · {t?.name}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {s.duration_min} min · {room?.name} · cupo {s.capacity}
                            {s.valid_from > today ? ` · desde ${fmtDate(s.valid_from, ctx.org.timezone)}` : ''}
                            {s.valid_until ? ` · hasta ${fmtDate(s.valid_until, ctx.org.timezone)}` : ''}
                          </p>
                        </div>
                      </div>
                      <EditSeriesForm
                        action={editSeries.bind(null, slug, s.id)}
                        endAction={endSeries.bind(null, slug, s.id)}
                        weekday={s.weekday}
                        startTime={s.start_time.slice(0, 5)}
                        durationMin={s.duration_min}
                        capacity={s.capacity}
                        roomId={s.room_id}
                        rooms={roomOpts}
                      />
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null,
        )}
        {!(series ?? []).length && (
          <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">Todavía no tenés horarios fijos.</p>
        )}
      </div>
    </div>
  )
}
