/** Tarifas por actividad: períodos de Musculación y nombres automáticos de las opciones. */

export const PERIOD_MAP = {
  week: { billing_interval: 'week', interval_count: 1, word: 'semanal', text: 'por semana' },
  month: { billing_interval: 'month', interval_count: 1, word: 'mensual', text: 'por mes' },
  quarter: { billing_interval: 'month', interval_count: 3, word: 'trimestral', text: 'por 3 meses' },
  semester: { billing_interval: 'month', interval_count: 6, word: 'semestral', text: 'por 6 meses' },
  year: { billing_interval: 'year', interval_count: 1, word: 'anual', text: 'por año' },
} as const
export type PeriodKey = keyof typeof PERIOD_MAP

/** Período de un plan para la pantalla de Tarifas ('other' si no es uno de los comunes). */
export function periodOf(interval: string | null, count: number) {
  for (const [k, v] of Object.entries(PERIOD_MAP)) if (v.billing_interval === interval && v.interval_count === count) return k as PeriodKey
  return 'other' as const
}

/** Nombre y descripción de una opción de tarifa ("Funcional 3 veces por semana", "Musculación trimestral"). */
export function rateLabel(activity: string, perWeek: number | null, period: PeriodKey | null) {
  if (period) return { name: `${activity} ${PERIOD_MAP[period].word}`, description: `Sala de musculación libre, ${PERIOD_MAP[period].text}` }
  if (!perWeek) return { name: `${activity} libre`, description: `Clases de ${activity} sin límite` }
  const veces = perWeek === 1 ? '1 vez' : `${perWeek} veces`
  return { name: `${activity} ${veces} por semana`, description: `Clases de ${activity}, hasta ${veces} por semana` }
}
