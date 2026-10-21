/** Períodos del tablero del negocio. Fechas YYYY-MM-DD en la zona del gimnasio. */

export type PeriodKey = 'mes' | 'anterior' | '90' | 'custom'

export interface Period {
  key: PeriodKey
  from: string
  to: string
  prevFrom: string
  prevTo: string
  label: string
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

function d(ymd: string) {
  return new Date(`${ymd}T00:00:00Z`)
}
function ymd(date: Date) {
  return date.toISOString().slice(0, 10)
}
export function addDays(s: string, n: number) {
  const x = d(s)
  x.setUTCDate(x.getUTCDate() + n)
  return ymd(x)
}
function firstOfMonth(s: string, monthsBack = 0) {
  const x = d(s)
  return ymd(new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() - monthsBack, 1)))
}
function lastOfMonth(s: string) {
  const x = d(s)
  return ymd(new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)))
}
function daysBetween(a: string, b: string) {
  return Math.round((d(b).getTime() - d(a).getTime()) / 86_400_000)
}

export function resolvePeriod(today: string, params: Record<string, string | string[] | undefined>): Period {
  const p = typeof params.p === 'string' ? params.p : 'mes'
  if (p === 'anterior') {
    const from = firstOfMonth(today, 1)
    const to = lastOfMonth(from)
    const prevFrom = firstOfMonth(today, 2)
    return { key: 'anterior', from, to, prevFrom, prevTo: lastOfMonth(prevFrom), label: 'Mes pasado' }
  }
  if (p === '90') {
    const from = addDays(today, -89)
    return { key: '90', from, to: today, prevFrom: addDays(from, -90), prevTo: addDays(from, -1), label: 'Últimos 90 días' }
  }
  if (p === 'custom') {
    let from = typeof params.desde === 'string' && YMD.test(params.desde) ? params.desde : firstOfMonth(today)
    let to = typeof params.hasta === 'string' && YMD.test(params.hasta) ? params.hasta : today
    if (Number.isNaN(d(from).getTime())) from = firstOfMonth(today)
    if (Number.isNaN(d(to).getTime())) to = today
    if (to < from) [from, to] = [to, from]
    if (daysBetween(from, to) > 366) from = addDays(to, -366)
    const len = daysBetween(from, to) + 1
    return { key: 'custom', from, to, prevFrom: addDays(from, -len), prevTo: addDays(from, -1), label: 'Personalizado' }
  }
  // Este mes (hasta hoy) contra los mismos días del mes pasado
  const from = firstOfMonth(today)
  const prevFrom = firstOfMonth(today, 1)
  const dayOfMonth = d(today).getUTCDate()
  const prevLast = lastOfMonth(prevFrom)
  const prevTo = addDays(prevFrom, Math.min(dayOfMonth, d(prevLast).getUTCDate()) - 1)
  return { key: 'mes', from, to: today, prevFrom, prevTo, label: 'Este mes' }
}

export function fmtShort(s: string) {
  const [y = '', m = '', day = ''] = s.split('-')
  return `${Number(day)}/${Number(m)}/${y.slice(2)}`
}
