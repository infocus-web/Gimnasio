import { useEffect, useState, type FormEvent } from 'react'
import { Mail, Upload } from 'lucide-react'
import { supabase, uploadMedia, callApi } from '../../lib/supabase'
import type { Profile, Role, Settings as SettingsT } from '../../lib/types'
import { useAuth, useSettings } from '../../lib/auth'
import { fmtDate } from '../../lib/format'
import { Badge, Button, Card, Field, Loading, PageHeader, errorText, useToast } from '../../components/ui'

export function Settings() {
  const toast = useToast()
  const { settings, reload } = useSettings()
  const { isAdmin, profile } = useAuth()
  const [form, setForm] = useState<SettingsT | null>(null)
  const [busy, setBusy] = useState(false)
  const [users, setUsers] = useState<Profile[]>([])
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .order('created_at')
      .then(({ data }) => setUsers((data as Profile[]) ?? []))
  }, [])

  if (!form) return <Loading />

  const set = (k: keyof SettingsT) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { id: _id, ...rest } = form!
    const { error } = await supabase
      .from('settings')
      .update({ ...rest, grace_days: Number(rest.grace_days), reminder_days: Number(rest.reminder_days) })
      .eq('id', 1)
    setBusy(false)
    if (error) return toast(errorText(error), 'error')
    toast('Configuración guardada')
    reload()
  }

  async function upload(file: File | undefined, field: 'logo_url' | 'hero_url') {
    if (!file) return
    try {
      const url = await uploadMedia(file, 'web')
      setForm((f) => (f ? { ...f, [field]: url } : f))
    } catch (err) {
      toast(errorText(err), 'error')
    }
  }

  async function setRole(u: Profile, role: Role) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', u.id)
    if (error) return toast(errorText(error), 'error')
    setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, role } : x)))
    toast('Permisos actualizados')
  }

  async function testEmail() {
    setTesting(true)
    try {
      await callApi('/api/email', { type: 'test' })
      toast(`Email de prueba enviado a ${profile?.email}`)
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div>
      <PageHeader title="Configuración" />
      <form onSubmit={save} className="space-y-6">
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Datos del gimnasio</h2>
          <fieldset disabled={!isAdmin} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre">
              <input className="input" value={form.gym_name} onChange={set('gym_name')} required />
            </Field>
            <Field label="Frase / slogan">
              <input className="input" value={form.tagline ?? ''} onChange={set('tagline')} />
            </Field>
            <Field label="Dirección">
              <input className="input" value={form.address ?? ''} onChange={set('address')} />
            </Field>
            <Field label="Horario de atención">
              <input className="input" value={form.opening_hours ?? ''} onChange={set('opening_hours')} />
            </Field>
            <Field label="Teléfono">
              <input className="input" value={form.phone ?? ''} onChange={set('phone')} />
            </Field>
            <Field label="WhatsApp" hint="Con código de área, ej: 11 2345 6789">
              <input className="input" value={form.whatsapp ?? ''} onChange={set('whatsapp')} />
            </Field>
            <Field label="Email de contacto">
              <input className="input" type="email" value={form.email ?? ''} onChange={set('email')} />
            </Field>
            <Field label="Instagram" hint="Solo el usuario, sin @">
              <input className="input" value={form.instagram ?? ''} onChange={set('instagram')} />
            </Field>
            <Field label="Logo">
              <div className="flex items-center gap-3">
                {form.logo_url && <img src={form.logo_url} alt="" className="size-12 rounded-lg object-cover" />}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50">
                  <Upload className="size-4" /> Subir logo
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0], 'logo_url')} />
                </label>
              </div>
            </Field>
            <Field label="Foto de portada (web)">
              <div className="flex items-center gap-3">
                {form.hero_url && <img src={form.hero_url} alt="" className="h-12 w-20 rounded-lg object-cover" />}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50">
                  <Upload className="size-4" /> Subir foto
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0], 'hero_url')} />
                </label>
              </div>
            </Field>
          </fieldset>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Cuotas y avisos</h2>
          <fieldset disabled={!isAdmin} className="grid gap-4 sm:grid-cols-2">
            <Field label="Días de tolerancia" hint="Después de vencer, puede seguir entrando esta cantidad de días (se avisa en recepción).">
              <input className="input" type="number" min={0} max={30} value={form.grace_days} onChange={set('grace_days')} />
            </Field>
            <Field label="Aviso de vencimiento" hint="Se envía un email automático esta cantidad de días antes de vencer.">
              <input className="input" type="number" min={0} max={30} value={form.reminder_days} onChange={set('reminder_days')} />
            </Field>
          </fieldset>
          <div className="mt-4 flex items-center gap-3 border-t border-zinc-100 pt-4">
            <Button type="button" variant="secondary" size="sm" onClick={testEmail} loading={testing}>
              <Mail className="size-4" /> Probar envío de emails
            </Button>
            <p className="text-xs text-zinc-500">Envía un email de prueba a tu casilla para confirmar que Resend está bien configurado.</p>
          </div>
        </Card>

        {isAdmin && (
          <div className="flex justify-end">
            <Button type="submit" loading={busy}>
              Guardar configuración
            </Button>
          </div>
        )}
      </form>

      <Card className="mt-6">
        <div className="px-5 pt-5">
          <h2 className="font-semibold">Usuarios del sistema</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Para sumar a alguien del staff: que entre a <b>{window.location.origin}/login</b> y toque “Crear cuenta de staff”. Después lo habilitás acá.
          </p>
        </div>
        <ul className="mt-3 divide-y divide-zinc-100">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{u.full_name || u.email}</p>
                <p className="truncate text-xs text-zinc-500">
                  {u.email} · desde {fmtDate(u.created_at)}
                </p>
              </div>
              {u.role === 'pending' && <Badge className="bg-amber-100 text-amber-800">Pendiente</Badge>}
              {isAdmin && u.id !== profile?.id ? (
                <select className="input !w-auto" value={u.role} onChange={(e) => setRole(u, e.target.value as Role)}>
                  <option value="pending">Sin acceso</option>
                  <option value="staff">Staff (recepción, socios, pagos)</option>
                  <option value="admin">Administrador (todo)</option>
                </select>
              ) : (
                <Badge>{u.role === 'admin' ? 'Administrador' : u.role === 'staff' ? 'Staff' : 'Sin acceso'}</Badge>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
