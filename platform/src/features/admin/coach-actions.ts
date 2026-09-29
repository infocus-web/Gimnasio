'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAdminContext } from './context'
import { dbMessage, ERRORS, formObject, type ActionState } from './errors'

async function coach(slug: string) {
  const ctx = await getAdminContext(slug)
  if (!ctx) return null
  const allowed = ctx.staff.role === 'trainer' || ctx.can('training.manage_all')
  return allowed ? ctx : null
}

const num = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : Number(v.replace(',', '.'))))
    .pipe(z.number().min(min).max(max).optional())

// ---------------------------------------------------------------------
// Profesor a cargo (desde la ficha del socio)
// ---------------------------------------------------------------------
export async function assignTrainer(slug: string, memberId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('members.write')) return { message: ERRORS.FORBIDDEN }
  const trainerId = String(form.get('trainerId') ?? '')
  const supabase = await createClient()
  const del = await supabase.from('trainer_clients').delete().eq('member_id', memberId).eq('org_id', ctx.org.id)
  if (del.error) return { message: dbMessage(del.error) }
  if (trainerId) {
    const { error } = await supabase.from('trainer_clients').insert({ org_id: ctx.org.id, trainer_id: trainerId, member_id: memberId })
    if (error) return { message: dbMessage(error) }
  }
  revalidatePath(`/${slug}/admin`, 'layout')
  return { ok: true, message: trainerId ? 'Profesor asignado.' : 'Se quitó el profesor.' }
}

// ---------------------------------------------------------------------
// Rutinas (programas)
// ---------------------------------------------------------------------
const programSchema = z.object({
  name: z.string().trim().min(1, 'Poné un nombre'),
  goal: z.string().trim().optional(),
  level: z.enum(['beginner', 'intermediate', 'advanced']).optional().or(z.literal('').transform(() => undefined)),
  description: z.string().trim().optional(),
})

export async function createProgram(slug: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await coach(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const parsed = programSchema.safeParse(formObject(form))
  if (!parsed.success) return { fieldErrors: { name: parsed.error.issues[0]?.message ?? 'Revisá los datos' } }
  const p = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('workout_programs')
    .insert({ org_id: ctx.org.id, author_id: ctx.staff.id, name: p.name, goal: p.goal || null, level: p.level ?? null, description: p.description || null, is_template: true })
    .select('id')
    .single()
  if (error) return { message: dbMessage(error) }
  // Arranca con un Día 1 vacío
  await supabase.from('program_workouts').insert({ org_id: ctx.org.id, program_id: data.id, day_index: 1, name: 'Día 1' })
  redirect(`/${slug}/admin/rutinas/${data.id}` as Route)
}

export async function updateProgram(slug: string, programId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await coach(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const parsed = programSchema.safeParse(formObject(form))
  if (!parsed.success) return { fieldErrors: { name: parsed.error.issues[0]?.message ?? 'Revisá los datos' } }
  const p = parsed.data
  const supabase = await createClient()
  const { error } = await supabase
    .from('workout_programs')
    .update({ name: p.name, goal: p.goal || null, level: p.level ?? null, description: p.description || null })
    .eq('id', programId)
  if (error) return { message: dbMessage(error) }
  revalidatePath(`/${slug}/admin/rutinas`, 'layout')
  return { ok: true, message: 'Rutina guardada.' }
}

export async function addWorkoutDay(slug: string, programId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await coach(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { data: days } = await supabase.from('program_workouts').select('day_index').eq('program_id', programId)
  const next = Math.max(0, ...(days ?? []).map((d) => d.day_index)) + 1
  if (next > 7) return { message: 'Una rutina tiene como máximo 7 días.' }
  const name = String(form.get('name') ?? '').trim() || `Día ${next}`
  const { error } = await supabase.from('program_workouts').insert({ org_id: ctx.org.id, program_id: programId, day_index: next, name })
  if (error) return { message: dbMessage(error) }
  revalidatePath(`/${slug}/admin/rutinas/${programId}`)
  return { ok: true, message: `Se agregó "${name}".` }
}

export async function renameWorkoutDay(slug: string, programId: string, workoutId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await coach(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const name = String(form.get('name') ?? '').trim()
  if (!name) return { fieldErrors: { name: 'Poné un nombre' } }
  const supabase = await createClient()
  const { error } = await supabase.from('program_workouts').update({ name }).eq('id', workoutId)
  if (error) return { message: dbMessage(error) }
  revalidatePath(`/${slug}/admin/rutinas/${programId}`)
  return { ok: true, message: 'Guardado.' }
}

export async function deleteWorkoutDay(slug: string, programId: string, workoutId: string): Promise<void> {
  const ctx = await coach(slug)
  if (!ctx) return
  const supabase = await createClient()
  await supabase.from('program_workouts').delete().eq('id', workoutId)
  revalidatePath(`/${slug}/admin/rutinas/${programId}`)
}

const exerciseRowSchema = z.object({
  exerciseId: z.uuid('Elegí un ejercicio'),
  sets: num(1, 20),
  reps: z.string().trim().max(20).optional(),
  weight: num(0, 1000),
  rest: num(0, 900),
  notes: z.string().trim().max(200).optional(),
})

export async function addProgramExercise(slug: string, programId: string, workoutId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await coach(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const parsed = exerciseRowSchema.safeParse(formObject(form))
  if (!parsed.success) {
    const fe: Record<string, string> = {}
    for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.message
    return { fieldErrors: fe }
  }
  const e = parsed.data
  const supabase = await createClient()
  const { data: last } = await supabase
    .from('program_exercises')
    .select('position')
    .eq('workout_id', workoutId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  const { error } = await supabase.from('program_exercises').insert({
    org_id: ctx.org.id,
    workout_id: workoutId,
    exercise_id: e.exerciseId,
    position: (last?.position ?? 0) + 1,
    target_sets: e.sets ?? 3,
    target_reps: e.reps || '10',
    target_weight_kg: e.weight ?? null,
    rest_seconds: e.rest ?? 60,
    notes: e.notes || null,
  })
  if (error) return { message: dbMessage(error) }
  revalidatePath(`/${slug}/admin/rutinas/${programId}`)
  return { ok: true, message: 'Ejercicio agregado.' }
}

export async function deleteProgramExercise(slug: string, programId: string, rowId: string): Promise<void> {
  const ctx = await coach(slug)
  if (!ctx) return
  const supabase = await createClient()
  await supabase.from('program_exercises').delete().eq('id', rowId)
  revalidatePath(`/${slug}/admin/rutinas/${programId}`)
}

export async function moveProgramExercise(slug: string, programId: string, workoutId: string, rowId: string, dir: -1 | 1): Promise<void> {
  const ctx = await coach(slug)
  if (!ctx) return
  const supabase = await createClient()
  const { data: rows } = await supabase.from('program_exercises').select('id, position').eq('workout_id', workoutId).order('position')
  const list = rows ?? []
  const i = list.findIndex((r) => r.id === rowId)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return
  await supabase.from('program_exercises').update({ position: list[j]!.position }).eq('id', list[i]!.id)
  await supabase.from('program_exercises').update({ position: list[i]!.position }).eq('id', list[j]!.id)
  revalidatePath(`/${slug}/admin/rutinas/${programId}`)
}

export async function createExercise(slug: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await coach(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const parsed = z
    .object({
      name: z.string().trim().min(2, 'Poné un nombre'),
      muscleGroup: z.string().trim().optional(),
      equipment: z.string().trim().optional(),
      videoUrl: z
        .string()
        .trim()
        .transform((v) => (v === '' ? undefined : v))
        .pipe(z.url('Link inválido').optional()),
      instructions: z.string().trim().max(600).optional(),
    })
    .safeParse(formObject(form))
  if (!parsed.success) {
    const fe: Record<string, string> = {}
    for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.message
    return { fieldErrors: fe }
  }
  const e = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.from('exercises').insert({
    org_id: ctx.org.id,
    name: e.name,
    muscle_group: e.muscleGroup || null,
    equipment: e.equipment || null,
    video_url: e.videoUrl ?? null,
    instructions: e.instructions || null,
  })
  if (error) return { message: dbMessage(error) }
  revalidatePath(`/${slug}/admin/rutinas`, 'layout')
  return { ok: true, message: `"${e.name}" quedó en la biblioteca.` }
}

// ---------------------------------------------------------------------
// Asignar rutina a un alumno
// ---------------------------------------------------------------------
export async function assignProgram(slug: string, memberId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await coach(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const programId = String(form.get('programId') ?? '')
  if (!programId) return { fieldErrors: { programId: 'Elegí una rutina' } }
  const startsOn = String(form.get('startsOn') ?? '') || undefined
  const supabase = await createClient()
  await supabase.from('program_assignments').update({ status: 'archived' }).eq('member_id', memberId).eq('status', 'active')
  const { error } = await supabase.from('program_assignments').insert({
    org_id: ctx.org.id,
    program_id: programId,
    member_id: memberId,
    trainer_id: ctx.staff.id,
    ...(startsOn ? { starts_on: startsOn } : {}),
  })
  if (error) return { message: dbMessage(error) }
  revalidatePath(`/${slug}/admin/alumnos`, 'layout')
  return { ok: true, message: 'Rutina asignada: el alumno ya la ve en "Entrenar".' }
}

// ---------------------------------------------------------------------
// Asistencia a clases
// ---------------------------------------------------------------------
export async function markAttendance(slug: string, bookingId: string, status: 'checked_in' | 'no_show' | 'booked'): Promise<void> {
  const ctx = await getAdminContext(slug)
  if (!ctx) return
  const supabase = await createClient()
  await supabase.rpc('mark_attendance', { p_booking: bookingId, p_status: status })
  revalidatePath(`/${slug}/admin/agenda`, 'layout')
  revalidatePath(`/${slug}/admin/mis-clases`)
}
