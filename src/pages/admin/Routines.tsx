import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowUp, Copy, Film, ListChecks, Plus, Search, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Exercise, Routine, RoutineItem } from '../../lib/types'
import { Badge, Button, Card, Empty, Field, Loading, Modal, PageHeader, confirmDelete, cx, errorText, useToast } from '../../components/ui'

type RoutineRow = Routine & { routine_items: { count: number }[]; member_routines: { count: number }[] }

export function Routines() {
  const toast = useToast()
  const navigate = useNavigate()
  const [list, setList] = useState<RoutineRow[] | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('routines')
      .select('*, routine_items(count), member_routines(count)')
      .eq('member_routines.active', true)
      .order('name')
    if (error) toast(errorText(error), 'error')
    setList((data as RoutineRow[]) ?? [])
  }, [toast])
  useEffect(() => {
    load()
  }, [load])

  async function duplicate(r: Routine) {
    const { data: copy, error } = await supabase
      .from('routines')
      .insert({ name: `${r.name} (copia)`, description: r.description, goal: r.goal, level: r.level, days_per_week: r.days_per_week })
      .select()
      .single()
    if (error) return toast(errorText(error), 'error')
    const { data: items } = await supabase.from('routine_items').select('*').eq('routine_id', r.id)
    if (items?.length) {
      await supabase.from('routine_items').insert(
        (items as RoutineItem[]).map(({ id: _id, routine_id: _r, ...rest }) => ({ ...rest, routine_id: (copy as Routine).id })),
      )
    }
    navigate(`/admin/rutinas/${(copy as Routine).id}`)
  }

  return (
    <div>
      <PageHeader
        title="Rutinas"
        subtitle="Armá rutinas con los ejercicios de la biblioteca y asignalas a cada socio."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Nueva rutina
          </Button>
        }
      />
      {!list ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty icon={<ListChecks className="size-10" />} title="Todavía no hay rutinas" action={<Button onClick={() => setCreating(true)}>Crear rutina</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r) => (
            <Card key={r.id} className="flex flex-col p-5">
              <Link to={`/admin/rutinas/${r.id}`} className="flex-1">
                <h3 className="font-display text-xl font-bold uppercase hover:underline">{r.name}</h3>
                {r.goal && <p className="text-sm text-zinc-500">{r.goal}</p>}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge className="capitalize">{r.level}</Badge>
                  {r.days_per_week && <Badge>{r.days_per_week} días/semana</Badge>}
                  <Badge>{r.routine_items[0]?.count ?? 0} ejercicios</Badge>
                  <Badge className="bg-brand-100 text-brand-700">{r.member_routines[0]?.count ?? 0} socios</Badge>
                </div>
              </Link>
              <div className="mt-4 flex gap-2 border-t border-zinc-100 pt-3">
                <Link to={`/admin/rutinas/${r.id}`}>
                  <Button size="sm" variant="secondary">
                    Editar
                  </Button>
                </Link>
                <Button size="sm" variant="ghost" onClick={() => duplicate(r)}>
                  <Copy className="size-3.5" /> Duplicar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <RoutineInfoModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(r) => {
          setCreating(false)
          navigate(`/admin/rutinas/${r.id}`)
        }}
      />
    </div>
  )
}

function RoutineInfoModal({ open, routine, onClose, onSaved }: { open: boolean; routine?: Routine; onClose: () => void; onSaved: (r: Routine) => void }) {
  const toast = useToast()
  const [form, setForm] = useState<Partial<Routine>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setForm(routine ?? { name: '', goal: '', description: '', level: 'principiante', days_per_week: 3 })
  }, [open, routine])

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const payload = { name: form.name, goal: form.goal || null, description: form.description || null, level: form.level, days_per_week: Number(form.days_per_week) || null }
    const res = routine
      ? await supabase.from('routines').update(payload).eq('id', routine.id).select().single()
      : await supabase.from('routines').insert(payload).select().single()
    setBusy(false)
    if (res.error) return toast(errorText(res.error), 'error')
    onSaved(res.data as Routine)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={routine ? 'Datos de la rutina' : 'Nueva rutina'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="routine-form" loading={busy}>
            {routine ? 'Guardar' : 'Crear y agregar ejercicios'}
          </Button>
        </>
      }
    >
      <form id="routine-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" className="sm:col-span-2">
          <input className="input" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
        </Field>
        <Field label="Objetivo" className="sm:col-span-2">
          <input className="input" value={form.goal ?? ''} onChange={(e) => setForm({ ...form, goal: e.target.value })} placeholder="Hipertrofia, bajar de peso, tonificar…" />
        </Field>
        <Field label="Nivel">
          <select className="input" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as Routine['level'] })}>
            <option value="principiante">Principiante</option>
            <option value="intermedio">Intermedio</option>
            <option value="avanzado">Avanzado</option>
          </select>
        </Field>
        <Field label="Días por semana">
          <input className="input" type="number" min={1} max={7} value={form.days_per_week ?? 3} onChange={(e) => setForm({ ...form, days_per_week: Number(e.target.value) })} />
        </Field>
        <Field label="Indicaciones generales" className="sm:col-span-2">
          <textarea className="input" rows={3} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Entrada en calor, cardio final, etc." />
        </Field>
      </form>
    </Modal>
  )
}

export function RoutineEditor() {
  const { id } = useParams<{ id: string }>()
  const toast = useToast()
  const navigate = useNavigate()
  const [routine, setRoutine] = useState<Routine | null>(null)
  const [items, setItems] = useState<RoutineItem[]>([])
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [day, setDay] = useState(1)
  const [picking, setPicking] = useState(false)
  const [editingInfo, setEditingInfo] = useState(false)

  const load = useCallback(async () => {
    const [r, it] = await Promise.all([
      supabase.from('routines').select('*').eq('id', id!).maybeSingle(),
      supabase.from('routine_items').select('*').eq('routine_id', id!).order('day').order('position'),
    ])
    setRoutine(r.data as Routine)
    setItems((it.data as RoutineItem[]) ?? [])
  }, [id])

  useEffect(() => {
    load()
    supabase
      .from('exercises')
      .select('*')
      .order('name')
      .then(({ data }) => setExercises((data as Exercise[]) ?? []))
  }, [load])

  const exById = useMemo(() => Object.fromEntries(exercises.map((e) => [e.id, e])), [exercises])
  const maxDay = Math.max(routine?.days_per_week ?? 1, ...items.map((i) => i.day), 1)
  const dayItems = items.filter((i) => i.day === day).sort((a, b) => a.position - b.position)

  async function addExercise(ex: Exercise) {
    const position = (dayItems.at(-1)?.position ?? 0) + 1
    const { data, error } = await supabase
      .from('routine_items')
      .insert({ routine_id: id, day, exercise_id: ex.id, sets: 3, reps: '12', rest_seconds: 60, position })
      .select()
      .single()
    if (error) return toast(errorText(error), 'error')
    setItems((list) => [...list, data as RoutineItem])
    toast(`${ex.name} agregado al día ${day}`)
  }

  async function updateItem(item: RoutineItem, patch: Partial<RoutineItem>) {
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, ...patch } : i)))
    const { error } = await supabase.from('routine_items').update(patch).eq('id', item.id)
    if (error) toast(errorText(error), 'error')
  }

  async function removeItem(item: RoutineItem) {
    setItems((list) => list.filter((i) => i.id !== item.id))
    await supabase.from('routine_items').delete().eq('id', item.id)
  }

  async function move(item: RoutineItem, dir: -1 | 1) {
    const idx = dayItems.findIndex((i) => i.id === item.id)
    const other = dayItems[idx + dir]
    if (!other) return
    await Promise.all([updateItem(item, { position: other.position }), updateItem(other, { position: item.position })])
  }

  async function removeRoutine() {
    if (!confirmDelete(`la rutina "${routine?.name}" (se quita a los socios que la tienen)`)) return
    const { error } = await supabase.from('routines').delete().eq('id', id!)
    if (error) return toast(errorText(error), 'error')
    navigate('/admin/rutinas')
  }

  if (!routine) return <Loading />

  return (
    <div>
      <Link to="/admin/rutinas" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="size-4" /> Rutinas
      </Link>
      <PageHeader
        title={routine.name}
        subtitle={[routine.goal, routine.level, routine.days_per_week && `${routine.days_per_week} días por semana`].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditingInfo(true)}>
              Editar datos
            </Button>
            <Button variant="ghost" className="text-red-600" onClick={removeRoutine}>
              <Trash2 className="size-4" />
            </Button>
          </>
        }
      />
      {routine.description && <p className="-mt-3 mb-5 max-w-2xl whitespace-pre-wrap text-sm text-zinc-600">{routine.description}</p>}

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
          <button
            key={d}
            onClick={() => setDay(d)}
            className={cx(
              'rounded-lg px-4 py-2 text-sm font-semibold transition',
              day === d ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:ring-zinc-300',
            )}
          >
            Día {d} <span className="text-xs opacity-60">({items.filter((i) => i.day === d).length})</span>
          </button>
        ))}
        {maxDay < 7 && (
          <button
            onClick={() => {
              supabase.from('routines').update({ days_per_week: maxDay + 1 }).eq('id', routine.id).then(() => {
                setRoutine({ ...routine, days_per_week: maxDay + 1 })
                setDay(maxDay + 1)
              })
            }}
            className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100"
          >
            + Día
          </button>
        )}
      </div>

      <Card>
        {dayItems.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">El día {day} todavía no tiene ejercicios.</div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {dayItems.map((it, idx) => {
              const ex = exById[it.exercise_id]
              return (
                <div key={it.id} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-brand-400">{idx + 1}</span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate font-medium">
                        {ex?.name ?? '…'} {ex?.video_url && <Film className="size-3.5 text-brand-600" />}
                      </p>
                      <p className="text-xs text-zinc-500">{ex?.muscle_group}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 md:w-[26rem]">
                    <label>
                      <span className="text-[10px] uppercase text-zinc-400">Series</span>
                      <input className="input !py-1" type="number" min={1} defaultValue={it.sets ?? ''} onBlur={(e) => updateItem(it, { sets: Number(e.target.value) || null })} />
                    </label>
                    <label>
                      <span className="text-[10px] uppercase text-zinc-400">Reps</span>
                      <input className="input !py-1" defaultValue={it.reps ?? ''} onBlur={(e) => updateItem(it, { reps: e.target.value || null })} />
                    </label>
                    <label>
                      <span className="text-[10px] uppercase text-zinc-400">Pausa (s)</span>
                      <input className="input !py-1" type="number" min={0} step={15} defaultValue={it.rest_seconds ?? ''} onBlur={(e) => updateItem(it, { rest_seconds: Number(e.target.value) || null })} />
                    </label>
                    <label>
                      <span className="text-[10px] uppercase text-zinc-400">Nota</span>
                      <input className="input !py-1" defaultValue={it.notes ?? ''} placeholder="—" onBlur={(e) => updateItem(it, { notes: e.target.value || null })} />
                    </label>
                  </div>
                  <div className="flex gap-0.5 self-end md:self-center">
                    <button disabled={idx === 0} onClick={() => move(it, -1)} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 disabled:opacity-30" aria-label="Subir">
                      <ArrowUp className="size-4" />
                    </button>
                    <button disabled={idx === dayItems.length - 1} onClick={() => move(it, 1)} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 disabled:opacity-30" aria-label="Bajar">
                      <ArrowDown className="size-4" />
                    </button>
                    <button onClick={() => removeItem(it)} className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600" aria-label="Quitar">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div className="border-t border-zinc-100 p-3">
          <Button variant="secondary" onClick={() => setPicking(true)}>
            <Plus className="size-4" /> Agregar ejercicio al día {day}
          </Button>
        </div>
      </Card>

      <ExercisePicker open={picking} exercises={exercises} onClose={() => setPicking(false)} onPick={addExercise} />
      <RoutineInfoModal
        open={editingInfo}
        routine={routine}
        onClose={() => setEditingInfo(false)}
        onSaved={(r) => {
          setRoutine(r)
          setEditingInfo(false)
        }}
      />
    </div>
  )
}

function ExercisePicker({ open, exercises, onClose, onPick }: { open: boolean; exercises: Exercise[]; onClose: () => void; onPick: (e: Exercise) => void }) {
  const [q, setQ] = useState('')
  const groups = useMemo(() => {
    const filtered = exercises.filter((e) => !q || `${e.name} ${e.muscle_group}`.toLowerCase().includes(q.toLowerCase()))
    const map = new Map<string, Exercise[]>()
    filtered.forEach((e) => {
      const g = e.muscle_group || 'Otros'
      map.set(g, [...(map.get(g) ?? []), e])
    })
    return Array.from(map.entries())
  }, [exercises, q])
  return (
    <Modal open={open} onClose={onClose} title="Agregar ejercicio" footer={<Button onClick={onClose}>Listo</Button>}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
        <input className="input pl-9" autoFocus placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="mt-3 max-h-[50vh] space-y-4 overflow-y-auto">
        {groups.map(([g, list]) => (
          <div key={g}>
            <p className="label">{g}</p>
            <div className="flex flex-wrap gap-1.5">
              {list.map((e) => (
                <button key={e.id} onClick={() => onPick(e)} className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm hover:border-brand-500 hover:bg-brand-50">
                  {e.name}
                </button>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="py-6 text-center text-sm text-zinc-400">
            No hay ejercicios. <Link to="/admin/ejercicios" className="underline">Cargalos acá</Link>.
          </p>
        )}
      </div>
    </Modal>
  )
}
