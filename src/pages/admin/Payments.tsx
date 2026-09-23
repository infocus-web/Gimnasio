import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CreditCard, Download, Plus, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { MemberView, Payment, PayMethod } from '../../lib/types'
import { METHOD_LABEL, fmtDate, fmtDateTime, fmtMoney } from '../../lib/format'
import { Avatar, Badge, Button, Card, Empty, Loading, Modal, PageHeader, StatusBadge, errorText, useToast } from '../../components/ui'
import { PaymentModal } from './PaymentModal'

type Row = Payment & { members: { id: string; first_name: string; last_name: string } | null; plans: { name: string } | null }

export function Payments() {
  const toast = useToast()
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [rows, setRows] = useState<Row[] | null>(null)
  const [method, setMethod] = useState<'todos' | PayMethod>('todos')
  const [picking, setPicking] = useState(false)
  const [payFor, setPayFor] = useState<MemberView | null>(null)

  const load = useCallback(async () => {
    setRows(null)
    const from = month
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 1)
    const { data, error } = await supabase
      .from('payments')
      .select('*, members(id, first_name, last_name), plans(name)')
      .gte('paid_at', from.toISOString())
      .lt('paid_at', to.toISOString())
      .order('paid_at', { ascending: false })
      .range(0, 4999)
    if (error) toast(errorText(error), 'error')
    setRows((data as Row[]) ?? [])
  }, [month, toast])

  useEffect(() => {
    load()
  }, [load])

  const list = useMemo(() => (rows ?? []).filter((r) => method === 'todos' || r.method === method), [rows, method])
  const total = list.reduce((a, r) => a + Number(r.amount), 0)
  const byMethod = useMemo(() => {
    const acc: Partial<Record<PayMethod, number>> = {}
    ;(rows ?? []).forEach((r) => (acc[r.method] = (acc[r.method] ?? 0) + Number(r.amount)))
    return acc
  }, [rows])

  const monthLabel = month.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

  function exportCsv() {
    const data = [
      ['Fecha', 'Socio', 'Plan', 'Monto', 'Medio', 'Desde', 'Hasta', 'Nota'],
      ...list.map((r) => [
        fmtDateTime(r.paid_at),
        `${r.members?.last_name ?? ''}, ${r.members?.first_name ?? ''}`,
        r.plans?.name ?? '',
        String(r.amount).replace('.', ','),
        METHOD_LABEL[r.method],
        r.period_from,
        r.period_to,
        r.notes ?? '',
      ]),
    ]
    const csv = data.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `pagos-${month.toISOString().slice(0, 7)}.csv`
    a.click()
  }

  return (
    <div>
      <PageHeader
        title="Pagos"
        subtitle="Cobros registrados en el gimnasio y por Mercado Pago"
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!list.length}>
              <Download className="size-4" /> Exportar
            </Button>
            <Button onClick={() => setPicking(true)}>
              <Plus className="size-4" /> Registrar pago
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-xl border border-zinc-200 bg-white">
          <button className="p-2 hover:bg-zinc-50" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Mes anterior">
            <ChevronLeft className="size-4" />
          </button>
          <span className="w-40 text-center text-sm font-semibold capitalize">{monthLabel}</span>
          <button className="p-2 hover:bg-zinc-50" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Mes siguiente">
            <ChevronRight className="size-4" />
          </button>
        </div>
        <select className="input !w-auto" value={method} onChange={(e) => setMethod(e.target.value as PayMethod | 'todos')}>
          <option value="todos">Todos los medios</option>
          {Object.entries(METHOD_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="col-span-2 p-4 sm:col-span-1">
          <p className="text-xs text-zinc-500">Total {method === 'todos' ? 'del mes' : METHOD_LABEL[method]}</p>
          <p className="mt-1 font-display text-3xl font-bold tabular-nums">{fmtMoney(total)}</p>
          <p className="text-xs text-zinc-500">{list.length} pagos</p>
        </Card>
        {(Object.entries(byMethod) as [PayMethod, number][])
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([k, v]) => (
            <Card key={k} className="p-4">
              <p className="text-xs text-zinc-500">{METHOD_LABEL[k]}</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{fmtMoney(v)}</p>
            </Card>
          ))}
      </div>

      {!rows ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty icon={<CreditCard className="size-10" />} title={`Sin pagos en ${monthLabel}`} />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Socio</th>
                <th className="hidden px-4 py-3 font-semibold md:table-cell">Período</th>
                <th className="hidden px-4 py-3 font-semibold sm:table-cell">Medio</th>
                <th className="px-4 py-3 text-right font-semibold">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {list.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-50">
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-zinc-600">{fmtDateTime(r.paid_at)}</td>
                  <td className="px-4 py-2.5">
                    <Link to={`/admin/socios/${r.members?.id}`} className="font-medium hover:underline">
                      {r.members?.first_name} {r.members?.last_name}
                    </Link>
                    <p className="text-xs text-zinc-500">{r.plans?.name}</p>
                  </td>
                  <td className="hidden px-4 py-2.5 text-xs text-zinc-600 md:table-cell">
                    {fmtDate(r.period_from)} → {fmtDate(r.period_to)}
                  </td>
                  <td className="hidden px-4 py-2.5 sm:table-cell">
                    <Badge className={r.method === 'mercadopago' ? 'bg-sky-100 text-sky-800' : ''}>{METHOD_LABEL[r.method]}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmtMoney(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <MemberPicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(m) => {
          setPicking(false)
          setPayFor(m)
        }}
      />
      <PaymentModal
        open={!!payFor}
        member={payFor}
        onClose={() => setPayFor(null)}
        onSaved={() => {
          setPayFor(null)
          load()
        }}
      />
    </div>
  )
}

export function MemberPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (m: MemberView) => void }) {
  const [q, setQ] = useState('')
  const [list, setList] = useState<MemberView[]>([])
  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      const words = q.toLowerCase().replace(/[%_,()"]/g, ' ').split(/\s+/).filter(Boolean)
      let query = supabase.from('members_view').select('*').order('last_name').limit(40)
      if (words[0]) query = query.or(`first_name.ilike."%${words[0]}%",last_name.ilike."%${words[0]}%",dni.ilike."%${words[0]}%"`)
      const { data } = await query
      setList(
        ((data as MemberView[]) ?? []).filter((m) => words.every((w) => `${m.first_name} ${m.last_name} ${m.dni ?? ''}`.toLowerCase().includes(w))),
      )
    }, 200)
    return () => clearTimeout(t)
  }, [q, open])
  return (
    <Modal open={open} onClose={onClose} title="¿A quién le cobrás?">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
        <input className="input pl-9" autoFocus placeholder="Nombre, apellido o DNI" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul className="mt-3 max-h-80 divide-y divide-zinc-100 overflow-y-auto">
        {list.map((m) => (
          <li key={m.id}>
            <button onClick={() => onPick(m)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-zinc-50">
              <Avatar member={m} size={32} />
              <span className="flex-1 text-sm font-medium">
                {m.last_name}, {m.first_name}
              </span>
              <StatusBadge status={m.status} />
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="py-6 text-center text-sm text-zinc-400">Sin resultados</li>}
      </ul>
    </Modal>
  )
}
