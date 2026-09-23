import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, MessageCircle, ScanLine, UserPlus, Users, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fmtDate, fmtMoney, METHOD_LABEL, daysLeftText, whatsappLink } from '../../lib/format'
import type { PayMethod } from '../../lib/types'
import { useSettings } from '../../lib/auth'
import { Button, Card, Loading, PageHeader, cx, errorText } from '../../components/ui'
import { BarChart } from '../../components/BarChart'

interface Stats {
  status: Partial<Record<'al_dia' | 'por_vencer' | 'vencido' | 'inactivo', number>>
  income_month: number
  income_prev_month: number
  income_by_method: Partial<Record<PayMethod, number>>
  payments_month: number
  checkins_today: number
  denied_today: number
  new_members_month: number
  checkins_series: { day: string; n: number }[]
  hours_series: { hour: number; n: number }[]
  expiring: { id: string; first_name: string; last_name: string; phone: string | null; paid_until: string; days_left: number }[]
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')
  const { settings } = useSettings()

  useEffect(() => {
    supabase.rpc('dashboard_stats').then(({ data, error }) => {
      if (error) setError(errorText(error))
      else setStats(data as Stats)
    })
  }, [])

  if (error) return <p className="text-red-600">{error}</p>
  if (!stats) return <Loading />

  const s = stats.status
  const activos = (s.al_dia ?? 0) + (s.por_vencer ?? 0)
  const diff = stats.income_prev_month ? ((stats.income_month - stats.income_prev_month) / stats.income_prev_month) * 100 : null
  const methods = Object.entries(stats.income_by_method).sort((a, b) => Number(b[1]) - Number(a[1])) as [PayMethod, number][]
  const methodTotal = methods.reduce((a, [, v]) => a + Number(v), 0)

  return (
    <div>
      <PageHeader
        title="Panel"
        subtitle={new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={
          <>
            <Link to="/admin/socios?nuevo=1">
              <Button variant="secondary">
                <UserPlus className="size-4" /> Nuevo socio
              </Button>
            </Link>
            <Link to="/admin/recepcion">
              <Button>
                <ScanLine className="size-4" /> Abrir recepción
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Socios activos" value={activos} icon={<Users className="size-4" />} foot={`${s.vencido ?? 0} vencidos · ${stats.new_members_month} nuevos este mes`} />
        <Stat
          label="Cobrado este mes"
          value={fmtMoney(stats.income_month)}
          foot={
            diff === null ? (
              `${stats.payments_month} pagos`
            ) : (
              <span className={cx('inline-flex items-center gap-0.5', diff >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                {diff >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                {Math.abs(diff).toFixed(0)}% vs mes anterior
              </span>
            )
          }
        />
        <Stat label="Entradas hoy" value={stats.checkins_today} icon={<CheckCircle2 className="size-4 text-emerald-600" />} foot={`${stats.denied_today} rechazados`} />
        <Stat label="Por vencer" value={s.por_vencer ?? 0} icon={<AlertTriangle className="size-4 text-amber-600" />} foot={`vencen en los próximos ${settings?.reminder_days ?? 3} días`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Entradas al gimnasio · últimos 14 días</h2>
          <div className="mt-4">
            <BarChart
              highlightLast
              valueLabel={(n) => `${n} ${n === 1 ? "entrada" : "entradas"}`}
              data={stats.checkins_series.map((d) => ({
                label: fmtDate(d.day),
                short: new Date(`${d.day}T12:00`).toLocaleDateString('es-AR', { day: 'numeric' }),
                value: d.n,
              }))}
            />
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Cobros del mes por medio</h2>
          {methods.length === 0 ? (
            <p className="mt-6 text-sm text-zinc-400">Todavía no hay pagos este mes.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {methods.map(([m, v]) => (
                <li key={m}>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-600">{METHOD_LABEL[m]}</span>
                    <span className="font-semibold tabular-nums">{fmtMoney(v)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${(Number(v) / methodTotal) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Horarios con más gente · últimos 30 días</h2>
          <div className="mt-4">
            <BarChart
              height={110}
              valueLabel={(n) => `${n} entradas`}
              data={stats.hours_series.map((h) => ({ label: `${h.hour}:00 a ${h.hour + 1}:00`, short: h.hour % 3 === 0 ? `${h.hour}h` : '', value: h.n }))}
            />
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 className="text-sm font-semibold">Vencimientos de la semana</h2>
            <Link to="/admin/socios?estado=por_vencer" className="text-xs font-semibold text-zinc-500 hover:text-zinc-900">
              Ver todos →
            </Link>
          </div>
          {stats.expiring.length === 0 ? (
            <p className="px-5 py-8 text-sm text-zinc-400">Nadie vence en estos días.</p>
          ) : (
            <ul className="mt-2 divide-y divide-zinc-100">
              {stats.expiring.map((m) => {
                const wa = whatsappLink(
                  m.phone,
                  `Hola ${m.first_name}! Te recordamos que tu cuota en ${settings?.gym_name ?? 'el gimnasio'} ${m.days_left < 0 ? 'venció' : 'vence'} el ${fmtDate(m.paid_until)}. ¡Te esperamos!`,
                )
                return (
                  <li key={m.id} className="flex items-center gap-3 px-5 py-2.5">
                    {m.days_left < 0 ? <XCircle className="size-4 shrink-0 text-red-500" /> : <AlertTriangle className="size-4 shrink-0 text-amber-500" />}
                    <Link to={`/admin/socios/${m.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                      {m.first_name} {m.last_name}
                    </Link>
                    <span className={cx('text-xs', m.days_left < 0 ? 'text-red-600' : 'text-zinc-500')}>{daysLeftText(m.days_left)}</span>
                    {wa && (
                      <a href={wa} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50" title="Avisar por WhatsApp">
                        <MessageCircle className="size-4" />
                      </a>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function Stat({ label, value, foot, icon }: { label: string; value: React.ReactNode; foot?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
        {label}
        {icon}
      </div>
      <p className="mt-2 font-display text-3xl font-bold tabular-nums sm:text-4xl">{value}</p>
      {foot && <p className="mt-1 text-xs text-zinc-500">{foot}</p>}
    </Card>
  )
}
