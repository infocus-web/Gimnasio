import 'server-only'

export interface ActionState {
  ok?: boolean
  message?: string
  fieldErrors?: Record<string, string>
}

export const ERRORS: Record<string, string> = {
  FORBIDDEN: 'No tenés permiso para esta acción.',
  MFA_REQUIRED: 'Tenés que verificar tu identidad con el código de 2 pasos.',
  NAME_REQUIRED: 'El nombre es obligatorio.',
  DOCUMENT_TAKEN: 'Ya hay un socio con ese DNI.',
  FAMILY_LIMIT_REACHED: 'El plan del grupo familiar ya está completo.',
  PAYER_HAS_NO_ACCOUNT: 'El titular elegido no tiene cuenta familiar.',
  NOT_PAYER: 'El plan se asigna al titular del grupo familiar.',
  PLAN_NOT_FOUND: 'Ese plan no existe o está desactivado.',
  PLAN_REQUIRED: 'Elegí qué plan se está pagando (o destildá "Renovar plan").',
  INVALID_AMOUNT: 'El monto no es válido.',
  PAYMENT_NOT_FOUND: 'No encontramos ese pago.',
  PAYMENT_NOT_VOIDABLE: 'Ese pago ya estaba anulado.',
  MEMBER_NOT_FOUND: 'No encontramos al socio.',
  ONLY_OWNER_CAN_MANAGE_ADMINS: 'Solo el dueño puede invitar o modificar administradores.',
  CANNOT_MODIFY_OWN_ROLE: 'No podés cambiar tu propio rol ni darte de baja.',
  SESSION_NOT_FOUND: 'La clase no existe.',
  SESSION_NOT_BOOKABLE: 'La clase ya fue cancelada o terminó.',
  SERIES_NOT_FOUND: 'Ese horario no existe.',
  CAPACITY_EXCEEDS_ROOM: 'El cupo supera la capacidad de la sala.',
  CAPACITY_EXCEEDS_EQUIPMENT: 'El cupo supera la cantidad de equipos de la sala.',
  INSTRUCTOR_INACTIVE: 'Ese profesor está dado de baja.',
  ALREADY_BOOKED: 'Ya está anotado en esta clase.',
  CLASS_FULL: 'La clase está completa.',
  MEMBERSHIP_REQUIRED: 'No tiene una membresía activa.',
  PAYMENT_PAST_DUE: 'Tiene un pago pendiente.',
  MEMBERSHIP_EXPIRES_BEFORE_CLASS: 'Su membresía vence antes de la clase.',
  NO_CREDITS_LEFT: 'No le quedan clases en el pack.',
  PLAN_EXCLUDES_CLASS_TYPE: 'Su plan no incluye esta actividad.',
  WEEKLY_LIMIT_REACHED: 'Llegó al límite semanal de su plan.',
  MEMBER_TIME_CONFLICT: 'Ya tiene otra clase en ese horario.',
  BOOKING_CLOSED: 'La reserva para esta clase ya cerró.',
  BOOKING_NOT_CANCELABLE: 'Esa reserva ya no se puede cancelar.',
  MEMBER_FROZEN: 'La membresía está congelada.',
}

export function dbMessage(error: { message: string; code?: string; hint?: string | null }) {
  const code = error.message.trim()
  if (ERRORS[code]) return error.hint || ERRORS[code]
  if (error.code === '23505') return 'Ese dato ya está cargado (está repetido).'
  if (error.code === '23P01') return 'Choca con otra clase en la misma sala o con el mismo profesor.'
  if (error.code === '23503') return 'No se puede borrar porque tiene datos asociados. Desactivalo en su lugar.'
  if (error.code === '42501' || /row-level security/i.test(error.message)) return ERRORS.FORBIDDEN
  console.error('[admin] db error', error)
  return 'Ocurrió un error inesperado. Probá de nuevo.'
}

export function formObject(form: FormData) {
  return Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']))
}
