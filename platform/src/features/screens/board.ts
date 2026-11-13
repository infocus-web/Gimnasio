/** Pizarra de clase del profe (se muestra en la TV de la sala durante la clase). */

export const BOARD_BUCKET = 'pizarras'

export interface BoardMedia {
  type: 'image' | 'video'
  /** ruta dentro del bucket: <org>/<staff>/<uuid>.<ext> */
  path: string
}

export type BoardTimer =
  | { mode: 'stopwatch' }
  | { mode: 'countdown'; total_s: number }
  | { mode: 'interval'; work_s: number; rest_s: number; rounds: number }

export interface TimerState {
  running: boolean
  elapsed_ms: number
  started_at?: string
}

export function boardMediaUrl(path: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return null
  return `${base}/storage/v1/object/public/${BOARD_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`
}

/** Valida y limpia lo que llega del navegador */
export function cleanTimer(raw: unknown): BoardTimer | null {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Record<string, unknown>
  const int = (v: unknown, min: number, max: number) => {
    const n = Math.round(Number(v))
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min
  }
  if (t.mode === 'stopwatch') return { mode: 'stopwatch' }
  if (t.mode === 'countdown') return { mode: 'countdown', total_s: int(t.total_s, 10, 3 * 3600) }
  if (t.mode === 'interval') return { mode: 'interval', work_s: int(t.work_s, 5, 3600), rest_s: int(t.rest_s, 0, 3600), rounds: int(t.rounds, 1, 99) }
  return null
}

export function cleanMedia(raw: unknown, prefix: string): BoardMedia[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (m): m is BoardMedia =>
        !!m &&
        typeof m === 'object' &&
        ((m as BoardMedia).type === 'image' || (m as BoardMedia).type === 'video') &&
        typeof (m as BoardMedia).path === 'string' &&
        (m as BoardMedia).path.startsWith(prefix) &&
        /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|mp4|webm|mov)$/.test((m as BoardMedia).path),
    )
    .slice(0, 12)
    .map((m) => ({ type: m.type, path: m.path }))
}

/** Milisegundos que lleva el temporizador (offset = reloj del servidor − reloj local) */
export function timerElapsed(s: TimerState | null | undefined, offsetMs = 0, now = Date.now()) {
  if (!s) return 0
  const base = Number(s.elapsed_ms) || 0
  if (!s.running || !s.started_at) return base
  return base + Math.max(0, now + offsetMs - new Date(s.started_at).getTime())
}

export interface TimerView {
  /** texto grande: 04:59 */
  clock: string
  /** TRABAJO / DESCANSO / ¡TIEMPO! / null */
  label: string | null
  tone: 'work' | 'rest' | 'done' | 'idle'
  /** "Ronda 3 de 8" */
  round: string | null
  /** 0..1 de la fase actual */
  progress: number
}

const mmss = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Qué mostrar según el temporizador configurado y el tiempo transcurrido */
export function timerView(t: BoardTimer, elapsedMs: number, running: boolean): TimerView {
  if (t.mode === 'stopwatch') {
    const total = Math.max(0, Math.floor(elapsedMs / 1000))
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    const clock = h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return { clock, label: running ? null : elapsedMs ? 'PAUSA' : null, tone: running ? 'work' : 'idle', round: null, progress: 0 }
  }
  if (t.mode === 'countdown') {
    const left = t.total_s * 1000 - elapsedMs
    if (left <= 0) return { clock: '00:00', label: '¡TIEMPO!', tone: 'done', round: null, progress: 1 }
    return { clock: mmss(left), label: running ? null : elapsedMs ? 'PAUSA' : null, tone: running ? 'work' : 'idle', round: null, progress: elapsedMs / (t.total_s * 1000) }
  }
  const cycle = (t.work_s + t.rest_s) * 1000
  const idx = Math.floor(elapsedMs / cycle)
  if (idx >= t.rounds || (t.rest_s === 0 && idx >= t.rounds)) {
    return { clock: '00:00', label: '¡TERMINADO!', tone: 'done', round: `${t.rounds} de ${t.rounds} rondas`, progress: 1 }
  }
  const within = elapsedMs - idx * cycle
  const working = within < t.work_s * 1000
  // la última ronda no tiene descanso
  if (!working && idx === t.rounds - 1) {
    return { clock: '00:00', label: '¡TERMINADO!', tone: 'done', round: `${t.rounds} de ${t.rounds} rondas`, progress: 1 }
  }
  const phaseMs = working ? t.work_s * 1000 : t.rest_s * 1000
  const inPhase = working ? within : within - t.work_s * 1000
  return {
    clock: mmss(phaseMs - inPhase),
    label: !running && elapsedMs === 0 ? 'LISTOS' : working ? 'TRABAJO' : 'DESCANSO',
    tone: !running && elapsedMs === 0 ? 'idle' : working ? 'work' : 'rest',
    round: `Ronda ${idx + 1} de ${t.rounds}`,
    progress: inPhase / phaseMs,
  }
}

export function timerSummary(t: BoardTimer | null): string {
  if (!t) return 'Sin temporizador'
  if (t.mode === 'stopwatch') return 'Cronómetro'
  if (t.mode === 'countdown') return `Cuenta regresiva de ${mmss(t.total_s * 1000)}`
  return `${t.rounds} rondas · ${t.work_s} s trabajo / ${t.rest_s} s descanso`
}
