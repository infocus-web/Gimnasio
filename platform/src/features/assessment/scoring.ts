/**
 * Evolution Check: puntajes de la evaluación física (0 a 100 por área) y "edad fitness".
 *
 * Es una referencia de entrenamiento, no un diagnóstico médico. Cada prueba se compara con
 * valores de referencia por edad y sexo (tablas tipo ACSM / YMCA, redondeadas):
 *   "bajo" → 20 puntos, "excelente" → 90 puntos, interpolado y acotado a 0..100.
 * Sin dependencias: se usa igual en el panel, en la app del socio y en el pedido a la IA.
 */

export type Sex = 'F' | 'M'

export interface AssessmentInput {
  sex: Sex
  age_years: number
  weight_kg?: number | null
  height_cm?: number | null
  body_fat_pct?: number | null
  waist_cm?: number | null
  resting_hr?: number | null
  squats_1min?: number | null
  pushups?: number | null
  plank_s?: number | null
  sit_reach_cm?: number | null
  balance_s?: number | null
  step_hr?: number | null
}

export type AreaKey = 'fuerza' | 'resistencia' | 'cardio' | 'movilidad' | 'equilibrio' | 'composicion'

export const AREAS: Record<AreaKey, { label: string; tests: string; focus: string }> = {
  fuerza: {
    label: 'Fuerza',
    tests: 'Sentadillas en 1 min y flexiones',
    focus: 'trabajo de fuerza con ejercicios multiarticulares (sentadilla, empujes, tracciones) y progresión de cargas',
  },
  resistencia: {
    label: 'Core',
    tests: 'Plancha frontal',
    focus: 'estabilidad de core (planchas, antirrotación, pallof, dead bug)',
  },
  cardio: {
    label: 'Cardio',
    tests: 'Test del escalón (pulso al minuto) o pulso en reposo',
    focus: 'capacidad aeróbica (zona 2 de 20 a 40 min y algún intervalo corto)',
  },
  movilidad: {
    label: 'Movilidad',
    tests: 'Flexión de tronco sentado (sit & reach)',
    focus: 'movilidad de cadena posterior y cadera (estiramientos, bisagra de cadera con poco peso)',
  },
  equilibrio: {
    label: 'Equilibrio',
    tests: 'Apoyo en una pierna con ojos cerrados',
    focus: 'equilibrio y trabajo unilateral (zancadas, step-ups, peso muerto a una pierna)',
  },
  composicion: {
    label: 'Composición',
    tests: '% de grasa (balanza) o cintura / altura',
    focus: 'composición corporal (gasto calórico semanal, fuerza para sumar masa muscular)',
  },
}

export interface AreaScore {
  key: AreaKey
  label: string
  score: number
  level: Level
}

export type Level = 'A mejorar' | 'Regular' | 'Bien' | 'Excelente'

export interface AssessmentScores {
  areas: AreaScore[]
  overall: number | null
  level: Level | null
  fitnessAge: number | null
  /** Las dos áreas más bajas (para enfocar la rutina) */
  focus: AreaScore[]
}

export function levelOf(score: number): Level {
  if (score >= 80) return 'Excelente'
  if (score >= 60) return 'Bien'
  if (score >= 40) return 'Regular'
  return 'A mejorar'
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const num = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)

/** poor → 20, excellent → 90 (funciona también si "menos es mejor": poor > excellent) */
function scale(value: number, poor: number, excellent: number) {
  return Math.round(clamp(20 + ((value - poor) / (excellent - poor)) * 70, 0, 100))
}

/** Busca la fila de la tabla por edad: [edad máxima, bajo, excelente] */
function byAge(table: [number, number, number][], age: number): [number, number] {
  const row = table.find(([maxAge]) => age <= maxAge) ?? table[table.length - 1]!
  return [row[1], row[2]]
}

const SQUATS: Record<Sex, [number, number, number][]> = {
  M: [[29, 30, 50], [39, 27, 46], [49, 22, 42], [59, 18, 38], [200, 15, 35]],
  F: [[29, 25, 45], [39, 22, 40], [49, 18, 36], [59, 13, 32], [200, 10, 30]],
}
const PUSHUPS: Record<Sex, [number, number, number][]> = {
  M: [[29, 15, 40], [39, 12, 33], [49, 9, 27], [59, 6, 22], [200, 4, 20]],
  F: [[29, 10, 32], [39, 8, 28], [49, 5, 24], [59, 3, 20], [200, 2, 18]],
}
const PLANK: [number, number, number][] = [[49, 30, 120], [200, 20, 90]]
const BALANCE: [number, number, number][] = [[39, 5, 30], [49, 4, 25], [59, 3, 20], [69, 2, 12], [200, 1, 8]]
// Pulso al minuto del test del escalón YMCA (menos es mejor)
const STEP: Record<Sex, [number, number, number][]> = {
  M: [[25, 128, 79], [35, 128, 81], [45, 130, 83], [55, 132, 87], [65, 129, 86], [200, 130, 88]],
  F: [[25, 140, 85], [35, 138, 88], [45, 140, 90], [55, 135, 94], [65, 139, 95], [200, 134, 90]],
}
const BODY_FAT: Record<Sex, [number, number, number][]> = {
  M: [[39, 28, 12], [59, 30, 14], [200, 32, 16]],
  F: [[39, 38, 20], [59, 40, 22], [200, 42, 24]],
}

function avg(values: number[]) {
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null
}

export function scoreAssessment(a: AssessmentInput): AssessmentScores {
  const age = clamp(Math.round(a.age_years), 10, 100)
  const sex = a.sex
  const raw: Partial<Record<AreaKey, number>> = {}

  const fuerza: number[] = []
  if (num(a.squats_1min)) fuerza.push(scale(a.squats_1min, ...byAge(SQUATS[sex], age)))
  if (num(a.pushups)) fuerza.push(scale(a.pushups, ...byAge(PUSHUPS[sex], age)))
  const f = avg(fuerza)
  if (f !== null) raw.fuerza = f

  if (num(a.plank_s)) raw.resistencia = scale(a.plank_s, ...byAge(PLANK, age))

  if (num(a.step_hr)) raw.cardio = scale(a.step_hr, ...byAge(STEP[sex], age))
  else if (num(a.resting_hr)) raw.cardio = scale(a.resting_hr, sex === 'M' ? 85 : 88, sex === 'M' ? 55 : 58)

  if (num(a.sit_reach_cm)) {
    // 0 = llega a la punta de los pies. Después de los 30 se espera un poco menos por década.
    const drop = Math.max(0, Math.floor((age - 30) / 10)) * 1.5
    const [poor, exc] = sex === 'M' ? [-10, 12] : [-5, 15]
    raw.movilidad = scale(a.sit_reach_cm, poor - drop, exc - drop)
  }

  if (num(a.balance_s)) raw.equilibrio = scale(a.balance_s, ...byAge(BALANCE, age))

  if (num(a.body_fat_pct)) {
    const [poor, exc] = byAge(BODY_FAT[sex], age)
    // Por debajo del rango saludable no suma más: muy poca grasa tampoco es "excelente"
    const tooLow = sex === 'M' ? 6 : 14
    raw.composicion = a.body_fat_pct < tooLow ? 70 : scale(a.body_fat_pct, poor, exc)
  } else if (num(a.waist_cm) && num(a.height_cm) && a.height_cm > 0) {
    raw.composicion = scale(a.waist_cm / a.height_cm, 0.6, 0.43)
  }

  const areas: AreaScore[] = (Object.keys(AREAS) as AreaKey[])
    .filter((k) => raw[k] !== undefined)
    .map((k) => ({ key: k, label: AREAS[k].label, score: raw[k]!, level: levelOf(raw[k]!) }))

  const overall = avg(areas.map((x) => x.score))
  // Edad fitness: con al menos 3 áreas medidas. 50 puntos = tu edad; cada 50 puntos de diferencia = 12 años.
  const fitnessAge =
    overall !== null && areas.length >= 3 ? Math.max(15, clamp(Math.round(age - ((overall - 50) / 50) * 12), age - 15, age + 15)) : null

  const focus = [...areas].sort((x, y) => x.score - y.score).filter((x) => x.score < 60).slice(0, 2)

  return { areas, overall, level: overall === null ? null : levelOf(overall), fitnessAge, focus }
}

/** Edad en años cumplidos a una fecha (YYYY-MM-DD) */
export function ageOn(birthDate: string | null | undefined, onDate: string): number | null {
  if (!birthDate) return null
  const [by, bm, bd] = birthDate.slice(0, 10).split('-').map(Number)
  const [y, m, d] = onDate.slice(0, 10).split('-').map(Number)
  if (!by || !bm || !bd || !y || !m || !d) return null
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0)
}

/** Texto para el pedido de rutina a la IA */
export function assessmentPromptText(a: AssessmentInput & { goal?: string | null; notes?: string | null }) {
  const s = scoreAssessment(a)
  if (!s.areas.length) return ''
  const lines = s.areas.map((x) => `  · ${x.label}: ${x.score}/100 (${x.level})`)
  const focus = s.focus.length
    ? `Priorizá: ${s.focus.map((x) => AREAS[x.key].focus).join('; ')}.`
    : 'No hay áreas débiles marcadas: rutina equilibrada.'
  return [
    `Evaluación física del alumno (${a.sex === 'F' ? 'mujer' : 'hombre'}, ${a.age_years} años${s.fitnessAge ? `, edad fitness ${s.fitnessAge}` : ''}):`,
    ...lines,
    a.goal ? `  · Objetivo que contó en la evaluación: ${a.goal}` : '',
    focus,
  ]
    .filter(Boolean)
    .join('\n')
}
