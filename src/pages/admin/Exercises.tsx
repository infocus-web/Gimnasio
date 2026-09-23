import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Dumbbell, Film, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react'
import { supabase, uploadMedia } from '../../lib/supabase'
import type { Exercise } from '../../lib/types'
import { MUSCLE_GROUPS } from '../../lib/format'
import { Button, Card, Empty, Field, Loading, Modal, PageHeader, confirmDelete, cx, errorText, useToast } from '../../components/ui'
import { VideoPlayer, videoThumb } from '../../components/VideoPlayer'

const EMPTY: Partial<Exercise> = { name: '', muscle_group: '', equipment: '', description: '', video_url: '', thumbnail_url: '' }

export function Exercises() {
  const toast = useToast()
  const [list, setList] = useState<Exercise[] | null>(null)
  const [group, setGroup] = useState('Todos')
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Partial<Exercise> | null>(null)
  const [view, setView] = useState<Exercise | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('exercises').select('*').order('muscle_group').order('name')
    setList((data as Exercise[]) ?? [])
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const groups = useMemo(() => {
    const set = new Set<string>(MUSCLE_GROUPS)
    list?.forEach((e) => e.muscle_group && set.add(e.muscle_group))
    return ['Todos', ...Array.from(set)]
  }, [list])

  const filtered = (list ?? []).filter(
    (e) => (group === 'Todos' || e.muscle_group === group) && (!q || e.name.toLowerCase().includes(q.toLowerCase())),
  )

  async function upload(file: File | undefined, field: 'video_url' | 'thumbnail_url') {
    if (!file || !edit) return
    if (field === 'video_url' && file.size > 200 * 1024 * 1024) {
      toast('El video pesa más de 200 MB. Subilo a YouTube como "no listado" y pegá el link.', 'error')
      return
    }
    setUploading(field)
    try {
      const url = await uploadMedia(file, field === 'video_url' ? 'videos' : 'miniaturas')
      setEdit((e) => ({ ...e, [field]: url }))
    } catch (err) {
      toast(`No se pudo subir: ${errorText(err)}`, 'error')
    } finally {
      setUploading(null)
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!edit) return
    setBusy(true)
    const { id, ...rest } = edit
    const payload = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, typeof v === 'string' ? v.trim() || null : v]))
    const { error } = id ? await supabase.from('exercises').update(payload).eq('id', id) : await supabase.from('exercises').insert(payload)
    setBusy(false)
    if (error) return toast(errorText(error), 'error')
    toast('Ejercicio guardado')
    setEdit(null)
    load()
  }

  async function remove(ex: Exercise) {
    if (!confirmDelete(`"${ex.name}" (también se quita de las rutinas que lo usan)`)) return
    const { error } = await supabase.from('exercises').delete().eq('id', ex.id)
    if (error) return toast(errorText(error), 'error')
    setView(null)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Ejercicios y videos"
        subtitle="Biblioteca de ejercicios con video explicativo. Se usan para armar las rutinas."
        actions={
          <Button onClick={() => setEdit({ ...EMPTY, muscle_group: group !== 'Todos' ? group : '' })}>
            <Plus className="size-4" /> Nuevo ejercicio
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <input className="input pl-9" placeholder="Buscar ejercicio" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {groups.map((g) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className={cx(
                'rounded-full border px-3 py-1 text-xs font-semibold transition',
                group === g ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400',
              )}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {!list ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <Empty icon={<Dumbbell className="size-10" />} title="No hay ejercicios acá" action={<Button onClick={() => setEdit({ ...EMPTY })}>Agregar ejercicio</Button>} />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {filtered.map((ex) => {
            const thumb = videoThumb(ex.video_url, ex.thumbnail_url)
            return (
              <Card key={ex.id} className="group overflow-hidden">
                <button onClick={() => setView(ex)} className="relative block aspect-video w-full bg-zinc-900 text-left">
                  {thumb ? (
                    <img src={thumb} alt="" className="size-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-zinc-600">
                      {ex.video_url ? <Film className="size-8 text-brand-400" /> : <Dumbbell className="size-8" />}
                    </div>
                  )}
                  {ex.video_url && (
                    <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-400">Video</span>
                  )}
                </button>
                <div className="flex items-start gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{ex.name}</p>
                    <p className="truncate text-xs text-zinc-500">{[ex.muscle_group, ex.equipment].filter(Boolean).join(' · ') || '—'}</p>
                  </div>
                  <button onClick={() => setEdit(ex)} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800" aria-label="Editar">
                    <Pencil className="size-3.5" />
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={!!view} onClose={() => setView(null)} title={view?.name ?? ''} wide>
        {view && (
          <div className="space-y-4">
            {view.video_url ? (
              <VideoPlayer url={view.video_url} poster={view.thumbnail_url} title={view.name} />
            ) : (
              <p className="rounded-xl bg-zinc-100 p-6 text-center text-sm text-zinc-500">Este ejercicio todavía no tiene video.</p>
            )}
            <p className="text-sm text-zinc-500">{[view.muscle_group, view.equipment].filter(Boolean).join(' · ')}</p>
            {view.description && <p className="whitespace-pre-wrap text-sm">{view.description}</p>}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => (setEdit(view), setView(null))}>
                <Pencil className="size-4" /> Editar
              </Button>
              <Button variant="ghost" className="text-red-600" onClick={() => remove(view)}>
                <Trash2 className="size-4" /> Borrar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? 'Editar ejercicio' : 'Nuevo ejercicio'}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>
              Cancelar
            </Button>
            <Button type="submit" form="ex-form" loading={busy} disabled={!!uploading}>
              Guardar
            </Button>
          </>
        }
      >
        {edit && (
          <form id="ex-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" className="sm:col-span-2">
              <input className="input" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required autoFocus />
            </Field>
            <Field label="Grupo muscular">
              <input className="input" list="groups" value={edit.muscle_group ?? ''} onChange={(e) => setEdit({ ...edit, muscle_group: e.target.value })} />
              <datalist id="groups">
                {MUSCLE_GROUPS.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </Field>
            <Field label="Elemento">
              <input className="input" value={edit.equipment ?? ''} onChange={(e) => setEdit({ ...edit, equipment: e.target.value })} placeholder="Barra, mancuernas, máquina…" />
            </Field>
            <Field label="Explicación / técnica" className="sm:col-span-2">
              <textarea className="input" rows={3} value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            </Field>
            <Field label="Video" className="sm:col-span-2" hint="Pegá un link de YouTube (puede ser 'no listado') o Vimeo, o subí un archivo corto (hasta 200 MB).">
              <div className="flex gap-2">
                <input
                  className="input"
                  value={edit.video_url ?? ''}
                  onChange={(e) => setEdit({ ...edit, video_url: e.target.value })}
                  placeholder="https://youtu.be/…"
                />
                <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 px-3 text-sm hover:bg-zinc-50">
                  <Upload className="size-4" /> {uploading === 'video_url' ? 'Subiendo…' : 'Subir'}
                  <input type="file" accept="video/*" className="hidden" onChange={(e) => upload(e.target.files?.[0], 'video_url')} />
                </label>
              </div>
            </Field>
            {edit.video_url && (
              <div className="sm:col-span-2">
                <VideoPlayer url={edit.video_url} poster={edit.thumbnail_url} />
              </div>
            )}
            <Field label="Miniatura (opcional)" className="sm:col-span-2" hint="Para videos subidos. Los de YouTube ya traen la suya.">
              <div className="flex items-center gap-3">
                {edit.thumbnail_url && <img src={edit.thumbnail_url} alt="" className="h-12 rounded object-cover" />}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50">
                  <Upload className="size-4" /> {uploading === 'thumbnail_url' ? 'Subiendo…' : 'Subir imagen'}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0], 'thumbnail_url')} />
                </label>
              </div>
            </Field>
          </form>
        )}
      </Modal>
    </div>
  )
}
