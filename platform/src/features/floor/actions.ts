'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAdminContext } from '@/features/admin/context'
import { dbMessage, ERRORS, type ActionState } from '@/features/admin/errors'

const FLOOR_ERRORS = {
  NAME_REQUIRED: 'Poné el nombre de la máquina.',
  TOO_MANY_EXERCISES: 'Elegí hasta 20 ejercicios por máquina.',
  EXERCISE_NOT_FOUND: 'Uno de los ejercicios ya no existe. Recargá la página.',
  MACHINE_NOT_FOUND: 'No encontramos esa máquina.',
  MESSAGE_TOO_LONG: 'El mensaje puede tener hasta 280 letras.',
} as const satisfies Record<string, string>

function msg(error: { message: string; code?: string; hint?: string | null }) {
  return (FLOOR_ERRORS as Record<string, string | undefined>)[error.message.trim()] ?? dbMessage(error)
}

async function floorCtx(slug: string) {
  const ctx = await getAdminContext(slug)
  if (!ctx) return null
  return ctx.staff.role === 'trainer' || ctx.can('training.manage_all') ? ctx : null
}

async function tvCtx(slug: string) {
  const ctx = await getAdminContext(slug)
  if (!ctx) return null
  return ctx.can('training.manage_all') || ctx.can('org.manage') ? ctx : null
}

// ---------------------------------------------------------------------
// Máquinas
// ---------------------------------------------------------------------
const machineSchema = z.object({
  name: z.string().trim().min(1, 'Poné el nombre de la máquina').max(80, 'Máximo 80 letras'),
  area: z.string().trim().max(60, 'Máximo 60 letras').optional(),
  photo_url: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || /^https:\/\/\S+$/.test(v), 'Pegá un link que empiece con https://')
    .optional(),
})

export async function saveMachine(slug: string, machineId: string | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await floorCtx(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const parsed = machineSchema.safeParse({
    name: String(form.get('name') ?? ''),
    area: String(form.get('area') ?? ''),
    photo_url: String(form.get('photo_url') ?? ''),
  })
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message
    return { fieldErrors }
  }
  const exerciseIds = form
    .getAll('exercise')
    .map(String)
    .filter((v) => /^[0-9a-f-]{36}$/.test(v))
  if (exerciseIds.length > 20) return { message: FLOOR_ERRORS.TOO_MANY_EXERCISES }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('machine_save', {
    p_org: ctx.org.id,
    p_id: machineId,
    p_name: parsed.data.name,
    p_area: parsed.data.area || null,
    p_photo_url: parsed.data.photo_url || null,
    p_active: machineId ? form.get('active') === 'on' : true,
    p_exercise_ids: exerciseIds,
  })
  if (error || !data) return { message: error ? msg(error) : 'Ocurrió un error.' }
  revalidatePath(`/${slug}/admin/maquinas`, 'layout')
  if (!machineId) redirect(`/${slug}/admin/maquinas/${data}?nueva=1` as Route)
  return { ok: true, message: 'Máquina guardada.' }
}

// ---------------------------------------------------------------------
// Pantalla de TV
// ---------------------------------------------------------------------
export async function linkTv(slug: string, _prev: ActionState): Promise<ActionState> {
  const ctx = await tvCtx(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('floor_tv_link', { p_org: ctx.org.id })
  if (error || !data) return { message: error ? msg(error) : 'Ocurrió un error.' }
  revalidatePath(`/${slug}/admin/maquinas`)
  return {
    ok: true,
    secret: data,
    message: 'Abrí este link en el navegador del TV (o escaneá el código con un celular conectado al TV). Se muestra una sola vez.',
  }
}

export async function unlinkTv(slug: string, _prev?: ActionState): Promise<ActionState> {
  const ctx = await tvCtx(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { error } = await supabase.rpc('floor_tv_unlink', { p_org: ctx.org.id })
  if (error) return { message: msg(error) }
  revalidatePath(`/${slug}/admin/maquinas`)
  return { ok: true, message: 'La TV quedó desvinculada.' }
}

export async function saveTvSettings(slug: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await tvCtx(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const message = String(form.get('message') ?? '').trim()
  if (message.length > 280) return { fieldErrors: { message: FLOOR_ERRORS.MESSAGE_TOO_LONG } }
  const supabase = await createClient()
  const { error } = await supabase.rpc('floor_tv_save', {
    p_org: ctx.org.id,
    p_ranking: form.get('ranking') === 'on',
    p_message: message || null,
  })
  if (error) return { message: msg(error) }
  revalidatePath(`/${slug}/admin/maquinas`)
  return { ok: true, message: 'Listo: la TV lo muestra en menos de un minuto.' }
}

// ---------------------------------------------------------------------
// Rutina sugerida por IA: el profe la revisó y la aprueba
// ---------------------------------------------------------------------
export async function approveDraft(slug: string, programId: string, _prev?: ActionState): Promise<ActionState> {
  const ctx = await floorCtx(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('workout_programs')
    .update({ is_draft: false })
    .eq('id', programId)
    .eq('org_id', ctx.org.id)
    .select('id')
  if (error) return { message: msg(error) }
  if (!data?.length) return { message: ERRORS.FORBIDDEN }
  revalidatePath(`/${slug}/admin/rutinas`, 'layout')
  return { ok: true, message: 'Rutina aprobada: ya la podés asignar a tus alumnos.' }
}
