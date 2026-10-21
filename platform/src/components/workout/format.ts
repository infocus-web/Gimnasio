const kgFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

/** Peso con coma decimal (es-AR): 62.5 → "62,5". */
export const fmtKg = (n: number | null | undefined) => (n == null ? '' : kgFormatter.format(n));
