/**
 * Comunicación y retención: tipos y textos compartidos (servidor y navegador).
 * La lógica de negocio vive en la base (0028_engagement.sql); esto es presentación.
 */

export type NoticeKind = 'welcome' | 'expiry_3d' | 'expiry_today' | 'inactive_7' | 'inactive_14' | 'birthday'

export interface Notice {
  kind: NoticeKind
  enabled: boolean
  subject: string
  body: string
}

export interface Rules {
  birthday_gift_days: number
  referral_reward_days: number
  freeze_max_days_year: number
}

export interface ReferralRow {
  id: string
  status: 'pending' | 'rewarded' | 'canceled'
  code: string
  created_at: string
  rewarded_at: string | null
  reward_days: number | null
  referrer: string
  referrer_id: string
  referred: string
  referred_id: string
}

export interface NewMemberOption {
  id: string
  name: string
  document: string | null
  number: number | null
  created_at: string
}

export interface AdminData {
  can_manage: boolean
  notices: Notice[]
  rules: Rules | null
  stats: { queued: number; sent_7d: number; failed_7d: number }
  referrals: ReferralRow[]
  new_members: NewMemberOption[]
}

export interface RiskRow {
  member_id: string
  first_name: string
  last_name: string
  phone: string | null
  number: number | null
  last_checkin_at: string | null
  days_away: number
  recent: number
  previous: number
  period_end: string
  reason: 'away' | 'never' | 'dropped'
  risk: number
}

export interface HistoryRow {
  id: number
  created_at: string
  sent_at: string | null
  status: 'manual' | 'queued' | 'sent' | 'failed'
  channel: 'email' | 'whatsapp'
  kind: string | null
  subject: string | null
  body: string
  error: string | null
  email: string | null
  phone: string | null
  member_id: string
  member_name: string
  sender: string | null
}

export const NOTICE_META: Record<NoticeKind, { title: string; when: string; vars: string[] }> = {
  welcome: {
    title: 'Bienvenida',
    when: 'Se manda a cada socio nuevo con email, el mismo día que se inscribe.',
    vars: ['{nombre}', '{gimnasio}'],
  },
  expiry_3d: {
    title: 'Vence en 3 días',
    when: 'A los socios activos con email cuyo plan vence dentro de 3 días (planes que se renuevan en recepción).',
    vars: ['{nombre}', '{gimnasio}', '{vence}', '{dias}'],
  },
  expiry_today: {
    title: 'Vence hoy',
    when: 'El día que vence el plan.',
    vars: ['{nombre}', '{gimnasio}', '{vence}'],
  },
  inactive_7: {
    title: 'Te extrañamos (7 días)',
    when: 'Socio con plan vigente que no entra hace 7 días. Una sola vez hasta que vuelva a venir.',
    vars: ['{nombre}', '{gimnasio}', '{dias}', '{vence}'],
  },
  inactive_14: {
    title: 'Te extrañamos (14 días)',
    when: 'Segundo aviso, a los 14 días sin venir. Una sola vez hasta que vuelva a venir.',
    vars: ['{nombre}', '{gimnasio}', '{dias}', '{vence}'],
  },
  birthday: {
    title: 'Feliz cumpleaños + regalo',
    when: 'El día del cumpleaños: suma días de regalo a su plan vigente (una vez por año) y le avisa.',
    vars: ['{nombre}', '{gimnasio}', '{dias}', '{vence}'],
  },
}

export const NOTICE_ORDER: NoticeKind[] = ['welcome', 'expiry_3d', 'expiry_today', 'inactive_7', 'inactive_14', 'birthday']

export function firstName(raw: string) {
  const w = raw.trim().split(/\s+/)[0] || 'Socio'
  return w.charAt(0).toLocaleUpperCase('es-AR') + w.slice(1).toLocaleLowerCase('es-AR')
}

/** Mismo reemplazo que hace la base al encolar (engagement_render). */
export function renderTemplate(text: string, v: { nombre: string; gimnasio: string; vence?: string; dias?: number | string }) {
  return text
    .replaceAll('{nombre}', firstName(v.nombre))
    .replaceAll('{gimnasio}', v.gimnasio)
    .replaceAll('{vence}', v.vence ?? '')
    .replaceAll('{dias}', v.dias === undefined ? '' : String(v.dias))
}

/** Valores de ejemplo para la vista previa / email de prueba. */
export function sampleVars(kind: NoticeKind, gimnasio: string, nombre = 'Martina', giftDays = 1) {
  const d = new Date(Date.now() + (kind === 'expiry_3d' ? 3 : kind === 'expiry_today' ? 0 : 20) * 86_400_000)
  const vence = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
  const dias = kind === 'inactive_7' ? 8 : kind === 'inactive_14' ? 15 : kind === 'birthday' ? giftDays : kind === 'expiry_3d' ? 3 : 0
  return { nombre, gimnasio, vence, dias }
}

export const STATUS_UI: Record<HistoryRow['status'], { label: string; className: string }> = {
  queued: { label: 'Pendiente', className: 'border-amber-500/30 bg-amber-500/10 text-amber-200' },
  sent: { label: 'Enviado', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' },
  failed: { label: 'Falló', className: 'border-red-500/30 bg-red-500/10 text-red-200' },
  manual: { label: 'WhatsApp a mano', className: 'border-zinc-700 bg-zinc-900 text-zinc-300' },
}

// ------------------------- App del socio -------------------------

export interface Achievements {
  total: number
  early: number
  night: number
  this_month: number
  best_month: number
  this_week: number
  week_streak: number
  best_week_streak: number
  last_visit: string | null
  first_visit: string | null
}

export interface MemberEngagement {
  referral: {
    code: string | null
    reward_days: number
    days_earned: number
    days_pending: number
    list: { name: string; status: 'pending' | 'rewarded'; created_at: string; rewarded_at: string | null; days: number | null }[]
  }
  birthday_gift_days: number
  freeze: {
    can_request: boolean
    is_payer: boolean
    membership_status: string | null
    period_end: string | null
    paused_until: string | null
    max_days_year: number
    min_days: number
    used_this_year: number
    remaining: number
    today: string
    list: { id: string; starts_on: string; ends_on: string; days: number; status: 'scheduled' | 'active' | 'done' | 'canceled' }[]
  }
}

export interface Badge {
  key: string
  title: string
  description: string
  value: number
  goal: number
  achieved: boolean
}

/** Insignias calculadas con las entradas reales (un día con entrada = una visita). */
export function badgesFrom(a: Achievements): Badge[] {
  const b = (key: string, title: string, description: string, value: number, goal: number): Badge => ({
    key,
    title,
    description,
    value: Math.min(value, goal),
    goal,
    achieved: value >= goal,
  })
  return [
    b('first', 'Primer paso', 'Tu primera entrada al gimnasio', a.total, 1),
    b('ten', 'En marcha', '10 entradas', a.total, 10),
    b('streak4', 'Un mes sin aflojar', '4 semanas seguidas viniendo', a.best_week_streak, 4),
    b('constant', 'Constante', '12 entradas en un mismo mes', a.best_month, 12),
    b('early', 'Madrugador', '10 entradas antes de las 8', a.early, 10),
    b('night', 'Búho', '10 entradas después de las 21', a.night, 10),
    b('fifty', 'Medio centenar', '50 entradas', a.total, 50),
    b('streak12', 'Imparable', '12 semanas seguidas viniendo', a.best_week_streak, 12),
    b('club100', 'Club 100', '100 entradas', a.total, 100),
  ]
}

/** Errores de las funciones de 0028 → texto para el usuario. */
export const ENGAGEMENT_ERRORS: Record<string, string> = {
  FORBIDDEN: 'No tenés permiso para esta acción.',
  MEMBER_NOT_FOUND: 'No encontramos al socio.',
  NOTICE_SUBJECT_INVALID: 'El asunto tiene que tener entre 1 y 150 caracteres.',
  NOTICE_BODY_INVALID: 'El texto tiene que tener entre 1 y 1500 caracteres.',
  NOTICE_NOT_FOUND: 'Ese aviso no existe.',
  RULES_OUT_OF_RANGE: 'Algún valor está fuera de rango.',
  REFERRAL_CODE_NOT_FOUND: 'No existe ningún socio con ese código.',
  REFERRAL_SELF: 'Un socio no puede recomendarse a sí mismo.',
  REFERRAL_SAME_FAMILY: 'Son del mismo grupo familiar: no cuenta como referido.',
  REFERRAL_ALREADY: 'Ese socio ya tiene un referido registrado.',
  REFERRAL_NOT_NEW: 'Solo se registran referidos de socios inscriptos en los últimos 60 días.',
  MEMBERSHIP_REQUIRED: 'No tenés un plan vigente para congelar.',
  FREEZE_ONLY_PAYER: 'Solo el titular de la cuenta puede congelar el plan.',
  FREEZE_NOT_AVAILABLE: 'Tu plan ahora no se puede congelar (ya está pausado o tiene un pago pendiente).',
  FREEZE_BAD_START: 'Elegí una fecha de inicio entre hoy y los próximos 90 días.',
  FREEZE_AFTER_PERIOD_END: 'La fecha de inicio tiene que ser antes de que venza tu plan.',
  FREEZE_MIN_DAYS: 'El mínimo para congelar es de 7 días.',
  FREEZE_LIMIT: 'Superás los días de congelamiento disponibles este año.',
  FREEZE_OVERLAP: 'Ya tenés un congelamiento en esas fechas.',
  FREEZE_NOT_FOUND: 'No encontramos ese congelamiento.',
  FREEZE_NOT_CANCELABLE: 'Solo se puede cancelar un congelamiento que todavía no empezó.',
}

export function engagementErrorText(error: { message: string; hint?: string | null; code?: string }) {
  const code = error.message.trim()
  if (code === 'FREEZE_LIMIT' && error.hint) return `${ENGAGEMENT_ERRORS.FREEZE_LIMIT} ${error.hint}`
  if (ENGAGEMENT_ERRORS[code]) return ENGAGEMENT_ERRORS[code]
  if (error.code === '42501') return ENGAGEMENT_ERRORS.FORBIDDEN
  return null
}
