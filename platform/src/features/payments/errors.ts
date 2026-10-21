import 'server-only'
import { dbMessage, ERRORS } from '@/features/admin/errors'

const PAY_ERRORS: Record<string, string> = {
  OUT_OF_STOCK: 'No alcanza el stock de uno de los productos.',
  PRODUCT_NOT_FOUND: 'Uno de los productos no existe o está desactivado.',
  EMPTY_SALE: 'Agregá al menos un producto.',
  INVALID_QUANTITY: 'Revisá las cantidades.',
  INVALID_METHOD: 'Elegí un medio de pago válido.',
  SALE_NOT_FOUND: 'No encontramos esa venta.',
  SALE_NOT_VOIDABLE: 'Esa venta ya estaba anulada.',
  SHIFT_ALREADY_CLOSED: 'Tu turno ya está cerrado: no hay movimientos nuevos desde el último cierre.',
  INTENT_NOT_FOUND: 'No encontramos ese pago. Probá de nuevo.',
  NOT_PAYER: 'El plan lo paga el titular del grupo familiar.',
  PLAN_REQUIRED: 'Elegí qué plan querés pagar.',
}

/** Igual que dbMessage del panel, más los códigos de pagos y caja (usa el hint si la base lo manda). */
export function payMessage(error: { message: string; code?: string; hint?: string | null }) {
  const code = error.message.trim()
  if (PAY_ERRORS[code] && !ERRORS[code]) return error.hint || PAY_ERRORS[code]
  return dbMessage(error)
}
