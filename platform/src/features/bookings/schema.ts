import { z } from 'zod'

/** Body de POST /api/bookings */
export const createBookingSchema = z.object({
  sessionId: z.uuid(),
  /** Solo si reservás para un familiar a cargo, o si sos staff reservando para un socio. */
  memberId: z.uuid().optional(),
  /** Ej. elegir la bici #12. Si se omite y la clase usa equipos, se asigna uno libre. */
  equipmentId: z.uuid().optional(),
  /** false = si está llena, fallar en vez de anotarse en lista de espera. */
  allowWaitlist: z.boolean().default(true),
})
export type CreateBookingInput = z.infer<typeof createBookingSchema>

/** Header Idempotency-Key: el cliente genera un UUID por intento de reserva (doble tap, reintentos de red). */
export const idempotencyKeySchema = z.string().trim().min(8).max(100).regex(/^[A-Za-z0-9_-]+$/)

/** Respuesta de public.book_class() */
export const bookingResultSchema = z.object({
  booking_id: z.uuid(),
  status: z.enum(['booked', 'waitlisted', 'checked_in']),
  equipment_id: z.uuid().nullable().optional(),
  equipment_label: z.string().nullable().optional(),
  waitlist_position: z.number().int().nullable().optional(),
  membership_id: z.uuid().nullable().optional(),
  credits_remaining: z.number().int().nullable().optional(),
  replayed: z.boolean(),
})
export type BookingResult = z.infer<typeof bookingResultSchema>
