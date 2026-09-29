import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiError, fromDbError } from '@/lib/api/errors'
import { bookingResultSchema, createBookingSchema, idempotencyKeySchema } from '@/features/bookings/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/bookings — Reservar una clase.
 *
 * Headers:  Content-Type: application/json
 *           Idempotency-Key: <uuid por intento>   (recomendado)
 * Body:     { sessionId, memberId?, equipmentId?, allowWaitlist? }
 *
 * 201 → reservado · 202 → en lista de espera · 200 → reintento idempotente
 * 4xx → { error: { code, message } }   (códigos en src/lib/api/errors.ts)
 *
 * ── Por qué las validaciones de negocio viven en SQL (public.book_class) ──
 * Si este handler hiciera "SELECT cupo → if (hay lugar) → INSERT", dos
 * requests simultáneos verían el mismo lugar libre y ambos insertarían
 * (race condition = overbooking). book_class() corre en UNA transacción que:
 *   0. bloquea la fila de la clase (FOR UPDATE) → serializa reservas concurrentes
 *   1. verifica que el usuario pueda actuar por ese socio (él / familiar / staff)
 *   2. verifica que NO esté ya inscripto
 *   3. verifica membresía activa válida para ESA clase (plan, período, créditos, límite semanal, deuda)
 *   4. verifica capacidad (reserva o lista de espera)
 *   5. asigna/valida el equipo (bici #12)
 * y detrás quedan índices UNIQUE + constraints EXCLUDE como última defensa.
 * Probado: 10 reservas simultáneas sobre 3 lugares → exactamente 3 confirmadas.
 *
 * Este handler se encarga de: autenticación, validación de entrada, origen,
 * idempotencia y traducción de errores a HTTP.
 */
export async function POST(request: NextRequest) {
  // 1. CSRF: la cookie de sesión viaja sola; exigimos mismo origen.
  const origin = request.headers.get('origin')
  if (origin && new URL(origin).host !== request.headers.get('host')) {
    return apiError('FORBIDDEN_ORIGIN', 403, 'Origen no permitido.')
  }

  // 2. Autenticación (getUser valida el JWT contra Supabase Auth; no confiar en getSession en el servidor)
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return apiError('NOT_AUTHENTICATED', 401, 'Iniciá sesión para reservar.')
  }

  // 3. Validación de entrada
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return apiError('INVALID_JSON', 400, 'El cuerpo de la solicitud no es JSON válido.')
  }
  const parsed = createBookingSchema.safeParse(json)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', 422, 'Datos inválidos.', { issues: parsed.error.issues })
  }

  const rawKey = request.headers.get('idempotency-key')
  let idempotencyKey: string | null = null
  if (rawKey !== null) {
    const key = idempotencyKeySchema.safeParse(rawKey)
    if (!key.success) return apiError('INVALID_IDEMPOTENCY_KEY', 400, 'Idempotency-Key inválida.')
    idempotencyKey = key.data
  }

  const { sessionId, memberId, equipmentId, allowWaitlist } = parsed.data

  // 4. Reserva atómica (con el JWT del usuario → auth.uid() + RLS dentro de la función)
  const { data, error } = await supabase.rpc('book_class', {
    p_session_id: sessionId,
    p_member_id: memberId,
    p_equipment_id: equipmentId,
    p_idempotency_key: idempotencyKey ?? undefined,
    p_allow_waitlist: allowWaitlist,
  })
  if (error) return fromDbError(error)

  const result = bookingResultSchema.safeParse(data)
  if (!result.success) {
    console.error('[bookings] unexpected book_class payload', data)
    return apiError('INTERNAL_ERROR', 500, 'Respuesta inesperada del servidor.')
  }

  const booking = result.data
  const status = booking.replayed ? 200 : booking.status === 'waitlisted' ? 202 : 201
  return NextResponse.json(
    { booking },
    { status, headers: { Location: `/api/bookings/${booking.booking_id}`, 'Cache-Control': 'no-store' } },
  )
}
