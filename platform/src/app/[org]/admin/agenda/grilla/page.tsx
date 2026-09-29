import type { Metadata } from 'next'
import { Plus } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { createSeries, endSeries, updateSeries } from '@/features/admin/schedule-actions'
import { SeriesForm, SeriesRowForm, WEEKDAYS } from '@/features/admin/ScheduleForms'

export const metadata: Metadata = { title: 'Grilla semanal' }

export default async function GridPage({ params }: PageProps<'/[org]/admin/agenda/grilla'>) {
  const { org: slug } = await params
  const ctx = (await getAdminContext(slug))!
  if (!ctx.can('schedule.manage')) return <p className="text-sm text-zinc-400">No tenés permiso para editar la grilla.</p>

  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)
  const [{ data: series }, { data: types }, { data: rooms }, { data: staff }] = await Promise.all([
    supabase
      .from('class_series')
      .select('id, weekday, start_time, duration_min, capacity, room_id, instructor_id, class_type_id, valid_until, class_types(name, color)')
      .eq('org_id', ctx.org.id)
      .or(`valid_until.is.null,valid_until.gte.${today}`)
      .order('weekday')
      .order('start_time'),
    supabase.from('class_types').select('id, name, default_duration_min, default_capacity').eq('org_id', ctx.org.id).eq('active', true).order('name'),
    supabase.from('rooms').select('id, name, capacity').eq('org_id', ctx.org.id).eq('active', true).order('name'),
    supabase.from('staff').select('id, display_name, role').eq('org_id', ctx.org.id).eq('active', true).order('display_name'),
  ])

  const instructors = (staff ?? []).map((s) => ({ id: s.id, name: s.display_name }))
  const roomOpts = (rooms ?? []).map((r) => ({ id: r.id, name: r.name, capacity: r.capacity }))
  const byDay = WEEKDAYS.map((_, i) => (series ?? []).filter((s) => s.weekday === i + 1))

  return (
    <div className="space-y-5">
      {types?.length && rooms?.length ? (
        <details className="rounded-2xl border border-dashed border-zinc-700 p-4 open:border-solid open:border-[#edcc36]/40">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-[#edcc36]">
            <Plus className="h-4 w-4" aria-hidden="true" /> Agregar horario fijo
          </summary>
          <div className="mt-4">
            <SeriesForm
              action={createSeries.bind(null, slug)}
              classTypes={(types ?? []).map((t) => ({ id: t.id, name: t.name, duration: t.default_duration_min, capacity: t.default_capacity }))}
              rooms={roomOpts}
              instructors={instructors}
            />
          </div>
        </details>
      ) : (
        <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          Primero creá al menos una actividad y una sala.
        </p>
      )}

      <p className="text-xs text-zinc-500">
        La grilla es la plantilla de la semana. El sistema crea las clases de las próximas 4 semanas automáticamente todos los
        días. Si cambiás profe, sala o cupo, se aplica a las clases futuras. Para cambiar día u hora, das de baja el horario y
        creás uno nuevo.
      </p>

      <div className="space-y-4">
        {byDay.map((list, i) =>
          list.length ? (
            <section key={i} className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-300">{WEEKDAYS[i]}</h2>
              <ul className="divide-y divide-zinc-900">
                {list.map((s) => {
                  const t = s.class_types as unknown as { name: string; color: string } | null
                  return (
                    <li key={s.id} className="flex flex-col gap-2 py-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex items-center gap-3">
                        <span className="h-8 w-1.5 rounded-full" style={{ background: t?.color ?? '#edcc36' }} aria-hidden="true" />
                        <div>
                          <p className="font-semibold text-white">
                            {s.start_time.slice(0, 5)} · {t?.name}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {s.duration_min} min{s.valid_until ? ` · hasta ${s.valid_until}` : ''}
                          </p>
                        </div>
                      </div>
                      <SeriesRowForm
                        action={updateSeries.bind(null, slug, s.id)}
                        endAction={endSeries.bind(null, slug, s.id)}
                        roomId={s.room_id}
                        instructorId={s.instructor_id}
                        capacity={s.capacity}
                        rooms={roomOpts}
                        instructors={instructors}
                      />
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null,
        )}
        {!(series ?? []).length && <p className="text-sm text-zinc-500">Todavía no hay horarios cargados.</p>}
      </div>
    </div>
  )
}
