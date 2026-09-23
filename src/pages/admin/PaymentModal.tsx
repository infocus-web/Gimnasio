import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase, callApi } from '../../lib/supabase'
import type { Member, Payment, PayMethod, Plan } from '../../lib/types'
import { METHOD_LABEL, fmtDate, fmtMoney, todayISO } from '../../lib/format'
import { Button, Field, Modal, errorText, useToast } from '../../components/ui'

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function PaymentModal({
  open,
  member,
  onClose,
  onSaved,
}: {
  open: boolean
  member: Pick<Member, 'id' | 'first_name' | 'last_name' | 'plan_id' | 'paid_until' | 'email'> | null
  onClose: () => void
  onSaved: (p: Payment) => void
}) {
  const toast = useToast()
  const [plans, setPlans] = useState<Plan[]>([])
  const [planId, setPlanId] = useState('')
  const [months, setMonths] = useState(1)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PayMethod>('efectivo')
  const [notes, setNotes] = useState('')
  const [sendReceipt, setSendReceipt] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !member) return
    supabase
      .from('plans')
      .select('*')
      .order('sort')
      .then(({ data }) => {
        const list = (data as Plan[]) ?? []
        setPlans(list)
        const p = list.find((x) => x.id === member.plan_id) ?? list.find((x) => x.active)
        setPlanId(p?.id ?? '')
        setAmount(p ? String(p.price) : '')
      })
    setMonths(1)
    setMethod('efectivo')
    setNotes('')
    setSendReceipt(Boolean(member.email))
  }, [open, member])

  const plan = plans.find((p) => p.id === planId)

  const period = useMemo(() => {
    if (!plan || !member) return null
    const today = todayISO()
    const from = member.paid_until && addDays(member.paid_until, 1) > today ? addDays(member.paid_until, 1) : today
    return { from, to: addDays(from, plan.duration_days * months - 1) }
  }, [plan, member, months])

  function changePlan(id: string) {
    setPlanId(id)
    const p = plans.find((x) => x.id === id)
    if (p) setAmount(String(p.price * months))
  }
  function changeMonths(n: number) {
    setMonths(n)
    if (plan) setAmount(String(plan.price * n))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!member) return
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('record_payment', {
        p_member: member.id,
        p_plan: planId || null,
        p_amount: Number(amount),
        p_method: method,
        p_notes: notes.trim() || null,
        p_months: months,
      })
      if (error) throw error
      const pay = data as Payment
      toast(`Pago registrado · vence el ${fmtDate(pay.period_to)}`)
      if (sendReceipt && member.email) {
        callApi('/api/email', { type: 'receipt', payment_id: pay.id }).catch((err) =>
          toast(`El pago quedó registrado, pero no se pudo enviar el email: ${err.message}`, 'error'),
        )
      }
      onSaved(pay)
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
      title={`Registrar pago · ${member?.first_name ?? ''} ${member?.last_name ?? ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="payment-form" loading={busy} disabled={!planId}>
            Registrar {amount ? fmtMoney(Number(amount)) : ''}
          </Button>
        </>
      }
    >
      <form id="payment-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Plan" className="sm:col-span-2">
            <select className="input" value={planId} onChange={(e) => changePlan(e.target.value)} required>
              <option value="" disabled>
                Elegí un plan
              </option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {fmtMoney(p.price)} · {p.duration_days} días
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cantidad">
            <select className="input" value={months} onChange={(e) => changeMonths(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 12].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'período' : 'períodos'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Monto">
            <input className="input" type="number" min={0} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </Field>
          <Field label="Medio de pago" className="sm:col-span-2">
            <div className="flex flex-wrap gap-1.5">
              {(['efectivo', 'transferencia', 'debito', 'credito', 'mercadopago', 'otro'] as PayMethod[]).map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                    method === m ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 hover:bg-zinc-50'
                  }`}
                >
                  {METHOD_LABEL[m]}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <Field label="Nota (opcional)">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej: pagó con descuento" />
        </Field>
        {period && (
          <div className="rounded-xl bg-brand-50 p-3 text-sm text-zinc-700">
            Cubre del <b>{fmtDate(period.from)}</b> al <b>{fmtDate(period.to)}</b>
            {member?.paid_until && member.paid_until >= todayISO() && (
              <span className="block text-xs text-zinc-500">Se suma a partir del vencimiento actual ({fmtDate(member.paid_until)}).</span>
            )}
          </div>
        )}
        {member?.email && (
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <input type="checkbox" checked={sendReceipt} onChange={(e) => setSendReceipt(e.target.checked)} className="size-4 accent-yellow-400" />
            Enviar comprobante a {member.email}
          </label>
        )}
      </form>
    </Modal>
  )
}
