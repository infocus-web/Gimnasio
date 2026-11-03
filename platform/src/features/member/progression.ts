/**
 * Rutina que se ajusta sola ("doble progresión"): mira lo que el socio hizo la última vez en
 * un ejercicio y sugiere la carga de hoy.
 *   · Completó todas las series en el tope del rango de reps, sin llegar al límite (RPE < 9.5)
 *     → sube la carga (+1 kg si usa menos de 20 kg, si no +2,5 kg).
 *   · Quedó por debajo del mínimo de reps en la mayoría de las series → baja un 5 %.
 *   · Si no, mantiene la carga y busca sumar repeticiones.
 *   · Si pasaron más de 21 días, mantiene (vuelta progresiva).
 * Sin dependencias, para poder probarlo con node directamente.
 */

export interface LastSet {
  reps: number | null
  weightKg: number | null
  rpe?: number | null
}

export interface LoadSuggestion {
  kind: 'up' | 'down' | 'keep' | 'back'
  weightKg: number
  /** Texto corto para mostrar debajo del ejercicio */
  text: string
}

/** "8-12" → [8, 12] · "10" → [10, 10] · "AMRAP" / "30 s" → null */
export function parseRepRange(target: string | null | undefined): [number, number] | null {
  const t = (target ?? '').trim()
  const range = /^(\d{1,3})\s*[-–a]\s*(\d{1,3})$/i.exec(t)
  if (range) {
    const a = Number(range[1])
    const b = Number(range[2])
    return a > 0 && b >= a ? [a, b] : null
  }
  return /^\d{1,3}$/.test(t) && Number(t) > 0 ? [Number(t), Number(t)] : null
}

const fmt = (kg: number) => (Number.isInteger(kg) ? String(kg) : kg.toFixed(1).replace('.', ','))

/** Redondea a lo que se puede armar con discos/mancuernas: 1 kg debajo de 20, 2,5 kg arriba */
function roundLoad(kg: number) {
  const step = kg < 20 ? 1 : 2.5
  return Math.max(step, Math.round(kg / step) * step)
}

export function suggestLoad(
  sets: LastSet[],
  targetSets: number,
  targetReps: string,
  daysSince: number,
): LoadSuggestion | null {
  const range = parseRepRange(targetReps)
  const loaded = sets.filter((s) => (s.weightKg ?? 0) > 0 && s.reps !== null)
  if (!range || !loaded.length) return null
  const [min, max] = range
  // Carga de trabajo = la más pesada que usó; se miran las series hechas con esa carga
  const top = Math.max(...loaded.map((s) => s.weightKg!))
  const work = loaded.filter((s) => s.weightKg === top)

  if (daysSince > 21) {
    return { kind: 'back', weightKg: top, text: `Volvés después de un tiempo: mantené ${fmt(top)} kg y probá cómo te sentís.` }
  }

  const needed = Math.max(1, targetSets || work.length)
  const rpes = work.map((s) => s.rpe).filter((r): r is number => typeof r === 'number')
  const hardest = rpes.length ? Math.max(...rpes) : null
  const allTop = work.length >= needed && work.every((s) => (s.reps ?? 0) >= max)

  if (allTop && (hardest === null || hardest < 9.5)) {
    const next = top + (top < 20 ? 1 : 2.5)
    return { kind: 'up', weightKg: next, text: `Subí a ${fmt(next)} kg: la vez pasada completaste todas las series con ${fmt(top)} kg.` }
  }

  const short = work.filter((s) => (s.reps ?? 0) < min).length
  if (short > work.length / 2) {
    const next = roundLoad(top * 0.95)
    if (next < top) {
      return { kind: 'down', weightKg: next, text: `Bajá a ${fmt(next)} kg: la vez pasada no llegaste a ${min} reps en la mayoría de las series.` }
    }
  }

  return {
    kind: 'keep',
    weightKg: top,
    text: min === max ? `Mantené ${fmt(top)} kg.` : `Mantené ${fmt(top)} kg y buscá llegar a ${max} reps en todas las series.`,
  }
}
