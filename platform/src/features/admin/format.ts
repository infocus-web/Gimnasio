const TZ = 'America/Argentina/Buenos_Aires'

export function fmtDate(value: string | null | undefined, tz = TZ) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-AR', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(value.length === 10 ? `${value}T12:00:00Z` : value),
  )
}

export function fmtDateTime(value: string | null | undefined, tz = TZ) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function fmtTime(value: string, tz = TZ) {
  return new Intl.DateTimeFormat('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

/** Medianoche de hoy en la zona del gimnasio, como ISO UTC. */
export function startOfToday(tz = TZ) {
  const now = new Date()
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const offset = tzOffsetMinutes(now, tz)
  return new Date(Date.parse(`${ymd}T00:00:00Z`) - offset * 60_000).toISOString()
}

/** Fecha de hoy YYYY-MM-DD en la zona del gimnasio (para inputs date). */
export function todayYMD(tz = TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function tzOffsetMinutes(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - date.getTime()) / 60_000)
}

export function daysUntil(value: string | null | undefined) {
  if (!value) return null
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000)
}

export type PlanState = 'al_dia' | 'por_vencer' | 'vencido' | 'sin_plan' | 'congelado'

export function planState(row: { membership_status: string | null; current_period_end: string | null; status?: string }): PlanState {
  if (row.status === 'frozen' || row.membership_status === 'paused') return 'congelado'
  if (!row.membership_status || !row.current_period_end) return 'sin_plan'
  const d = daysUntil(row.current_period_end)!
  if (d < 0 || row.membership_status === 'past_due') return 'vencido'
  if (d <= 7) return 'por_vencer'
  return 'al_dia'
}

export const PLAN_STATE_UI: Record<PlanState, { label: string; className: string }> = {
  al_dia: { label: 'Al día', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' },
  por_vencer: { label: 'Por vencer', className: 'border-amber-500/30 bg-amber-500/10 text-amber-200' },
  vencido: { label: 'Vencido', className: 'border-red-500/30 bg-red-500/10 text-red-200' },
  sin_plan: { label: 'Sin plan', className: 'border-zinc-700 bg-zinc-900 text-zinc-400' },
  congelado: { label: 'Congelado', className: 'border-sky-500/30 bg-sky-500/10 text-sky-200' },
}

export function formatMoney(cents: number, currency = 'ARS') {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100)
}
