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
  // Alumnos elegidos al crear: se preseleccionan en el armador (se asigna al final, con la rutina ya cargada)
  const uuid = z.uuid()
  const para =
    form.get('forAll') === '1'
      ? 'todos'
      : [...new Set(form.getAll('memberId').map(String))].filter((v) => uuid.safeParse(v).success).slice(0, 200).join(',')
  redirect(`/${slug}/admin/rutinas/${data.id}${para ? `?para=${para}` : ''}` as Route)
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

export async function deleteProgram(slug: string, programId: string, _prev?: ActionState): Promise<ActionState> {
  const ctx = await coach(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  // No dejamos a nadie sin rutina por error: primero hay que quitársela a los alumnos.
  const { count, error: countError } = await supabase
    .from('program_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('program_id', programId)
    .eq('org_id', ctx.org.id)
    .eq('status', 'active')
  if (countError) return { message: dbMessage(countError) }
  if (count) {
    return { message: `La usan ${count} ${count === 1 ? 'alumno' : 'alumnos'}. Quitásela desde su ficha antes de borrarla.` }
  }
  // Días y ejercicios se borran en cascada; las sesiones ya registradas quedan guardadas.
  const { data, error } = await supabase
    .from('workout_programs')
    .delete()
    .eq('id', programId)
    .eq('org_id', ctx.org.id)
    .select('id')
  if (error) return { message: dbMessage(error) }
  if (!data?.length) return { message: ERRORS.FORBIDDEN }
  revalidatePath(`/${slug}/admin/rutinas`, 'layout')
  redirect(`/${slug}/admin/rutinas` as Route)
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

export async function deleteWorkoutDay(slug: string, programId: string, workoutId: string, _prev?: ActionState): Promise<ActionState> {
  const ctx = await coach(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { error } = await supabase.from('program_workouts').delete().eq('id', workoutId)
  if (error) return { message: dbMessage(error) }
  revalidatePath(`/${slug}/admin/rutinas/${programId}`)
  return { ok: true, message: 'Día borrado.' }
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

export async function deleteProgramExercise(slug: string, programId: string, rowId: string, _prev?: ActionState): Promise<ActionState> {
  const ctx = await coach(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { error } = await supabase.from('program_exercises').delete().eq('id', rowId)
  if (error) return { message: dbMessage(error) }
  revalidatePath(`/${slug}/admin/rutinas/${programId}`)
  return { ok: true, message: 'Ejercicio quitado.' }
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
/** Asigna una rutina a varios alumnos a la vez (desde la pantalla de la rutina). */
export async function assignProgramToMany(slug: string, programId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await coach(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const uuid = z.uuid()
  const ids = [...new Set(form.getAll('memberId').map(String))].filter((v) => uuid.safeParse(v).success)
  if (!ids.length) return { fieldErrors: { memberId: 'Elegí al menos un alumno' } }
  const startsOn = String(form.get('startsOn') ?? '') || undefined
  const supabase = await createClient()

  const { data: program } = await supabase.from('workout_programs').select('is_draft').eq('id', programId).eq('org_id', ctx.org.id).maybeSingle()
  if (!program) return { message: ERRORS.FORBIDDEN }
  if (program.is_draft) return { message: ERRORS.PROGRAM_IS_DRAFT }

  // Solo alumnos que este profe puede ver (los suyos, o todos si administra el entrenamiento)
  let allowedQ = supabase.from('coach_client_overview').select('member_id').eq('org_id', ctx.org.id).in('member_id', ids)
  if (!ctx.can('training.manage_all')) allowedQ = allowedQ.eq('trainer_id', ctx.staff.id)
  const { data: allowed, error: allowedError } = await allowedQ
  if (allowedError) return { message: dbMessage(allowedError) }
  const allowedIds = (allowed ?? []).map((r) => r.member_id as string)
  if (!allowedIds.length) return { message: ERRORS.FORBIDDEN }

  // Los que ya la tienen activa no se tocan
  const { data: already } = await supabase
    .from('program_assignments')
    .select('member_id')
    .eq('org_id', ctx.org.id)
    .eq('program_id', programId)
    .eq('status', 'active')
    .in('member_id', allowedIds)
  const has = new Set((already ?? []).map((r) => r.member_id as string))
  const targets = allowedIds.filter((id) => !has.has(id))
  if (!targets.length) return { ok: true, message: 'Los alumnos elegidos ya tienen esta rutina.' }

  const archived = await supabase
    .from('program_assignments')
    .update({ status: 'archived' })
    .eq('org_id', ctx.org.id)
    .eq('status', 'active')
    .in('member_id', targets)
  if (archived.error) return { message: dbMessage(archived.error) }
  const { error } = await supabase.from('program_assignments').insert(
    targets.map((memberId) => ({
      org_id: ctx.org.id,
      program_id: programId,
      member_id: memberId,
      trainer_id: ctx.staff.id,
      ...(startsOn ? { starts_on: startsOn } : {}),
    })),
  )
  if (error) return { message: dbMessage(error) }
  revalidatePath(`/${slug}/admin`, 'layout')
  const n = targets.length
  return { ok: true, message: `Rutina asignada a ${n} ${n === 1 ? 'alumno' : 'alumnos'}: ya la ven en "Entrenar".` }
}

export async function assignProgram(slug: string, memberId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await coach(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const programId = String(form.get('programId') ?? '')
  if (!programId) return { fieldErrors: { programId: 'Elegí una rutina' } }
  const startsOn = String(form.get('startsOn') ?? '') || undefined
  const supabase = await createClient()
  // Antes de archivar la rutina actual: si la nueva es un borrador de la IA, no se toca nada
  const { data: program } = await supabase.from('workout_programs').select('is_draft').eq('id', programId).maybeSingle()
  if (!program) return { message: ERRORS.FORBIDDEN }
  if (program.is_draft) return { message: ERRORS.PROGRAM_IS_DRAFT }
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
const ATTENDANCE_ERRORS: Record<string, string> = {
  SESSION_NOT_STARTED: 'La asistencia se marca desde 30 minutos antes de la clase.',
  BOOKING_NOT_FOUND: 'Esa reserva ya no existe. Recargá la página.',
  BOOKING_NOT_CANCELABLE: 'Esa reserva fue cancelada: no se puede marcar asistencia.',
  INVALID_STATUS: 'Estado de asistencia inválido.',
}

export async function markAttendance(
  slug: string,
  bookingId: string,
  status: 'checked_in' | 'no_show' | 'booked',
  _prev?: ActionState,
): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { error } = await supabase.rpc('mark_attendance', { p_booking: bookingId, p_status: status })
  if (error) return { message: ATTENDANCE_ERRORS[error.message.trim()] ?? dbMessage(error) }
  revalidatePath(`/${slug}/admin/agenda`, 'layout')
  revalidatePath(`/${slug}/admin/mis-clases`)
  return { ok: true, message: status === 'checked_in' ? 'Presente.' : status === 'no_show' ? 'Marcado como ausente.' : 'Asistencia desmarcada.' }
}
