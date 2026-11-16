/**
 * Descuento por pagar en efectivo.
 * El precio cargado en cada plan ES la cuota (ej. $66.000) y es lo que se cobra online (Mercado Pago).
 * Abonando en efectivo en recepción se aplica el descuento al registrar el cobro en el panel:
 * efectivo = cuota / (1 + %), redondeado a los $100 (ej. 10%: $66.000 → $60.000).
 * Al socio se le muestra como "10% off abonando en efectivo".
 */
export interface CashDiscount {
  mode: 'none' | 'fixed' | 'percent' | 'cash_discount'
  fixed_cents: number
  pct: number
}

export const NO_CASH_DISCOUNT: CashDiscount = { mode: 'none', fixed_cents: 0, pct: 0 }

/** Recargo online (modos viejos 'fixed' / 'percent'; con 'cash_discount' no hay recargo). Igual que private.mp_surcharge. */
export function onlineExtra(baseCents: number, cd: CashDiscount | null | undefined) {
  if (!cd) return 0
  if (cd.mode === 'fixed') return Number(cd.fixed_cents) || 0
  if (cd.mode === 'percent') return Math.ceil((baseCents * Number(cd.pct)) / 100 / 10000) * 10000
  return 0
}

/** Precio que se cobra pagando con Mercado Pago. */
export function onlinePrice(baseCents: number, cd: CashDiscount | null | undefined) {
  return baseCents + onlineExtra(baseCents, cd)
}

/** % de descuento en efectivo (0 si no está activado). */
export function cashDiscountPct(cd: CashDiscount | null | undefined) {
  return cd?.mode === 'cash_discount' && Number(cd.pct) > 0 ? Number(cd.pct) : 0
}

/** Precio abonando en efectivo (la cuota si no hay descuento). */
export function cashPrice(listCents: number, cd: CashDiscount | null | undefined) {
  const pct = cashDiscountPct(cd)
  if (!pct || listCents <= 0) return listCents
  return Math.round(listCents / (1 + pct / 100) / 10000) * 10000
}
