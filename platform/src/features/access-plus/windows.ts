/**
 * Franjas de acceso de un plan (membership_plans.access_windows).
 * [{ days: [1..7], from: 'HH:MM', to: 'HH:MM' }] · 1 = lunes … 7 = domingo · null = siempre.
 * Módulo común: lo usan el panel, la tablet del molinete y recepción.
 */
export interface AccessWindow {
  days: number[]
  from: string
  to: string
}

const SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const TIME = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/

export function parseWindows(raw: unknown): AccessWindow[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: AccessWindow[] = []
  for (const w of raw) {
    if (!w || typeof w !== 'object') continue
    const o = w as { days?: unknown; from?: unknown; to?: unknown }
    const days = Array.isArray(o.days) ? o.days.filter((d): d is number => Number.isInteger(d) && d >= 1 && d <= 7) : []
    if (!days.length || typeof o.from !== 'string' || typeof o.to !== 'string') continue
    out.push({ days: [...new Set(days)].sort((a, b) => a - b), from: o.from, to: o.to })
  }
  return out.length ? out : null
}

export function isValidTime(t: string) {
  return TIME.test(t)
}

/** [1,2,3,4,5] → "Lun–Vie" · [1,3,5] → "Lun, Mié y Vie" · [6,7] → "Sáb y Dom" */
export function formatDays(days: number[]) {
  const d = [...new Set(days)].sort((a, b) => a - b)
  if (d.length === 7) return 'Todos los días'
  const runs: number[][] = []
  for (const n of d) {
    const last = runs[runs.length - 1]
    if (last && last[last.length - 1] === n - 1) last.push(n)
    else runs.push([n])
  }
  const parts = runs.flatMap((r) =>
    r.length >= 3 ? [`${SHORT[r[0]! - 1]}–${SHORT[r[r.length - 1]! - 1]}`] : r.map((n) => SHORT[n - 1]!),
  )
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : (parts[0] ?? '')
}

/** "07:00" → "7:00" · "14:30" → "14:30" */
export function shortTime(t: string) {
  return t.replace(/^0(\d)/, '$1')
}

/** "07:00" → "7" · "14:30" → "14:30" (para "de 7 a 14 h") */
function hourish(t: string) {
  const s = shortTime(t)
  return s.endsWith(':00') ? s.slice(0, -3) : s
}

/** "Lun–Vie 7:00 a 14:00 · Sáb 9:00 a 12:00" (panel) */
export function formatWindows(raw: unknown): string | null {
  const w = parseWindows(raw)
  if (!w) return null
  return w.map((x) => `${formatDays(x.days)} ${shortTime(x.from)} a ${shortTime(x.to)}`).join(' · ')
}

/** "Lun–Vie de 7 a 14 h" (mensajes para el socio) */
export function formatWindowsShort(raw: unknown): string | null {
  const w = parseWindows(raw)
  if (!w) return null
  return w.map((x) => `${formatDays(x.days)} de ${hourish(x.from)} a ${hourish(x.to)} h`).join(' y ')
}
