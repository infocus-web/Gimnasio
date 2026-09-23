import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Download, Search, UserPlus, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { MemberStatus, MemberView } from '../../lib/types'
import { STATUS_LABEL, daysLeftText, fmtDate } from '../../lib/format'
import { Avatar, Button, Card, Empty, Loading, PageHeader, StatusBadge, cx, errorText, useToast } from '../../components/ui'
import { MemberForm } from './MemberForm'

const FILTERS: ('todos' | MemberStatus)[] = ['todos', 'al_dia', 'por_vencer', 'vencido', 'inactivo']

export function Members() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [members, setMembers] = useState<MemberView[] | null>(null)
  const [q, setQ] = useState('')
  const filter = (params.get('estado') as MemberStatus | null) ?? 'todos'
  const showForm = params.get('nuevo') === '1'

  useEffect(() => {
    supabase
      .from('members_view')
      .select('*')
      .order('last_name')
      .order('first_name')
      .range(0, 9999)
      .then(({ data, error }) => {
        if (error) toast(errorText(error), 'error')
        setMembers((data as MemberView[]) ?? [])
      })
  }, [toast])

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: members?.length ?? 0 }
    members?.forEach((m) => (c[m.status] = (c[m.status] ?? 0) + 1))
    return c
  }, [members])

  const list = useMemo(() => {
    const term = q
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
    return (members ?? []).filter((m) => {
      if (filter !== 'todos' && m.status !== filter) return false
      if (!term) return true
      const hay = `${m.first_name} ${m.last_name} ${m.dni ?? ''} ${m.email ?? ''} ${m.phone ?? ''}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
      return term.split(/\s+/).every((t) => hay.includes(t))
    })
  }, [members, q, filter])

  function setFilter(f: string) {
    const p = new URLSearchParams(params)
    if (f === 'todos') p.delete('estado')
    else p.set('estado', f)
    setParams(p, { replace: true })
  }

  function exportCsv() {
    const rows = [
      ['Apellido', 'Nombre', 'DNI', 'Email', 'Teléfono', 'Plan', 'Vence', 'Estado'],
      ...list.map((m) => [m.last_name, m.first_name, m.dni ?? '', m.email ?? '', m.phone ?? '', m.plan_name ?? '', m.paid_until ?? '', STATUS_LABEL[m.status]]),
    ]
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `socios-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <div>
      <PageHeader
        title="Socios"
        subtitle={members ? `${counts.todos} socios registrados` : undefined}
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!list.length}>
              <Download className="size-4" /> Exportar
            </Button>
            <Button onClick={() => setParams({ nuevo: '1' })}>
              <UserPlus className="size-4" /> Nuevo socio
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <input className="input pl-9" placeholder="Buscar por nombre, DNI, email o teléfono" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-zinc-200/60 p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cx(
                'whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                filter === f ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800',
              )}
            >
              {f === 'todos' ? 'Todos' : STATUS_LABEL[f]} <span className="text-zinc-400">{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {!members ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty
          icon={<Users className="size-10" />}
          title={members.length ? 'No hay socios con ese filtro' : 'Todavía no cargaste socios'}
          text={members.length ? undefined : 'Creá el primero y registrale el pago para que pueda entrar con su QR.'}
          action={!members.length && <Button onClick={() => setParams({ nuevo: '1' })}>Crear socio</Button>}
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Socio</th>
                <th className="hidden px-4 py-3 font-semibold md:table-cell">DNI</th>
                <th className="hidden px-4 py-3 font-semibold lg:table-cell">Plan</th>
                <th className="hidden px-4 py-3 font-semibold sm:table-cell">Vence</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {list.map((m) => (
                <tr key={m.id} className="cursor-pointer hover:bg-zinc-50" onClick={() => navigate(`/admin/socios/${m.id}`)}>
                  <td className="px-4 py-2.5">
                    <Link to={`/admin/socios/${m.id}`} className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                      <Avatar member={m} size={36} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {m.last_name}, {m.first_name}
                        </p>
                        <p className="truncate text-xs text-zinc-500">{m.email || m.phone || '—'}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="hidden px-4 py-2.5 tabular-nums text-zinc-600 md:table-cell">{m.dni || '—'}</td>
                  <td className="hidden px-4 py-2.5 text-zinc-600 lg:table-cell">{m.plan_name || '—'}</td>
                  <td className="hidden px-4 py-2.5 sm:table-cell">
                    <p className="tabular-nums">{fmtDate(m.paid_until)}</p>
                    <p className="text-xs text-zinc-500">{m.active ? daysLeftText(m.days_left) : ''}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={m.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <MemberForm
        open={showForm}
        onClose={() => setParams({}, { replace: true })}
        onSaved={(m) => navigate(`/admin/socios/${m.id}?nuevo=1`)}
      />
    </div>
  )
}
