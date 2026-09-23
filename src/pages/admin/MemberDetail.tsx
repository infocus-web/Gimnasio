import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  CreditCard,
  IdCard,
  Link2,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  Printer,
  ScanLine,
  Trash2,
  XCircle,
} from 'lucide-react'
import { supabase, callApi } from '../../lib/supabase'
import type { Checkin, MemberView, Payment, Routine } from '../../lib/types'
import { METHOD_LABEL, daysLeftText, fmtDate, fmtDateTime, fmtMoney, whatsappLink } from '../../lib/format'
import { useAuth, useSettings } from '../../lib/auth'
import { Avatar, Badge, Button, Card, Empty, Loading, Modal, StatusBadge, confirmDelete, cx, errorText, useToast } from '../../components/ui'
import { QrImage } from '../../components/QrImage'
import { MemberForm } from './MemberForm'
import { PaymentModal } from './PaymentModal'

type Tab = 'pagos' | 'ingresos' | 'rutina' | 'datos'
interface Assigned {
  id: string
  routine_id: string
  assigned_at: string
  active: boolean
  notes: string | null
  routines: { name: string; level: string } | null
}

export function MemberDetail() {
  const { id } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { isAdmin } = useAuth()
  const { settings } = useSettings()
  const [m, setM] = useState<MemberView | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [checkins, setCheckins] = useState<Checkin[]>([])
  const [assigned, setAssigned] = useState<Assigned[]>([])
  const [routines, setRoutines] = useState<Routine[]>([])
  const [tab, setTab] = useState<Tab>('pagos')
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState(false)
  const [showCard, setShowCard] = useState(false)
  const [sending, setSending] = useState(false)
  const [newRoutine, setNewRoutine] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    const [mv, pay, chk, asg] = await Promise.all([
      supabase.from('members_view').select('*').eq('id', id).maybeSingle(),
      supabase.from('payments').select('*').eq('member_id', id).order('paid_at', { ascending: false }),
      supabase.from('checkins').select('*').eq('member_id', id).order('checked_at', { ascending: false }).limit(60),
      supabase.from('member_routines').select('*, routines(name, level)').eq('member_id', id).order('assigned_at', { ascending: false }),
    ])
    if (mv.error) toast(errorText(mv.error), 'error')
    setM((mv.data as MemberView) ?? null)
    setPayments((pay.data as Payment[]) ?? [])
    setCheckins((chk.data as Checkin[]) ?? [])
    setAssigned((asg.data as Assigned[]) ?? [])
  }, [id, toast])

  useEffect(() => {
    load()
    supabase
      .from('routines')
      .select('*')
      .order('name')
      .then(({ data }) => setRoutines((data as Routine[]) ?? []))
  }, [load])

  // recién creado: abre directamente el pago
  useEffect(() => {
    if (params.get('nuevo') === '1' && m) {
      setPaying(true)
      setParams({}, { replace: true })
    }
  }, [params, m, setParams])

  if (!m) return <Loading />

  const portalUrl = `${window.location.origin}/m/${m.portal_token}`
  const wa = whatsappLink(m.phone, `Hola ${m.first_name}! Este es tu acceso personal a ${settings?.gym_name ?? 'el gimnasio'}: tu QR para entrar, tu rutina y tus pagos 👉 ${portalUrl}`)

  async function sendWelcome() {
    setSending(true)
    try {
      await callApi('/api/email', { type: 'welcome', member_id: m!.id })
      toast(`Email enviado a ${m!.email}`)
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setSending(false)
    }
  }

  async function toggleActive() {
    const { error } = await supabase.from('members').update({ active: !m!.active }).eq('id', m!.id)
    if (error) return toast(errorText(error), 'error')
    toast(m!.active ? 'Socio dado de baja' : 'Socio reactivado')
    load()
  }

  async function remove() {
    if (!confirmDelete(`a ${m!.first_name} ${m!.last_name} con todos sus pagos e ingresos`)) return
    const { error } = await supabase.from('members').delete().eq('id', m!.id)
    if (error) return toast(errorText(error), 'error')
    toast('Socio borrado')
    navigate('/admin/socios')
  }

  async function deletePayment(p: Payment) {
    if (!confirmDelete(`el pago de ${fmtMoney(p.amount)} del ${fmtDate(p.paid_at)}`)) return
    const { error } = await supabase.from('payments').delete().eq('id', p.id)
    if (error) return toast(errorText(error), 'error')
    toast('Pago borrado. El vencimiento se recalculó.')
    load()
  }

  async function manualCheckin() {
    const { data, error } = await supabase.rpc('check_in', { p_member: m!.id, p_method: 'manual' })
    if (error) return toast(errorText(error), 'error')
    const r = data as { allowed: boolean; reason: string | null; duplicate: boolean }
    toast(r.duplicate ? 'Ya tenía un ingreso registrado hace instantes' : r.allowed ? 'Ingreso registrado' : `Ingreso rechazado: ${r.reason}`, r.allowed ? 'ok' : 'error')
    load()
  }

  async function assignRoutine() {
    if (!newRoutine) return
    // deja una sola rutina activa
    await supabase.from('member_routines').update({ active: false }).eq('member_id', m!.id).eq('active', true)
    const { error } = await supabase.from('member_routines').insert({ member_id: m!.id, routine_id: newRoutine })
    if (error) return toast(errorText(error), 'error')
    setNewRoutine('')
    toast('Rutina asignada. El socio la ve en su link personal.')
    load()
  }

  async function toggleRoutine(a: Assigned) {
    await supabase.from('member_routines').update({ active: !a.active }).eq('id', a.id)
    load()
  }

  return (
    <div>
      <Link to="/admin/socios" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="size-4" /> Socios
      </Link>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center">
          <Avatar member={m} size={88} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl font-bold uppercase">
                {m.first_name} {m.last_name}
              </h1>
              <StatusBadge status={m.status} />
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500">
              {m.dni && <span>DNI {m.dni}</span>}
              {m.plan_name && <span>{m.plan_name}</span>}
              <span>Socio desde {fmtDate(m.joined_at)}</span>
            </div>
            <p className={cx('mt-2 text-sm font-semibold', m.status === 'vencido' ? 'text-red-600' : m.status === 'por_vencer' ? 'text-amber-600' : 'text-emerald-700')}>
              {m.paid_until ? `Cuota paga hasta el ${fmtDate(m.paid_until)} · ${daysLeftText(m.days_left)}` : 'Todavía no registró pagos'}
            </p>
            {m.medical_notes && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800">⚕ {m.medical_notes}</p>}
          </div>
          <div className="flex flex-wrap gap-2 md:flex-col md:items-stretch">
            <Button onClick={() => setPaying(true)}>
              <CreditCard className="size-4" /> Registrar pago
            </Button>
            <Button variant="secondary" onClick={() => setShowCard(true)}>
              <IdCard className="size-4" /> QR / Carnet
            </Button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" /> Editar datos
          </Button>
          <Button size="sm" variant="ghost" onClick={manualCheckin}>
            <ScanLine className="size-3.5" /> Registrar entrada manual
          </Button>
          {m.email && (
            <Button size="sm" variant="ghost" onClick={sendWelcome} loading={sending}>
              <Mail className="size-3.5" /> Enviar QR y link por email
            </Button>
          )}
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer">
              <Button size="sm" variant="ghost">
                <MessageCircle className="size-3.5" /> Enviar link por WhatsApp
              </Button>
            </a>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigator.clipboard.writeText(portalUrl).then(() => toast('Link personal copiado'))}
          >
            <Link2 className="size-3.5" /> Copiar link personal
          </Button>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" onClick={toggleActive}>
            {m.active ? 'Dar de baja' : 'Reactivar'}
          </Button>
          {isAdmin && (
            <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={remove}>
              <Trash2 className="size-3.5" /> Borrar
            </Button>
          )}
        </div>
      </Card>

      <div className="mt-6 flex gap-1 border-b border-zinc-200">
        {(
          [
            ['pagos', `Pagos (${payments.length})`],
            ['ingresos', `Entradas (${checkins.length})`],
            ['rutina', 'Rutina'],
            ['datos', 'Datos'],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cx(
              '-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition',
              tab === t ? 'border-brand-500 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-800',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'pagos' &&
          (payments.length === 0 ? (
            <Empty title="Sin pagos" text="Registrá el primer pago para habilitar el ingreso." action={<Button onClick={() => setPaying(true)}>Registrar pago</Button>} />
          ) : (
            <Card className="divide-y divide-zinc-100">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1">
                    <p className="font-semibold tabular-nums">{fmtMoney(p.amount)}</p>
                    <p className="text-xs text-zinc-500">
                      {fmtDateTime(p.paid_at)} · {METHOD_LABEL[p.method]}
                      {p.notes && ` · ${p.notes}`}
                    </p>
                  </div>
                  <div className="text-right text-xs text-zinc-500">
                    <p>Período</p>
                    <p className="font-medium text-zinc-700">
                      {fmtDate(p.period_from)} → {fmtDate(p.period_to)}
                    </p>
                  </div>
                  {isAdmin && (
                    <button onClick={() => deletePayment(p)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600" title="Borrar pago">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </Card>
          ))}

        {tab === 'ingresos' &&
          (checkins.length === 0 ? (
            <Empty title="Sin entradas registradas" />
          ) : (
            <Card className="divide-y divide-zinc-100">
              {checkins.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  {c.allowed ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-red-500" />}
                  <span className="tabular-nums">{fmtDateTime(c.checked_at)}</span>
                  <Badge>{c.method.toUpperCase()}</Badge>
                  {c.reason && <span className="text-xs text-zinc-500">{c.reason}</span>}
                </div>
              ))}
            </Card>
          ))}

        {tab === 'rutina' && (
          <div className="space-y-4">
            <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
              <label className="flex-1">
                <span className="label">Asignar rutina</span>
                <select className="input" value={newRoutine} onChange={(e) => setNewRoutine(e.target.value)}>
                  <option value="">Elegí una rutina…</option>
                  {routines.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.level})
                    </option>
                  ))}
                </select>
              </label>
              <Button onClick={assignRoutine} disabled={!newRoutine}>
                <Plus className="size-4" /> Asignar
              </Button>
            </Card>
            {assigned.length === 0 ? (
              <Empty title="Sin rutina asignada" text="Las rutinas se arman en la sección Rutinas y el socio las ve con videos en su link personal." />
            ) : (
              <Card className="divide-y divide-zinc-100">
                {assigned.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex-1">
                      <Link to={`/admin/rutinas/${a.routine_id}`} className="font-medium hover:underline">
                        {a.routines?.name}
                      </Link>
                      <p className="text-xs text-zinc-500">Asignada el {fmtDate(a.assigned_at)}</p>
                    </div>
                    <Badge className={a.active ? 'bg-emerald-100 text-emerald-800' : ''}>{a.active ? 'Activa' : 'Anterior'}</Badge>
                    <Button size="sm" variant="ghost" onClick={() => toggleRoutine(a)}>
                      {a.active ? 'Desactivar' : 'Activar'}
                    </Button>
                  </div>
                ))}
              </Card>
            )}
          </div>
        )}

        {tab === 'datos' && (
          <Card className="grid gap-x-8 gap-y-4 p-5 sm:grid-cols-2">
            {(
              [
                ['Email', m.email],
                ['Teléfono', m.phone],
                ['DNI', m.dni],
                ['Nacimiento', m.birth_date ? fmtDate(m.birth_date) : null],
                ['Dirección', m.address],
                ['Contacto de emergencia', m.emergency_contact],
                ['Salud / apto físico', m.medical_notes],
                ['Notas', m.notes],
              ] as [string, string | null][]
            ).map(([k, v]) => (
              <div key={k}>
                <p className="label">{k}</p>
                <p className="whitespace-pre-wrap text-sm">{v || '—'}</p>
              </div>
            ))}
          </Card>
        )}
      </div>

      <MemberForm
        open={editing}
        member={m}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false)
          load()
        }}
      />
      <PaymentModal
        open={paying}
        member={m}
        onClose={() => setPaying(false)}
        onSaved={() => {
          setPaying(false)
          load()
        }}
      />
      <Modal open={showCard} onClose={() => setShowCard(false)} title="Carnet del socio">
        <div className="print-area mx-auto w-full max-w-xs overflow-hidden rounded-2xl bg-zinc-950 text-white shadow-xl">
          <div className="flex items-center justify-between px-5 pt-4">
            <p className="font-display text-lg font-bold uppercase text-brand-400">{settings?.gym_name}</p>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">Socio</p>
          </div>
          <div className="flex items-center gap-3 px-5 py-3">
            <Avatar member={m} size={52} />
            <div>
              <p className="font-semibold leading-tight">
                {m.first_name} {m.last_name}
              </p>
              {m.dni && <p className="text-xs text-zinc-400">DNI {m.dni}</p>}
            </div>
          </div>
          <div className="m-4 mt-1 flex justify-center rounded-xl bg-white p-3">
            <QrImage value={m.qr_token} size={200} />
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-zinc-500">
          El socio también ve este QR en su link personal, desde el celular.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" /> Imprimir
          </Button>
          <Button variant="secondary" onClick={() => navigator.clipboard.writeText(portalUrl).then(() => toast('Link copiado'))}>
            <Copy className="size-4" /> Copiar link
          </Button>
        </div>
      </Modal>
    </div>
  )
}
