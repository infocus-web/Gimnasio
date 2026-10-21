/**
 * Monto en formato argentino → centavos.
 * "12.500" → 12500 · "12.500,50" → 12500,50 · "12500" · "12500,5" · "$ 1.234.567"
 * El punto se toma como separador de miles (así se escribe en Argentina);
 * los decimales van con coma. "12.5" (un solo punto y 1-2 decimales) se acepta como decimal.
 */
export function toCents(raw: string) {
  const clean = raw.replace(/[^\d,.]/g, '')
  if (!clean) return null
  let normalized: string
  if (clean.includes(',')) normalized = clean.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(clean)) normalized = clean.replace(/\./g, '')
  else if (/^\d+\.\d{1,2}$/.test(clean)) normalized = clean
  else normalized = clean.replace(/\./g, '')
  const n = Number(normalized)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}

export const SALE_METHODS = ['cash', 'transfer', 'card_terminal', 'mercadopago'] as const
export type SaleMethod = (typeof SALE_METHODS)[number]
