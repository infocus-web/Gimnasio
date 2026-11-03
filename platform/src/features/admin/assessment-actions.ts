'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parseScaleCsv, parseScaleDate } from '@/features/assessment/scale-csv'
import type { Json } from '@/types/database.types'
import { getAdminContext } from './context'
import { dbMessage, ERRORS, formObject, type ActionState } from './errors'

async function coach(slug: string) {
  const ctx = await getAdminContext(slug)
  if (!ctx) return null
  return ctx.staff.role === 'trainer' || ctx.can('training.manage_all') ? ctx : null
}

/** Número opcional con coma o punto, dentro de un rango */
const opt = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : Number(v.replace(',', '.'))))
    .refine((v) => v === null || (Number.isFinite(v) && v >= min && v <= max), `${label}: entre ${min} y ${max}`)

const int = (min: number, max: number, label: string) =>
  opt(min, max, label).refine((v) => v === null || Number.isInteger(v), `${label}: número entero`)

// ---------------------------------------------------------------------
// Evolution Check
// ---------------------------------------------------------------------
const assessmentSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  sex: z.enum(['F', 'M'], { message: 'Elegí la tabla de referencia' }),
  age_years: int(10, 100, 'Edad').refine((v) => v !== null, 'Poné la edad'),
  weight_kg: opt(20, 300, 'Peso'),
  height_cm: opt(100, 230, 'Altura'),
  body_fat_pct: opt(3, 70, '% de grasa'),
  waist_cm: opt(40, 200, 'Cintura'),
  resting_hr: int(30, 150, 'Pulso en reposo'),
  squats_1min: int(0, 150, 'Sentadillas'),
  pushups: int(0, 150, 'Flexiones'),
  plank_s: int(0, 900, 'Plancha'),
  sit_reach_cm: opt(-40, 60, 'Flexión de tronco'),
  balance_s: int(0, 60, 'Equilibrio'),
  step_hr: int(50, 220, 'Pulso del escalón'),
  goal: z.string().trim().max(200).optional().default(''),
  notes: z.string().trim().max(1000).optional().default(''),
})

const TESTS = ['squats_1min', 'pushups', 'plank_s', 'sit_reach_cm', 'balance_s', 'step_hr', 'resting_hr', 'body_fat_pct', 'waist_cm'] as const

export async function saveAssessment(slug: string, memberId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await coach(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const parsed = assessmentSchema.safeParse(formObject(form))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message
    return { message: 'Revisá los datos marcados.', fieldErrors }
  }
  const a = parsed.data
  if (TESTS.every((k) => a[k] === null)) return { message: 'Cargá al menos una prueba.' }

  const supabase = await createClient()
  // Mediodía en la hora del gimnasio: la fecha no cambia por la zona horaria
  const at = parseScaleDate(a.date, '12:00', ctx.org.timezone) ?? `${a.date}T12:00:00-03:00`
  const { error } = await supabase.from('fitness_assessments').insert({
    org_id: ctx.org.id,
    member_id: memberId,
    assessed_by: ctx.staff.id,
    assessed_at: at,
    sex: a.sex,
    age_years: a.age_years!,
    weight_kg: a.weight_kg,
    height_cm: a.height_cm,
    body_fat_pct: a.body_fat_pct,
    waist_cm: a.waist_cm,
    resting_hr: a.resting_hr,
    squats_1min: a.squats_1min,
    pushups: a.pushups,
    plank_s: a.plank_s,
    sit_reach_cm: a.sit_reach_cm,
    balance_s: a.balance_s,
    step_hr: a.step_hr,
    goal: a.goal || null,
    notes: a.notes || null,
  })
  if (error) return { message: dbMessage(error) }

  // El peso y la grasa de la evaluación también quedan en la curva de medidas
  if (a.weight_kg !== null || a.body_fat_pct !== null) {
    await supabase.from('body_metrics').insert({
      org_id: ctx.org.id,
      member_id: memberId,
      measured_at: at,
      weight_kg: a.weight_kg,
      body_fat_pct: a.body_fat_pct,
      measurements: a.waist_cm !== null ? { cintura_cm: a.waist_cm } : {},
      source: 'staff',
    })
  }
  revalidatePath(`/${slug}/admin/alumnos/${memberId}`)
  redirect(`/${slug}/admin/alumnos/${memberId}?check=1` as Route)
}

export async function deleteAssessment(slug: string, memberId: string, assessmentId: string): Promise<ActionState> {
  const ctx = await coach(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { error } = await supabase.from('fitness_assessments').delete().eq('id', assessmentId).eq('member_id', memberId)
  if (error) return { message: dbMessage(error) }
  revalidatePath(`/${slug}/admin/alumnos/${memberId}`)
  return { ok: true, message: 'Evaluación borrada.' }
}

// ---------------------------------------------------------------------
// Balanza: carga manual
// ---------------------------------------------------------------------
const scaleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  weight_kg: opt(20, 300, 'Peso'),
  body_fat_pct: opt(3, 70, '% de grasa'),
  muscle_kg: opt(5, 150, 'Masa muscular'),
  visceral_fat: opt(1, 60, 'Grasa visceral'),
  water_pct: opt(20, 80, 'Agua'),
  bmr_kcal: int(500, 5000, 'Metabolismo basal'),
})

export async function addScaleReading(slug: string, memberId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await coach(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const parsed = scaleSchema.safeParse(formObject(form))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message
    return { message: 'Revisá los datos marcados.', fieldErrors }
  }
  const m = parsed.data
  if (m.weight_kg === null && m.body_fat_pct === null) return { message: 'Cargá al menos el peso o el % de grasa.' }
  const extra: Record<string, number> = {}
  if (m.muscle_kg !== null) extra.muscle_kg = m.muscle_kg
  if (m.visceral_fat !== null) extra.visceral_fat = m.visceral_fat
  if (m.water_pct !== null) extra.water_pct = m.water_pct
  if (m.bmr_kcal !== null) extra.bmr_kcal = m.bmr_kcal

  const supabase = await createClient()
  // Hora actual si es de hoy; mediodía si es de otro día (evita chocar con otra medición del mismo día)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: ctx.org.timezone }).format(new Date())
  const measuredAt =
    m.date === today ? new Date().toISOString() : (parseScaleDate(m.date, '12:00', ctx.org.timezone) ?? `${m.date}T12:00:00-03:00`)
  const { error } = await supabase.from('body_metrics').insert({
    org_id: ctx.org.id,
    member_id: memberId,
    measured_at: measuredAt,
    weight_kg: m.weight_kg,
    body_fat_pct: m.body_fat_pct,
    measurements: extra,
    source: 'staff',
  })
  if (error) return { message: dbMessage(error) }
  revalidatePath(`/${slug}/admin/alumnos/${memberId}`)
  return { ok: true, message: 'Medición guardada. El alumno ya la ve en Progreso.' }
}

// ---------------------------------------------------------------------
// Balanza: importar el CSV de la balanza (InBody, Tanita…)
// ---------------------------------------------------------------------
export interface ScaleImportState extends ActionState {
  result?: { imported: number; duplicates: number; invalid: number; unmatched: string[]; skipped: number; columns: string[] }
}

export async function importScaleCsv(slug: string, _prev: ScaleImportState, form: FormData): Promise<ScaleImportState> {
  const ctx = await coach(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return { message: 'Elegí el archivo CSV que exporta la balanza.' }
  if (file.size > 2_000_000) return { message: 'El archivo es muy grande (máximo 2 MB). Exportá un período más corto.' }
  const text = await file.text()
  const parsed = parseScaleCsv(text, ctx.org.timezone)
  if (parsed.error) return { message: parsed.error }
  if (!parsed.rows.length) return { message: 'No encontramos mediciones válidas en el archivo (revisá DNI, fecha y peso).' }
  if (parsed.rows.length > 2000) return { message: 'Son más de 2000 mediciones: dividí el archivo en partes.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('scale_import', { p_org: ctx.org.id, p_rows: parsed.rows as unknown as Json })
  if (error) return { message: dbMessage(error) }
  const r = data as { imported: number; duplicates: number; invalid: number; unmatched: string[] }
  revalidatePath(`/${slug}/admin/alumnos`, 'layout')
  return {
    ok: true,
    message: r.imported ? `Se importaron ${r.imported} mediciones.` : 'No había mediciones nuevas para importar.',
    result: {
      ...r,
      skipped: parsed.skipped,
      columns: Object.values(parsed.columns).filter((c): c is string => Boolean(c)),
    },
  }
}
