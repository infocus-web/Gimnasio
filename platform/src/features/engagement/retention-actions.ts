'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAdminContext } from '@/features/admin/context'
import { dbMessage, formObject, type ActionState } from '@/features/admin/errors'
import { retentionErrorText } from './retention'

const FORBIDDEN: ActionState = { message: 'No tenés permiso para esta acción. Los retos y las encuestas los maneja el dueño o un administrador.' }

async function manager(slug: string) {
  const ctx = await getAdminContext(slug)
  if (!ctx || !ctx.can('members.write')) return null
  if (!ctx.can('automations.manage') && !ctx.can('org.manage')) return null
  return ctx
}

const errorText = (e: { message: string; code?: string; hint?: string | null }) => retentionErrorText(e) ?? dbMessage(e)

// ---------------------------------------------------------------------
// Encuestas
// ---------------------------------------------------------------------
export async function setNpsEnabled(slug: string, enabled: boolean): Promise<ActionState> {
  const ctx = await manager(slug)
  if (!ctx) return FORBIDDEN
  const supabase = await createClient()
  const { error } = await supabase.rpc('nps_set_enabled', { p_org: ctx.org.id, p_enabled: enabled })
  if (error) return { message: errorText(error) }
  revalidatePath(`/${slug}/admin/comunicacion/encuestas`)
  return { ok: true, message: enabled ? 'Encuestas activadas.' : 'Encuestas pausadas.' }
}

// ---------------------------------------------------------------------
// Retos
// ---------------------------------------------------------------------
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
const challengeSchema = z
  .object({
    title: z.string().trim().min(3, 'Mínimo 3 letras').max(80, 'Máximo 80 caracteres'),
    description: z.string().trim().max(500, 'Máximo 500 caracteres').optional().default(''),
    metric: z.enum(['visits', 'workouts', 'volume_kg', 'classes'], { message: 'Elegí qué se mide' }),
    goal: z
      .string()
      .trim()
      .transform((v) => Number(v.replace(/\./g, '').replace(',', '.')))
      .pipe(z.number({ message: 'Poné la meta' }).positive('La meta tiene que ser mayor a 0').max(10_000_000)),
    starts_on: ymd,
    ends_on: ymd,
    reward_days: z.coerce.number().int().min(0, 'Entre 0 y 30').max(30, 'Entre 0 y 30'),
    show_ranking: z.string().optional(),
  })
  .refine((v) => v.ends_on >= v.starts_on, { path: ['ends_on'], message: 'Termina antes de empezar' })
  .refine((v) => (Date.parse(v.ends_on) - Date.parse(v.starts_on)) / 86_400_000 <= 92, {
    path: ['ends_on'],
    message: 'Máximo 3 meses',
  })

export async function saveChallenge(slug: string, id: string | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await manager(slug)
  if (!ctx) return FORBIDDEN
  const parsed = challengeSchema.safeParse(formObject(form))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message
    return { message: 'Revisá los datos marcados.', fieldErrors }
  }
  const c = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('challenge_save', {
    p_org: ctx.org.id,
    p_id: id,
    p_title: c.title,
    p_description: c.description || null,
    p_metric: c.metric,
    p_goal: c.goal,
    p_starts_on: c.starts_on,
    p_ends_on: c.ends_on,
    p_reward_days: c.reward_days,
    p_show_ranking: c.show_ranking === '1',
  })
  if (error) return { message: errorText(error) }
  revalidatePath(`/${slug}/admin/comunicacion/retos`)
  return { ok: true, message: id ? 'Reto actualizado.' : 'Reto creado. Los socios ya lo ven en la app (Yo → Retos).' }
}

export async function cancelChallenge(slug: string, id: string): Promise<ActionState> {
  const ctx = await manager(slug)
  if (!ctx) return FORBIDDEN
  const supabase = await createClient()
  const { error } = await supabase.rpc('challenge_cancel', { p_challenge: id })
  if (error) return { message: errorText(error) }
  revalidatePath(`/${slug}/admin/comunicacion/retos`)
  return { ok: true, message: 'Reto cancelado.' }
}

export async function settleChallenge(slug: string, id: string): Promise<ActionState> {
  const ctx = await manager(slug)
  if (!ctx) return FORBIDDEN
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('challenge_settle', { p_challenge: id })
  if (error) return { message: errorText(error) }
  revalidatePath(`/${slug}/admin/comunicacion/retos`)
  const n = Number(data ?? 0)
  return { ok: true, message: n === 1 ? 'Reto cerrado: 1 socio llegó a la meta.' : `Reto cerrado: ${n} socios llegaron a la meta.` }
}
