/**
 * Precio online vs. precio en efectivo.
 * El precio cargado en cada plan es el de EFECTIVO (lo que cobra recepción).
 * Pagando online (Mercado Pago) se cobra el precio de lista = efectivo + el % configurado
 * (ej. $60.000 en efectivo → $66.000 online). Al socio se le comunica como
 * "10% de descuento abonando en efectivo". La misma cuenta la hace la base (private.mp_surcharge).
 */
export interface CashDiscount {
  mode: 'none' | 'fixed' | 'percent' | 'cash_discount'
  fixed_cents: number
  pct: number
}

export const NO_CASH_DISCOUNT: CashDiscount = { mode: 'none', fixed_cents: 0, pct: 0 }

/** Lo que se suma al pagar online (redondeado hacia arriba a los $100, igual que en la base). */
export function onlineExtra(baseCents: number, cd: CashDiscount | null | undefined) {
  if (!cd) return 0
  if (cd.mode === 'fixed') return Number(cd.fixed_cents) || 0
  if (cd.mode === 'percent' || cd.mode === 'cash_discount') {
    return Math.ceil((baseCents * Number(cd.pct)) / 100 / 10000) * 10000
  }
  return 0
}

/** Precio que se cobra pagando con Mercado Pago. */
export function onlinePrice(baseCents: number, cd: CashDiscount | null | undefined) {
  return baseCents + onlineExtra(baseCents, cd)
}

/** % de descuento en efectivo para mostrar (solo en el modo "descuento en efectivo"). */
export function cashDiscountPct(cd: CashDiscount | null | undefined) {
  return cd?.mode === 'cash_discount' && Number(cd.pct) > 0 ? Number(cd.pct) : 0
}
