import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { apiError, fromDbError } from '@/lib/api/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * DELETE /api/bookings/:bookingId — Cancelar una reserva.
 * La función SQL decide si es cancelación tardía (sin devolución de crédito)
 * y promueve automáticamente al primero de la lista de espera.
 */
export async function DELETE(request: NextRequest, ctx: RouteContext<'/api/bookings/[bookingId]'>) {
  const origin = request.headers.get('origin')
  if (origin && new URL(origin).host !== request.headers.get('host')) {
    return apiError('FORBIDDEN_ORIGIN', 403, 'Origen no permitido.')
  }

  const { bookingId } = await ctx.params
  if (!z.uuid().safeParse(bookingId).success) {
    return apiError('VALIDATION_ERROR', 422, 'Identificador de reserva inválido.')
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('NOT_AUTHENTICATED', 401, 'Iniciá sesión para continuar.')

  const { data, error } = await supabase.rpc('cancel_booking', { p_booking_id: bookingId })
  if (error) return fromDbError(error)

  return NextResponse.json({ booking: data }, { headers: { 'Cache-Control': 'no-store' } })
}
