/** Textos de acceso, pases y concurrencia (módulo común: servidor y cliente). */

export type PassKind = 'guest' | 'trial' | 'day'

export const PASS_KIND: Record<PassKind, string> = {
  guest: 'Invitado',
  trial: 'Pase de prueba',
  day: 'Pase por día',
}

export type PassStatus = 'valid' | 'upcoming' | 'used' | 'expired' | 'revoked'

export const PASS_STATUS: Record<PassStatus, { label: string; className: string }> = {
  valid: { label: 'Vigente', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' },
  upcoming: { label: 'Próximo', className: 'border-sky-500/30 bg-sky-500/10 text-sky-200' },
  used: { label: 'Usado', className: 'border-zinc-700 bg-zinc-900 text-zinc-300' },
  expired: { label: 'Vencido', className: 'border-zinc-700 bg-zinc-900 text-zinc-500' },
  revoked: { label: 'Anulado', className: 'border-red-500/30 bg-red-500/10 text-red-200' },
}

export function passStatus(p: { revoked_at: string | null; valid_from: string; valid_until: string; entries_used: number; max_entries: number }, now = Date.now()): PassStatus {
  if (p.revoked_at) return 'revoked'
  if (now >= Date.parse(p.valid_until)) return 'expired'
  if (p.entries_used >= p.max_entries) return 'used'
  if (now < Date.parse(p.valid_from)) return 'upcoming'
  return 'valid'
}

/** Tablet del molinete: lo que lee la persona en la puerta */
export const PASS_DENIED: Record<string, string> = {
  PASS_INVALID: 'Ese pase no es válido. Pasá por recepción.',
  PASS_REVOKED: 'Ese pase fue anulado. Pasá por recepción.',
  PASS_EXPIRED: 'Tu pase está vencido. Pasá por recepción.',
  PASS_NOT_YET_VALID: 'Tu pase todavía no está habilitado. Revisá el día de validez.',
  PASS_USED_UP: 'Ya usaste todas las entradas de tu pase. Pasá por recepción.',
  MEDICAL_CERT_REQUIRED: 'Tu apto físico está vencido. Pasá por recepción.',
  OUTSIDE_PLAN_HOURS: 'Tu plan no permite entrar en este horario.',
}

/** Recepción / panel: motivo corto */
export const ACCESS_REASON_SHORT: Record<string, string> = {
  OUTSIDE_PLAN_HOURS: 'Fuera de horario',
  MEDICAL_CERT_REQUIRED: 'Apto vencido',
  PASS_INVALID: 'Pase inválido',
  PASS_REVOKED: 'Pase anulado',
  PASS_EXPIRED: 'Pase vencido',
  PASS_NOT_YET_VALID: 'Pase no habilitado aún',
  PASS_USED_UP: 'Pase sin entradas',
}

/** Errores de las funciones de pases → mensaje para la pantalla */
export const PASS_ERRORS: Record<string, string> = {
  FORBIDDEN: 'No tenés permiso para esta acción.',
  NAME_REQUIRED: 'Escribí el nombre y apellido.',
  DOCUMENT_REQUIRED: 'Escribí el DNI de la persona invitada (solo números).',
  INVALID_VALIDITY: 'La fecha elegida no es válida.',
  INVALID_ENTRIES: 'La cantidad de entradas no es válida.',
  INVALID_PASS_KIND: 'Tipo de pase inválido.',
  PAYMENT_METHOD_REQUIRED: 'Elegí cómo pagó.',
  PASS_NOT_FOUND: 'No encontramos ese pase.',
  PASS_ALREADY_USED: 'Ese pase ya se usó: no se puede anular.',
  GUESTS_DISABLED: 'El gimnasio no tiene habilitados los pases de invitado.',
  PLAN_NOT_CURRENT: 'Para invitar necesitás tener el plan al día.',
  GUEST_LIMIT_REACHED: 'Ya usaste todos tus pases de invitado de este mes.',
  GUEST_ALREADY_INVITED: 'Esa persona ya vino como invitada este mes.',
  GUEST_IS_MEMBER: 'Esa persona ya es socia del gimnasio.',
}

export function passError(message: string | undefined | null) {
  const code = (message ?? '').trim()
  return PASS_ERRORS[code] ?? 'Ocurrió un error inesperado. Probá de nuevo.'
}

export type OccupancyLevel = 'quiet' | 'normal' | 'full' | 'closed'

export const OCCUPANCY: Record<OccupancyLevel, { label: string; className: string; dot: string }> = {
  quiet: { label: 'Tranquilo', className: 'text-emerald-300', dot: 'bg-emerald-400' },
  normal: { label: 'Normal', className: 'text-amber-300', dot: 'bg-amber-400' },
  full: { label: 'Lleno', className: 'text-red-300', dot: 'bg-red-500' },
  closed: { label: 'Cerrado', className: 'text-zinc-400', dot: 'bg-zinc-500' },
}

export interface Occupancy {
  people: number
  level: OccupancyLevel
  capacity: number
  window_minutes: number
  at: string
}

/** Texto para compartir un pase por WhatsApp */
export function passShareText(p: { holderName: string; gymName: string; link: string; validUntil: string; timezone: string; kind: PassKind }) {
  const first = p.holderName.trim().split(/\s+/)[0] ?? p.holderName
  const until = new Intl.DateTimeFormat('es-AR', { timeZone: p.timezone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(
    new Date(p.validUntil),
  )
  const what = p.kind === 'guest' ? 'tu pase de invitado' : p.kind === 'trial' ? 'tu pase de prueba' : 'tu pase'
  return `¡Hola ${first}! Este es ${what} para ${p.gymName}. Mostrá el QR en la entrada: ${p.link}\nVálido hasta el ${until}.`
}
