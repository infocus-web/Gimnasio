import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { CalendarDays, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
import { supabase, uploadMedia } from '../../lib/supabase'
import type { Activity, ScheduleSlot } from '../../lib/types'
import { WEEKDAYS, fmtTime } from '../../lib/format'
import { Button, Card, Empty, Field, Loading, Modal, PageHeader, confirmDelete, errorText, useToast } from '../../components/ui'
import { WeekSchedule } from '../../components/WeekSchedule'

const COLORS = ['#edcc36', '#f97316', '#06b6d4', '#a855f7', '#ef4444', '#eab308', '#ec4899', '#3b82f6']
type SlotDraft = Omit<ScheduleSlot, 'id' | 'activity_id'> & { id?: string }

export function Activities() {
  const toast = useToast()
  const [activities, setActivities] = useState<Activity[] | null>(null)
  const [slots, setSlots] = useState<ScheduleSlot[]>([])
  const [edit, setEdit] = useState<Partial<Activity> | null>(null)
  const [drafts, setDrafts] = useState<SlotDraft[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [a, s] = await Promise.all([
      supabase.from('activities').select('*').order('sort').order('name'),
      supabase.from('activity_schedule').select('*').order('weekday').order('start_time'),
    ])
    setActivities((a.data as Activity[]) ?? [])
    setSlots((s.data as ScheduleSlot[]) ?? [])
  }, [])
  useEffect(() => {
    load()
  }, [load])

  function open(a?: Activity) {
    setEdit(a ?? { name: '', description: '', instructor: '', color: COLORS[(activities?.length ?? 0) % COLORS.length], active: true, sort: (activities?.length ?? 0) + 1 })
    setDrafts(a ? slots.filter((s) => s.activity_id === a.id).map(({ activity_id: _a, ...rest }) => rest) : [])
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!edit) return
    setBusy(true)
    try {
      const { id, ...rest } = edit
      const payload = { ...rest, capacity: rest.capacity ? Number(rest.capacity) : null }
      const res = id
        ? await supabase.from('activities').update(payload).eq('id', id).select().single()
        : await supabase.from('activities').insert(payload).select().single()
      if (res.error) throw res.error
      const act = res.data as Activity
      // reemplaza los horarios de la actividad
      const del = await supabase.from('activity_schedule').delete().eq('activity_id', act.id)
      if (del.error) throw del.error
      const valid = drafts.filter((d) => d.start_time && d.end_time)
      if (valid.length) {
        const ins = await supabase
          .from('activity_schedule')
          .insert(valid.map(({ id: _id, ...d }) => ({ ...d, activity_id: act.id, room: d.room || null })))
        if (ins.error) throw ins.error
      }
      toast('Actividad guardada')
      setEdit(null)
      load()
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function remove(a: Activity) {
    if (!confirmDelete(`la actividad "${a.name}" y sus horarios`)) return
    const { error } = await supabase.from('activities').delete().eq('id', a.id)
    if (error) return toast(errorText(error), 'error')
    setEdit(null)
    load()
  }

  async function uploadImage(file: File | undefined) {
    if (!file || !edit) return
    try {
      const url = await uploadMedia(file, 'actividades')
      setEdit({ ...edit, image_url: url })
    } catch (err) {
      toast(errorText(err), 'error')
    }
  }

  return (
    <div>
      <PageHeader
        title="Actividades"
        subtitle="Clases y servicios del gimnasio con sus horarios. Se muestran en la web y en el link de cada socio."
        actions={
          <Button onClick={() => open()}>
            <Plus className="size-4" /> Nueva actividad
          </Button>
        }
      />
      {!activities ? (
        <Loading />
      ) : activities.length === 0 ? (
        <Empty icon={<CalendarDays className="size-10" />} title="No hay actividades" action={<Button onClick={() => open()}>Crear actividad</Button>} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {activities.map((a) => (
              <Card key={a.id} className={`overflow-hidden ${a.active ? '' : 'opacity-60'}`}>
                <div className="h-1.5" style={{ background: a.color ?? '#edcc36' }} />
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <h3 className="font-display text-lg font-bold uppercase">{a.name}</h3>
                    <button onClick={() => open(a)} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800" aria-label="Editar">
                      <Pencil className="size-4" />
                    </button>
                  </div>
                  {a.instructor && <p className="text-sm text-zinc-500">{a.instructor}</p>}
                  <p className="mt-2 text-xs text-zinc-500">{slots.filter((s) => s.activity_id === a.id).length} horarios por semana</p>
                </div>
              </Card>
            ))}
          </div>
          <Card className="mt-6 p-5">
            <h2 className="mb-4 text-sm font-semibold">Grilla semanal</h2>
            <WeekSchedule
              activities={activities}
              slots={slots}
              onSlotClick={(s) => {
                const a = activities.find((x) => x.id === s.activity_id)
                if (a) open(a)
              }}
            />
          </Card>
        </>
      )}

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? 'Editar actividad' : 'Nueva actividad'}
        wide
        footer={
          <>
            {edit?.id && (
              <Button variant="ghost" className="mr-auto text-red-600" onClick={() => remove(edit as Activity)}>
                <Trash2 className="size-4" /> Borrar
              </Button>
            )}
            <Button variant="secondary" onClick={() => setEdit(null)}>
              Cancelar
            </Button>
            <Button type="submit" form="act-form" loading={busy}>
              Guardar
            </Button>
          </>
        }
      >
        {edit && (
          <form id="act-form" onSubmit={save} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre">
                <input className="input" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required autoFocus />
              </Field>
              <Field label="Profe / a cargo">
                <input className="input" value={edit.instructor ?? ''} onChange={(e) => setEdit({ ...edit, instructor: e.target.value })} />
              </Field>
              <Field label="Descripción" className="sm:col-span-2">
                <textarea className="input" rows={2} value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
              </Field>
              <Field label="Color">
                <div className="flex gap-1.5">
                  {COLORS.map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setEdit({ ...edit, color: c })}
                      className={`size-7 rounded-full ring-offset-2 ${edit.color === c ? 'ring-2 ring-zinc-900' : ''}`}
                      style={{ background: c }}
                      aria-label={c}
                    />
                  ))}
                </div>
              </Field>
              <Field label="Cupo (opcional)">
                <input className="input" type="number" min={0} value={edit.capacity ?? ''} onChange={(e) => setEdit({ ...edit, capacity: e.target.value ? Number(e.target.value) : null })} />
              </Field>
              <Field label="Foto (web pública)">
                <div className="flex items-center gap-3">
                  {edit.image_url && <img src={edit.image_url} alt="" className="h-10 w-16 rounded object-cover" />}
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50">
                    <Upload className="size-4" /> Subir
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadImage(e.target.files?.[0])} />
                  </label>
                </div>
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" className="size-4 accent-yellow-400" checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />
                Activa (visible)
              </label>
            </div>

            <div>
              <p className="label">Horarios</p>
              <div className="space-y-2">
                {drafts.map((d, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <select className="input !w-36" value={d.weekday} onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, weekday: Number(e.target.value) } : x)))}>
                      {[1, 2, 3, 4, 5, 6, 7].map((w) => (
                        <option key={w} value={w}>
                          {WEEKDAYS[w]}
                        </option>
                      ))}
                    </select>
                    <input className="input !w-28" type="time" value={fmtTime(d.start_time)} onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, start_time: e.target.value } : x)))} required />
                    <span className="text-zinc-400">a</span>
                    <input className="input !w-28" type="time" value={fmtTime(d.end_time)} onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, end_time: e.target.value } : x)))} required />
                    <input className="input !w-32" placeholder="Salón" value={d.room ?? ''} onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, room: e.target.value } : x)))} />
                    <button type="button" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))} className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600" aria-label="Quitar horario">
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() => {
                  const last = drafts.at(-1)
                  setDrafts([...drafts, { weekday: last ? Math.min(last.weekday + 1, 7) : 1, start_time: last?.start_time ?? '19:00', end_time: last?.end_time ?? '20:00', room: last?.room ?? '' }])
                }}
              >
                <Plus className="size-3.5" /> Agregar horario
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
