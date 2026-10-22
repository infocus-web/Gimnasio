/**
 * Cuentas de ganancia de productos (en centavos).
 *   ganancia = precio − costo
 *   margen   = ganancia ÷ precio   → de cada peso cobrado, cuánto queda
 *   recargo  = ganancia ÷ costo    → cuánto se le subió al costo
 */
export function profitOf(priceCents: number, costCents: number) {
  const profit = priceCents - costCents
  return {
    profit,
    margin: priceCents > 0 ? profit / priceCents : null,
    markup: costCents > 0 ? profit / costCents : null,
  }
}

/** Precio sugerido para un recargo (%), redondeado a $10 hacia arriba. */
export function priceForMarkup(costCents: number, markupPct: number) {
  const raw = costCents * (1 + markupPct / 100)
  return Math.ceil(raw / 1000) * 1000
}

/** 0,4667 → "46,7 %" */
export function fmtPct(ratio: number | null | undefined, digits = 1) {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '—'
  return `${(ratio * 100).toLocaleString('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`
}
