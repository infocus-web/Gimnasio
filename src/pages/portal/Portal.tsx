import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Activity as ActivityIcon, CalendarDays, CheckCircle2, ChevronDown, CreditCard, Dumbbell, History, QrCode, Sun, XCircle } from 'lucide-react'
import { supabase, callApi } from '../../lib/supabase'
import type { Activity, MemberStatus, ScheduleSlot } from '../../lib/types'
import { METHOD_LABEL, STATUS_LABEL, daysLeftText, fmtDate, fmtDateTime, fmtMoney } from '../../lib/format'
import { useSettings } from '../../lib/auth'
import { Button, Spinner, cx } from '../../components/ui'
import { QrImage } from '../../components/QrImage'
import { VideoPlayer, videoThumb } from '../../components/VideoPlayer'
import { WeekSchedule } from '../../components/WeekSchedule'

interface PortalData {
  member: {
    first_name: string
    last_name: string
    photo_url: string | null
    qr_token: string
    paid_until: string | null
    days_left: number | null
    status: MemberStatus
    plan: { id: string; name: string; price: number; duration_days: number } | null
  }
  routines: {
    name: string
    description: string | null
    goal: string | null
    level: string
    notes: string | null
    items: {
      day: number
      sets: number | null
      reps: string | null
      rest_seconds: number | null
      notes: string | null
      exercise: { name: string; muscle_group: string | null; description: string | null; video_url: string | null; thumbnail_url: string | null }
    }[]
  }[]
  checkins: { checked_at: string; allowed: boolean }[]
  payments: { paid_at: string; amount: number; method: keyof typeof METHOD_LABEL; period_from: string; period_to: string }[]
}

type Tab = 'qr' | 'rutina' | 'clases' | 'cuenta'

export function Portal() {
  const { token } = useParams<{ token: string }>()
  const [params, setParams] = useSearchParams()
  const { settings } = useSettings()
  const [data, setData] = useState<PortalData | null | undefined>(undefined)
  const [tab, setTab] = useState<Tab>('qr')
  const [activities, setActivities] = useState<Activity[]>([])
  const [slots, setSlots] = useState<ScheduleSlot[]>([])
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')
  const payResult = params.get('pago')

  useEffect(() => {
    supabase.rpc('member_portal', { p_token: token }).then(({ data }) => setData((data as PortalData) ?? null))
    Promise.all([
      supabase.from('activities').select('*').order('sort'),
      supabase.from('activity_schedule').select('*').order('start_time'),
    ]).then(([a, s]) => {
      setActivities((a.data as Activity[]) ?? [])
      setSlots((s.data as ScheduleSlot[]) ?? [])
    })
  }, [token])

  async function pay() {
    setPaying(true)
    setPayError('')
    try {
      const { url } = await callApi<{ url: string }>('/api/mp/checkout', { token })
      window.location.href = url
    } catch (e) {
      setPayError((e as Error).message)
      setPaying(false)
    }
  }

  if (data === undefined)
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <Spinner className="size-8 text-brand-400" />
      </div>
    )
  if (data === null)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-center text-white">
        <XCircle className="size-12 text-red-500" />
        <h1 className="mt-4 font-display text-3xl font-bold uppercase">Link inválido</h1>
        <p className="mt-2 text-sm text-zinc-400">Pedile en recepción que te reenvíen tu link personal.</p>
      </div>
    )

  const m = data.member
  const statusColor = m.status === 'al_dia' ? 'text-brand-400' : m.status === 'por_vencer' ? 'text-amber-400' : 'text-red-400'

  return (
    <div className="min-h-screen bg-zinc-950 pb-24 text-white">
      <header className="flex items-center justify-between px-5 pb-2 pt-5">
        <div className="flex items-center gap-2">
          {settings?.logo_url ? (
            <img src={settings.logo_url} alt="" className="size-8 rounded-lg object-cover" />
          ) : (
            <div className="flex size-8 items-center justify-center rounded-lg bg-brand-400 text-zinc-950">
              <ActivityIcon className="size-4" />
            </div>
          )}
          <span className="font-display text-lg font-bold uppercase">{settings?.gym_name}</span>
        </div>
        <span className="text-sm text-zinc-400">Hola, {m.first_name}</span>
      </header>

      <main className="mx-auto max-w-md px-5">
        {payResult && (
          <div
            className={cx(
              'mt-3 rounded-xl p-3 text-sm',
              payResult === 'ok' ? 'bg-emerald-500/15 text-emerald-300' : payResult === 'pendiente' ? 'bg-amber-500/15 text-amber-300' : 'bg-red-500/15 text-red-300',
            )}
            onClick={() => setParams({}, { replace: true })}
          >
            {payResult === 'ok'
              ? '¡Pago recibido! En unos segundos se actualiza tu vencimiento.'
              : payResult === 'pendiente'
                ? 'Tu pago quedó pendiente. Cuando se acredite, se actualiza solo.'
                : 'El pago no se completó. Podés intentar de nuevo.'}
          </div>
        )}

        {tab === 'qr' && (
          <section className="pt-4">
            <div className="rounded-3xl bg-white p-5 text-zinc-900 shadow-2xl">
              <div className="flex justify-center">
                <QrImage value={m.qr_token} size={260} />
              </div>
              <p className="mt-3 text-center font-display text-2xl font-bold uppercase leading-tight">
                {m.first_name} {m.last_name}
              </p>
              <p className="text-center text-xs text-zinc-500">Mostrá este código en recepción para entrar</p>
            </div>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-zinc-500">
              <Sun className="size-3.5" /> Subí el brillo de la pantalla si no lo lee
            </p>

            <div className="mt-5 rounded-2xl bg-zinc-900 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500">Tu cuota</p>
                  <p className={cx('font-display text-2xl font-bold uppercase', statusColor)}>{STATUS_LABEL[m.status]}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-zinc-300">{m.paid_until ? `Hasta el ${fmtDate(m.paid_until)}` : 'Sin pagos'}</p>
                  <p className="text-xs text-zinc-500">{daysLeftText(m.days_left)}</p>
                </div>
              </div>
              {m.plan && (
                <>
                  <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-4 text-sm">
                    <span className="text-zinc-400">{m.plan.name}</span>
                    <span className="font-semibold">{fmtMoney(m.plan.price)}</span>
                  </div>
                  <Button onClick={pay} loading={paying} size="lg" className="mt-4 w-full">
                    <CreditCard className="size-5" /> {m.status === 'al_dia' ? 'Adelantar cuota' : 'Pagar cuota'} · Mercado Pago
                  </Button>
                  {payError && <p className="mt-2 text-center text-xs text-red-400">{payError}</p>}
                </>
              )}
            </div>
          </section>
        )}

        {tab === 'rutina' && <RoutineView routines={data.routines} />}

        {tab === 'clases' && (
          <section className="pt-4">
            <h2 className="mb-4 font-display text-2xl font-bold uppercase">Clases y horarios</h2>
            <WeekSchedule activities={activities} slots={slots} dark />
            <div className="mt-6 space-y-3">
              {activities
                .filter((a) => a.description)
                .map((a) => (
                  <div key={a.id} className="rounded-xl bg-zinc-900 p-4" style={{ borderLeft: `4px solid ${a.color ?? '#84cc16'}` }}>
                    <p className="font-semibold">{a.name}</p>
                    <p className="text-sm text-zinc-400">{a.description}</p>
                    {a.instructor && <p className="mt-1 text-xs text-zinc-500">Con {a.instructor}</p>}
                  </div>
                ))}
            </div>
          </section>
        )}

        {tab === 'cuenta' && (
          <section className="space-y-6 pt-4">
            <div>
              <h2 className="mb-3 font-display text-2xl font-bold uppercase">Mis pagos</h2>
              {data.payments.length === 0 ? (
                <p className="text-sm text-zinc-500">Todavía no hay pagos registrados.</p>
              ) : (
                <ul className="divide-y divide-zinc-800 rounded-xl bg-zinc-900">
                  {data.payments.map((p, i) => (
                    <li key={i} className="flex items-center justify-between px-4 py-3 text-sm">
                      <div>
                        <p className="font-semibold">{fmtMoney(p.amount)}</p>
                        <p className="text-xs text-zinc-500">
                          {fmtDate(p.paid_at)} · {METHOD_LABEL[p.method]}
                        </p>
                      </div>
                      <p className="text-right text-xs text-zinc-400">
                        {fmtDate(p.period_from)}
                        <br />→ {fmtDate(p.period_to)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h2 className="mb-3 font-display text-2xl font-bold uppercase">Mis ingresos</h2>
              {data.checkins.length === 0 ? (
                <p className="text-sm text-zinc-500">Todavía no registraste ingresos.</p>
              ) : (
                <ul className="grid grid-cols-2 gap-2">
                  {data.checkins.map((c, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
                      {c.allowed ? <CheckCircle2 className="size-3.5 text-brand-400" /> : <XCircle className="size-3.5 text-red-400" />}
                      {fmtDateTime(c.checked_at)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {(settings?.whatsapp || settings?.address) && (
              <div className="rounded-xl bg-zinc-900 p-4 text-sm text-zinc-400">
                {settings.address && <p>{settings.address}</p>}
                {settings.opening_hours && <p>{settings.opening_hours}</p>}
                {settings.whatsapp && <p>WhatsApp {settings.whatsapp}</p>}
              </div>
            )}
          </section>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-4">
          {(
            [
              ['qr', 'Mi QR', QrCode],
              ['rutina', 'Rutina', Dumbbell],
              ['clases', 'Clases', CalendarDays],
              ['cuenta', 'Mi cuenta', History],
            ] as const
          ).map(([t, label, Icon]) => (
            <button
              key={t}
              onClick={() => {
                setTab(t)
                window.scrollTo({ top: 0 })
              }}
              className={cx('flex flex-col items-center gap-1 py-3 text-[11px] font-medium', tab === t ? 'text-brand-400' : 'text-zinc-500')}
            >
              <Icon className="size-5" />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

function RoutineView({ routines }: { routines: PortalData['routines'] }) {
  const r = routines[0]
  const days = useMemo(() => Array.from(new Set(r?.items.map((i) => i.day) ?? [])).sort(), [r])
  const [day, setDay] = useState(days[0] ?? 1)
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  if (!r)
    return (
      <section className="pt-10 text-center">
        <Dumbbell className="mx-auto size-10 text-zinc-700" />
        <p className="mt-3 font-semibold">Todavía no tenés rutina asignada</p>
        <p className="mt-1 text-sm text-zinc-500">Pedísela a tu profe en la sala.</p>
      </section>
    )

  const items = r.items.filter((i) => i.day === day)
  return (
    <section className="pt-4">
      <h2 className="font-display text-2xl font-bold uppercase">{r.name}</h2>
      <p className="text-sm text-zinc-400">{[r.goal, r.level].filter(Boolean).join(' · ')}</p>
      {(r.description || r.notes) && <p className="mt-2 whitespace-pre-wrap rounded-xl bg-zinc-900 p-3 text-sm text-zinc-300">{[r.description, r.notes].filter(Boolean).join('\n')}</p>}
      <div className="mt-4 flex gap-1.5 overflow-x-auto">
        {days.map((d) => (
          <button
            key={d}
            onClick={() => {
              setDay(d)
              setOpenIdx(null)
            }}
            className={cx('shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold', day === d ? 'bg-brand-400 text-zinc-950' : 'bg-zinc-900 text-zinc-400')}
          >
            Día {d}
          </button>
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {items.map((it, i) => {
          const open = openIdx === i
          const thumb = videoThumb(it.exercise.video_url, it.exercise.thumbnail_url)
          return (
            <li key={i} className="overflow-hidden rounded-2xl bg-zinc-900">
              <button onClick={() => setOpenIdx(open ? null : i)} className="flex w-full items-center gap-3 p-3 text-left">
                <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-zinc-800">
                  {thumb ? <img src={thumb} alt="" className="size-full object-cover" loading="lazy" /> : <Dumbbell className="m-4 size-6 text-zinc-600" />}
                  <span className="absolute left-1 top-1 flex size-5 items-center justify-center rounded-full bg-brand-400 text-[10px] font-bold text-zinc-950">{i + 1}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{it.exercise.name}</p>
                  <p className="text-sm text-brand-400">
                    {it.sets ? `${it.sets} × ` : ''}
                    {it.reps}
                    {it.rest_seconds ? <span className="text-zinc-500"> · pausa {it.rest_seconds}s</span> : null}
                  </p>
                  {it.notes && <p className="truncate text-xs text-zinc-500">{it.notes}</p>}
                </div>
                <ChevronDown className={cx('size-5 shrink-0 text-zinc-600 transition', open && 'rotate-180')} />
              </button>
              {open && (
                <div className="space-y-3 px-3 pb-4">
                  {it.exercise.video_url && <VideoPlayer url={it.exercise.video_url} poster={it.exercise.thumbnail_url} title={it.exercise.name} />}
                  {it.exercise.description && <p className="text-sm text-zinc-300">{it.exercise.description}</p>}
                  {!it.exercise.video_url && !it.exercise.description && <p className="text-sm text-zinc-500">Consultá la técnica con tu profe.</p>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
