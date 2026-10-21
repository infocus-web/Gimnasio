import 'server-only'
import { z } from 'zod'
import { GOALS, type Goal } from './types'

/** Modelo por defecto (se puede cambiar con ANTHROPIC_MODEL sin tocar código). */
const DEFAULT_MODEL = 'claude-sonnet-4-5'

export const routineRequestSchema = z.object({
  org: z.string().regex(/^[a-z0-9-]{3,48}$/),
  goal: z.enum(Object.keys(GOALS) as [Goal, ...Goal[]]),
  days: z.coerce.number().int().min(2).max(6),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  limitations: z.string().trim().max(500).optional().default(''),
  machineIds: z.array(z.string().uuid()).max(100).optional().default([]),
})
export type RoutineRequest = z.infer<typeof routineRequestSchema>

export interface CatalogExercise {
  id: string
  name: string
  muscle_group: string | null
  equipment: string | null
}

export interface MachineInfo {
  name: string
  exerciseIds: string[]
}

const LEVEL_TEXT = { beginner: 'principiante', intermediate: 'intermedio', advanced: 'avanzado' } as const

export function buildPrompt(req: RoutineRequest, catalog: CatalogExercise[], machines: MachineInfo[]) {
  const system = [
    'Sos un profesor de educación física con experiencia en musculación en un gimnasio de Argentina.',
    'Armás rutinas seguras, progresivas y realistas para que un profesor las revise antes de dárselas a un alumno.',
    'Respondés ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después y sin bloques de código.',
  ].join(' ')

  const lines = catalog.map((e) => `${e.id} | ${e.name}${e.muscle_group ? ` | ${e.muscle_group}` : ''}${e.equipment ? ` | ${e.equipment}` : ''}`)
  const machineText = machines.length
    ? machines.map((m) => `- ${m.name}${m.exerciseIds.length ? ` (ejercicios: ${m.exerciseIds.join(', ')})` : ''}`).join('\n')
    : '- (no se indicó: asumí una sala de musculación estándar, usando solo ejercicios del catálogo)'

  const user = `Armá una rutina con estos datos:
- Objetivo: ${GOALS[req.goal]}
- Días por semana: ${req.days} (la rutina tiene que tener exactamente ${req.days} días)
- Nivel: ${LEVEL_TEXT[req.level]}
- Lesiones o limitaciones: ${req.limitations || 'ninguna informada'}

Equipamiento disponible en la sala:
${machineText}

CATÁLOGO de ejercicios del gimnasio (id | nombre | grupo muscular | equipamiento). Usá SOLO ejercicios de esta lista, copiando el id exacto:
${lines.join('\n')}

Reglas:
- Entre 4 y 8 ejercicios por día. Si se indicó equipamiento, priorizá los ejercicios de esas máquinas y los de peso corporal o peso libre del catálogo.
- "sets" es un número entero entre 1 y 10. "reps" es un texto corto (ej. "8-12", "15", "30 s", "AMRAP"). "rest_seconds" entre 30 y 300.
- Respetá las lesiones o limitaciones: evitá los ejercicios que las puedan agravar y aclaralo en "notes" si hace falta.
- Textos en español rioplatense, cortos. Nombres de los días descriptivos (ej. "Tren inferior", "Empuje").

Formato exacto de la respuesta:
{"name":"…","description":"…","days":[{"name":"…","exercises":[{"exercise_id":"<id del catálogo>","sets":3,"reps":"10-12","rest_seconds":90,"notes":"…"}]}]}`

  return { system, user }
}

export async function callAnthropic(system: string, user: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: 4000,
      temperature: 0.4,
      system,
      messages: [{ role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(55_000),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`ANTHROPIC_${res.status} ${detail.slice(0, 300)}`)
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] }
  return (data.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('')
}

const aiExercise = z.object({
  exercise_id: z.string(),
  sets: z.coerce.number(),
  reps: z.union([z.string(), z.number()]).transform(String),
  rest_seconds: z.coerce.number().optional(),
  notes: z.string().optional(),
})
const aiRoutine = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  days: z.array(z.object({ name: z.string().optional(), exercises: z.array(aiExercise) })).min(1).max(7),
})

export interface DraftPayload {
  name: string
  goal: string
  level: string
  description: string
  days: { name: string; exercises: { exercise_id: string; sets: number; reps: string; rest_seconds: number | null; notes: string | null }[] }[]
}

/**
 * Valida lo que devolvió la IA contra el catálogo real: descarta ids que no existen,
 * exige series 1–10, reps cortas y descanso razonable. Devuelve null si no sirve.
 */
export function validateRoutine(text: string, req: RoutineRequest, catalogIds: Set<string>): DraftPayload | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let raw: unknown
  try {
    raw = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  const parsed = aiRoutine.safeParse(raw)
  if (!parsed.success) return null

  const days = parsed.data.days
    .map((d, i) => ({
      name: (d.name ?? '').trim().slice(0, 60) || `Día ${i + 1}`,
      exercises: d.exercises
        .filter((e) => catalogIds.has(e.exercise_id))
        .filter((e) => Number.isInteger(e.sets) && e.sets >= 1 && e.sets <= 10)
        .filter((e, idx, all) => all.findIndex((x) => x.exercise_id === e.exercise_id) === idx)
        .slice(0, 12)
        .map((e) => ({
          exercise_id: e.exercise_id,
          sets: e.sets,
          reps: e.reps.trim().slice(0, 20) || '10',
          rest_seconds: e.rest_seconds != null && Number.isFinite(e.rest_seconds) ? Math.min(Math.max(Math.round(e.rest_seconds), 0), 600) : null,
          notes: e.notes?.trim().slice(0, 200) || null,
        })),
    }))
    .filter((d) => d.exercises.length > 0)

  if (days.length === 0) return null
  const goalLabel = GOALS[req.goal].split(' (')[0] ?? GOALS[req.goal]
  return {
    name: (parsed.data.name ?? '').trim().slice(0, 80) || `${goalLabel} · ${req.days} días`,
    goal: goalLabel,
    level: req.level,
    description: [
      (parsed.data.description ?? '').trim().slice(0, 600),
      req.limitations ? `Limitaciones informadas: ${req.limitations}` : '',
      'Sugerida con IA: revisala antes de asignarla.',
    ]
      .filter(Boolean)
      .join('\n'),
    days: days.slice(0, 7),
  }
}
