/** Tipos y textos compartidos de encuestas NPS y retos (panel y app del socio). */

export type ChallengeMetric = 'visits' | 'workouts' | 'volume_kg' | 'classes'

export const METRICS: Record<ChallengeMetric, { label: string; unit: string; help: string }> = {
  visits: { label: 'Días de entrenamiento', unit: 'días', help: 'Días distintos que entró al gimnasio (molinete, QR o recepción).' },
  workouts: { label: 'Entrenamientos registrados', unit: 'entrenos', help: 'Entrenamientos guardados en la app (modo Entrenar).' },
  volume_kg: { label: 'Kilos levantados', unit: 'kg', help: 'Suma de repeticiones × peso de todas las series registradas en la app.' },
  classes: { label: 'Clases', unit: 'clases', help: 'Clases a las que asistió (con presente).' },
}

export interface RankingRow {
  pos: number
  name: string
  progress: number
  me?: boolean
}

export interface MemberChallenge {
  id: string
  title: string
  description: string | null
  metric: ChallengeMetric
  goal: number
  starts_on: string
  ends_on: string
  reward_days: number
  show_ranking: boolean
  status: 'active' | 'settled'
  phase: 'live' | 'upcoming' | 'ended'
  joined: boolean
  progress: number | null
  completed: boolean | null
  reward_status: string | null
  participants: number
  my_pos: number | null
  ranking: RankingRow[] | null
}

export interface AdminChallenge extends Omit<MemberChallenge, 'phase' | 'joined' | 'progress' | 'completed' | 'reward_status' | 'my_pos' | 'ranking'> {
  phase: 'live' | 'upcoming' | 'to_settle' | 'settled' | 'canceled'
  reached: number
  top: RankingRow[] | null
}

export interface NpsReport {
  days: number
  answered: number
  skipped: number
  promoters: number
  passives: number
  detractors: number
  average: number | null
  nps: number | null
  enabled: boolean
  by_month: { month: string; answered: number; nps: number | null }[]
  responses: {
    id: string
    member_id: string
    name: string
    full_name: string
    phone: string | null
    score: number
    comment: string | null
    campaign: string
    created_at: string
  }[]
}

export function fmtAmount(v: number, metric: ChallengeMetric) {
  const n = new Intl.NumberFormat('es-AR', { maximumFractionDigits: metric === 'volume_kg' ? 0 : 1 }).format(v)
  return `${n} ${METRICS[metric].unit}`
}

export function fmtDay(ymd: string) {
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(`${ymd}T12:00:00Z`))
}

export function retentionErrorText(error: { message: string }) {
  const map: Record<string, string> = {
    CHALLENGE_NOT_FOUND: 'Ese reto ya no existe.',
    CHALLENGE_CLOSED: 'Ese reto ya terminó.',
    CHALLENGE_NOT_ENDED: 'El reto todavía no terminó: se cierra y premia al día siguiente de la fecha de fin.',
    MEMBER_NOT_ACTIVE: 'Para anotarte necesitás tener la ficha activa.',
    SURVEY_NOT_PENDING: 'Esta encuesta ya fue respondida.',
    INVALID_SCORE: 'Elegí un número del 0 al 10.',
    FORBIDDEN: 'No tenés permiso para esta acción.',
  }
  return map[error.message.trim()] ?? null
}
