/** Mismos mensajes que la web (platform/src/lib/api/errors.ts): las funciones SQL lanzan el código como mensaje. */
const MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'Iniciá sesión para continuar.',
  FORBIDDEN: 'No tenés permiso para esta acción.',
  MEMBER_NOT_FOUND: 'No encontramos tu ficha de socio en este gimnasio.',
  SESSION_NOT_FOUND: 'La clase no existe.',
  BOOKING_NOT_FOUND: 'La reserva no existe.',
  SESSION_NOT_BOOKABLE: 'La clase fue cancelada o ya terminó.',
  BOOKING_CLOSED: 'La reserva para esta clase ya cerró.',
  BOOKING_NOT_OPEN_YET: 'Todavía no se abrió la reserva para esta clase.',
  ALREADY_BOOKED: 'Ya estás anotado en esta clase.',
  CLASS_FULL: 'La clase está completa.',
  EQUIPMENT_TAKEN: 'Ese equipo ya está reservado, elegí otro.',
  EQUIPMENT_INVALID: 'Ese equipo no está disponible en esta sala.',
  EQUIPMENT_NOT_APPLICABLE: 'Esta clase no usa equipos asignados.',
  MEMBER_TIME_CONFLICT: 'Ya tenés otra clase en ese horario.',
  MEMBER_FROZEN: 'Tu membresía está congelada.',
  MEMBERSHIP_REQUIRED: 'Necesitás una membresía activa para reservar.',
  PAYMENT_PAST_DUE: 'Tenés un pago pendiente. Regularizalo para reservar.',
  MEMBERSHIP_EXPIRES_BEFORE_CLASS: 'Tu membresía vence antes de la clase.',
  NO_CREDITS_LEFT: 'No te quedan clases en tu pack.',
  PLAN_EXCLUDES_CLASS_TYPE: 'Tu plan no incluye este tipo de clase.',
  WEEKLY_LIMIT_REACHED: 'Llegaste al límite semanal de reservas de tu plan.',
  OUTSIDE_BOOKING_WINDOW: 'Todavía no podés reservar con tanta anticipación.',
  BOOKING_NOT_CANCELABLE: 'Esta reserva ya no se puede cancelar.',
}

export function bookingErrorMessage(error: { code?: string; message?: string } | null | undefined): string {
  if (!error) return 'No se pudo completar. Probá de nuevo.'
  const msg = error.message ?? ''
  const code = Object.keys(MESSAGES).find((k) => new RegExp(`\\b${k}\\b`).test(msg))
  if (code) return MESSAGES[code]
  if (error.code === '42501') return MESSAGES.FORBIDDEN
  if (/fetch|network|timeout|abort/i.test(msg)) return 'Sin conexión. Probá de nuevo.'
  return 'No se pudo completar. Probá de nuevo.'
}
