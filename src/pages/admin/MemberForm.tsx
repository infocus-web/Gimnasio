import { useEffect, useState, type FormEvent } from 'react'
import { Camera } from 'lucide-react'
import { supabase, uploadMedia } from '../../lib/supabase'
import type { Member, Plan } from '../../lib/types'
import { fmtMoney } from '../../lib/format'
import { Avatar, Button, Field, Modal, errorText, useToast } from '../../components/ui'

const EMPTY = {
  first_name: '',
  last_name: '',
  dni: '',
  email: '',
  phone: '',
  birth_date: '',
  address: '',
  emergency_contact: '',
  medical_notes: '',
  notes: '',
  photo_url: '' as string | null,
  plan_id: '' as string | null,
}

export function MemberForm({
  open,
  member,
  onClose,
  onSaved,
}: {
  open: boolean
  member?: Member | null
  onClose: () => void
  onSaved: (m: Member, isNew: boolean) => void
}) {
  const toast = useToast()
  const [form, setForm] = useState(EMPTY)
  const [plans, setPlans] = useState<Plan[]>([])
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!open) return
    supabase
      .from('plans')
      .select('*')
      .eq('active', true)
      .order('sort')
      .then(({ data }) => setPlans((data as Plan[]) ?? []))
    if (member) {
      setForm({
        ...EMPTY,
        ...Object.fromEntries(Object.entries(member).filter(([k]) => k in EMPTY).map(([k, v]) => [k, v ?? ''])),
      } as typeof EMPTY)
    } else setForm(EMPTY)
  }, [open, member])

  // Al crear un socio se preselecciona el primer plan
  useEffect(() => {
    if (open && !member && !form.plan_id && plans[0]) setForm((f) => ({ ...f, plan_id: plans[0].id }))
  }, [plans, open, member, form.plan_id])

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function onPhoto(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadMedia(file, 'socios')
      setForm((f) => ({ ...f, photo_url: url }))
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setUploading(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const payload = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, typeof v === 'string' ? v.trim() || null : v]),
    ) as Record<string, string | null>
    payload.first_name = payload.first_name ?? ''
    payload.last_name = payload.last_name ?? ''
    try {
      const q = member
        ? supabase.from('members').update(payload).eq('id', member.id).select().single()
        : supabase.from('members').insert(payload).select().single()
      const { data, error } = await q
      if (error) throw error
      toast(member ? 'Datos actualizados' : 'Socio creado')
      onSaved(data as Member, !member)
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={member ? 'Editar socio' : 'Nuevo socio'}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="member-form" loading={busy}>
            {member ? 'Guardar cambios' : 'Crear socio'}
          </Button>
        </>
      }
    >
      <form id="member-form" onSubmit={submit} className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar member={{ first_name: form.first_name || '?', last_name: form.last_name, photo_url: form.photo_url || null }} size={72} />
          <label className="cursor-pointer">
            <span className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50">
              <Camera className="size-4" /> {uploading ? 'Subiendo…' : form.photo_url ? 'Cambiar foto' : 'Sacar / subir foto'}
            </span>
            <input type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
          {form.photo_url && (
            <button type="button" className="text-xs text-zinc-500 hover:text-red-600" onClick={() => setForm((f) => ({ ...f, photo_url: '' }))}>
              Quitar
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre *">
            <input className="input" value={form.first_name} onChange={set('first_name')} required autoFocus />
          </Field>
          <Field label="Apellido *">
            <input className="input" value={form.last_name} onChange={set('last_name')} required />
          </Field>
          <Field label="DNI">
            <input className="input" inputMode="numeric" value={form.dni ?? ''} onChange={set('dni')} />
          </Field>
          <Field label="Fecha de nacimiento">
            <input className="input" type="date" value={form.birth_date ?? ''} onChange={set('birth_date')} />
          </Field>
          <Field label="Email" hint="Para enviarle su QR, comprobantes y avisos de vencimiento">
            <input className="input" type="email" value={form.email ?? ''} onChange={set('email')} />
          </Field>
          <Field label="Teléfono / WhatsApp">
            <input className="input" type="tel" value={form.phone ?? ''} onChange={set('phone')} placeholder="11 2345 6789" />
          </Field>
          <Field label="Plan">
            <select className="input" value={form.plan_id ?? ''} onChange={set('plan_id')}>
              <option value="">Sin plan</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {fmtMoney(p.price)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Dirección">
            <input className="input" value={form.address ?? ''} onChange={set('address')} />
          </Field>
          <Field label="Contacto de emergencia" className="sm:col-span-2">
            <input className="input" value={form.emergency_contact ?? ''} onChange={set('emergency_contact')} placeholder="Nombre y teléfono" />
          </Field>
          <Field label="Salud / apto físico" className="sm:col-span-2" hint="Lesiones, patologías, vencimiento del apto médico. Se muestra en recepción.">
            <textarea className="input" rows={2} value={form.medical_notes ?? ''} onChange={set('medical_notes')} />
          </Field>
          <Field label="Notas internas" className="sm:col-span-2">
            <textarea className="input" rows={2} value={form.notes ?? ''} onChange={set('notes')} />
          </Field>
        </div>
      </form>
    </Modal>
  )
}
