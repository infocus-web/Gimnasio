import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Plan } from '../../lib/types'
import { fmtMoney } from '../../lib/format'
import { Badge, Button, Card, Empty, Field, Loading, Modal, PageHeader, confirmDelete, errorText, useToast } from '../../components/ui'

const EMPTY: Omit<Plan, 'id'> = { name: '', description: '', price: 0, duration_days: 30, active: true, show_public: true, sort: 0 }

export function Plans() {
  const toast = useToast()
  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [edit, setEdit] = useState<Partial<Plan> | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('plans').select('*').order('sort').order('name')
    setPlans((data as Plan[]) ?? [])
  }, [])
  useEffect(() => {
    load()
  }, [load])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!edit) return
    setBusy(true)
    const { id, ...rest } = edit
    const payload = { ...rest, price: Number(rest.price), duration_days: Number(rest.duration_days), sort: Number(rest.sort ?? 0) }
    const { error } = id ? await supabase.from('plans').update(payload).eq('id', id) : await supabase.from('plans').insert(payload)
    setBusy(false)
    if (error) return toast(errorText(error), 'error')
    toast('Plan guardado')
    setEdit(null)
    load()
  }

  async function remove(p: Plan) {
    if (!confirmDelete(`el plan "${p.name}"`)) return
    const { error } = await supabase.from('plans').delete().eq('id', p.id)
    if (error) return toast(errorText(error), 'error')
    load()
  }

  return (
    <div>
      <PageHeader
        title="Planes"
        subtitle="Precios y duración de las cuotas. Los visibles aparecen en la web pública."
        actions={
          <Button onClick={() => setEdit({ ...EMPTY, sort: (plans?.length ?? 0) + 1 })}>
            <Plus className="size-4" /> Nuevo plan
          </Button>
        }
      />
      {!plans ? (
        <Loading />
      ) : plans.length === 0 ? (
        <Empty icon={<Tags className="size-10" />} title="No hay planes" action={<Button onClick={() => setEdit({ ...EMPTY })}>Crear plan</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <Card key={p.id} className={`p-5 ${p.active ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-xl font-bold uppercase">{p.name}</h3>
                <div className="flex gap-1">
                  <button onClick={() => setEdit(p)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800" aria-label="Editar">
                    <Pencil className="size-4" />
                  </button>
                  <button onClick={() => remove(p)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600" aria-label="Borrar">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
              <p className="mt-2 font-display text-4xl font-bold tabular-nums">{fmtMoney(p.price)}</p>
              <p className="text-sm text-zinc-500">cada {p.duration_days} días</p>
              {p.description && <p className="mt-3 text-sm text-zinc-600">{p.description}</p>}
              <div className="mt-4 flex gap-1.5">
                {!p.active && <Badge>Inactivo</Badge>}
                {p.active && p.show_public && <Badge className="bg-brand-100 text-brand-700">Visible en la web</Badge>}
                {p.active && !p.show_public && <Badge>Solo interno</Badge>}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? 'Editar plan' : 'Nuevo plan'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>
              Cancelar
            </Button>
            <Button type="submit" form="plan-form" loading={busy}>
              Guardar
            </Button>
          </>
        }
      >
        {edit && (
          <form id="plan-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" className="sm:col-span-2">
              <input className="input" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required autoFocus />
            </Field>
            <Field label="Precio">
              <input className="input" type="number" min={0} value={edit.price ?? 0} onChange={(e) => setEdit({ ...edit, price: Number(e.target.value) })} required />
            </Field>
            <Field label="Duración (días)" hint="30 = mensual, 90 = trimestral">
              <input className="input" type="number" min={1} value={edit.duration_days ?? 30} onChange={(e) => setEdit({ ...edit, duration_days: Number(e.target.value) })} required />
            </Field>
            <Field label="Descripción" className="sm:col-span-2">
              <textarea className="input" rows={2} value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            </Field>
            <Field label="Orden">
              <input className="input" type="number" value={edit.sort ?? 0} onChange={(e) => setEdit({ ...edit, sort: Number(e.target.value) })} />
            </Field>
            <div className="flex flex-col justify-end gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="size-4 accent-lime-500" checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />
                Activo
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="size-4 accent-lime-500" checked={edit.show_public ?? true} onChange={(e) => setEdit({ ...edit, show_public: e.target.checked })} />
                Mostrar en la web
              </label>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
