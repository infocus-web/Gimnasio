import { NextResponse } from 'next/server'

/**
 * Traducción de los códigos de negocio que lanzan las funciones SQL
 * (RAISE EXCEPTION 'CLASS_FULL' USING hint = '...') a respuestas HTTP.
 * Un único lugar: el frontend recibe siempre { error: { code, message } }.
 */
const DOMAIN_ERRORS = {
  NOT_AUTHENTICATED:               { status: 401, message: 'Iniciá sesión para continuar.' },
  FORBIDDEN:                       { status: 403, message: 'No tenés permiso para esta acción.' },
  MEMBER_NOT_FOUND:                { status: 404, message: 'No encontramos tu ficha de socio en este gimnasio.' },
  SESSION_NOT_FOUND:               { status: 404, message: 'La clase no existe.' },
  BOOKING_NOT_FOUND:               { status: 404, message: 'La reserva no existe.' },
  SESSION_NOT_BOOKABLE:            { status: 409, message: 'La clase fue cancelada o ya terminó.' },
  BOOKING_CLOSED:                  { status: 409, message: 'La reserva para esta clase ya cerró.' },
  BOOKING_NOT_OPEN_YET:            { status: 409, message: 'Todavía no se abrió la reserva para esta clase.' },
  ALREADY_BOOKED:                  { status: 409, message: 'Ya estás anotado en esta clase.' },
  CLASS_FULL:                      { status: 409, message: 'La clase está completa.' },
  EQUIPMENT_TAKEN:                 { status: 409, message: 'Ese equipo ya está reservado, elegí otro.' },
  EQUIPMENT_INVALID:               { status: 422, message: 'Ese equipo no está disponible en esta sala.' },
  EQUIPMENT_NOT_APPLICABLE:        { status: 422, message: 'Esta clase no usa equipos asignados.' },
  MEMBER_TIME_CONFLICT:            { status: 409, message: 'Ya tenés otra clase en ese horario.' },
  MEMBER_FROZEN:                   { status: 402, message: 'Tu membresía está congelada.' },
  MEMBERSHIP_REQUIRED:             { status: 402, message: 'Necesitás una membresía activa para reservar.' },
  PAYMENT_PAST_DUE:                { status: 402, message: 'Tenés un pago pendiente. Regularizalo para reservar.' },
  MEMBERSHIP_EXPIRES_BEFORE_CLASS: { status: 402, message: 'Tu membresía vence antes de la clase.' },
  NO_CREDITS_LEFT:                 { status: 402, message: 'No te quedan clases en tu pack.' },
  PLAN_EXCLUDES_CLASS_TYPE:        { status: 403, message: 'Tu plan no incluye este tipo de clase.' },
  WEEKLY_LIMIT_REACHED:            { status: 403, message: 'Llegaste al límite semanal de reservas de tu plan.' },
  OUTSIDE_BOOKING_WINDOW:          { status: 409, message: 'Todavía no podés reservar con tanta anticipación.' },
  BOOKING_NOT_CANCELABLE:          { status: 409, message: 'Esta reserva ya no se puede cancelar.' },
} as const satisfies Record<string, { status: number; message: string }>

export type DomainErrorCode = keyof typeof DOMAIN_ERRORS

export function isDomainErrorCode(value: string): value is DomainErrorCode {
  return Object.hasOwn(DOMAIN_ERRORS, value)
}

export function apiError(code: string, status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status })
}

/** Convierte un error de PostgREST/Postgres en respuesta HTTP sin filtrar detalles internos. */
export function fromDbError(error: { code?: string; message: string; hint?: string | null }) {
  const code = error.message.trim()
  if (isDomainErrorCode(code)) {
    const def = DOMAIN_ERRORS[code]
    return apiError(code, def.status, error.hint || def.message)
  }
  // 42501 = permiso denegado (grants / RLS)
  if (error.code === '42501') return apiError('FORBIDDEN', 403, DOMAIN_ERRORS.FORBIDDEN.message)

  console.error('[db] unexpected error', error)
  return apiError('INTERNAL_ERROR', 500, 'Ocurrió un error inesperado. Probá de nuevo.')
}
