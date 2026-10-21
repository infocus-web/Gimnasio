import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrg } from '@/lib/member-context'
import type { Json } from '@/types/database.types'
import { buildPrompt, callAnthropic, routineRequestSchema, validateRoutine, type MachineInfo } from '@/features/floor/ai'

/**
 * "Sugerir con IA" (panel → Rutinas). Solo profesores o quien tenga training.manage_all
 * (lo valida la base en ai_routine_reserve). Máximo 20 por día por gimnasio.
 *   POST { org, goal, days, level, limitations?, machineIds? } → { programId, remaining }
 * Crea un BORRADOR (workout_programs.is_draft) que el profe revisa antes de asignar.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ error: 'BAD_REQUEST', message: 'Pedido inválido.' }, 400)
  }
  const parsed = routineRequestSchema.safeParse(body)
  if (!parsed.success) return json({ error: 'BAD_REQUEST', message: 'Revisá los datos del formulario.' }, 400)
  const input = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json({ error: 'UNAUTHORIZED', message: 'Tu sesión venció. Volvé a ingresar.' }, 401)
  const org = await getOrg(input.org)
  if (!org) return json({ error: 'FORBIDDEN', message: 'No tenés permiso para esta acción.' }, 403)

  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: 'AI_NOT_CONFIGURED', message: 'Falta conectar la IA (ANTHROPIC_API_KEY).' }, 503)
  }

  // 1. Reserva un uso del día (también chequea el permiso)
  const { data: reserve, error: reserveError } = await supabase.rpc('ai_routine_reserve', { p_org: org.id })
  if (reserveError) {
    const code = reserveError.message.trim()
    if (code === 'AI_DAILY_LIMIT') {
      return json({ error: code, message: 'Ya se usaron las 20 sugerencias de hoy en el gimnasio. Mañana se renuevan.' }, 429)
    }
    if (code === 'FORBIDDEN' || reserveError.code === '42501') {
      return json({ error: 'FORBIDDEN', message: 'Solo los profesores pueden pedir rutinas a la IA.' }, 403)
    }
    console.error('[ai/routine] reserve', reserveError.message)
    return json({ error: 'ERROR', message: 'Ocurrió un error. Probá de nuevo.' }, 500)
  }
  const ticket = Number((reserve as { ticket?: number } | null)?.ticket)
  const remaining = Number((reserve as { remaining?: number } | null)?.remaining ?? 0)
  // Devolver el uso lo hace SOLO el servidor (la base no deja que un usuario devuelva tickets):
  // acá es seguro porque el ticket es el que acabamos de reservar en este mismo pedido.
  const release = async () => {
    if (!Number.isFinite(ticket) || !process.env.SUPABASE_SECRET_KEY) return
    try {
      const { error } = await createAdminClient().rpc('ai_routine_release', { p_org: org.id, p_ticket: ticket })
      if (error) console.error('[ai/routine] release', error.message)
    } catch (e) {
      console.error('[ai/routine] release', e instanceof Error ? e.message : e)
    }
  }

  try {
    // 2. Catálogo REAL del gimnasio (la IA solo puede usar estos ids)
    const [{ data: exercises, error: exError }, { data: machines }] = await Promise.all([
      supabase
        .from('exercises')
        .select('id, name, muscle_group, equipment')
        .or(`org_id.eq.${org.id},org_id.is.null`)
        .order('muscle_group')
        .order('name')
        .limit(400),
      input.machineIds.length
        ? supabase.from('machines').select('id, name, machine_exercises(exercise_id)').eq('org_id', org.id).in('id', input.machineIds)
        : Promise.resolve({ data: [] as { id: string; name: string; machine_exercises: unknown }[] }),
    ])
    if (exError || !exercises?.length) {
      await release()
      return json({ error: 'NO_CATALOG', message: 'La biblioteca de ejercicios está vacía. Cargá ejercicios primero.' }, 400)
    }
    const machineInfo: MachineInfo[] = (machines ?? []).map((m) => ({
      name: m.name,
      exerciseIds: ((m.machine_exercises ?? []) as { exercise_id: string }[]).map((x) => x.exercise_id),
    }))

    // 3. IA
    const { system, user: prompt } = buildPrompt(input, exercises, machineInfo)
    let text: string
    try {
      text = await callAnthropic(system, prompt)
    } catch (e) {
      console.error('[ai/routine] anthropic', e instanceof Error ? e.message : e)
      await release()
      return json({ error: 'AI_UNAVAILABLE', message: 'La IA no respondió. Probá de nuevo en un rato (no se descontó del límite).' }, 502)
    }

    // 4. Validación estricta contra el catálogo
    const draft = validateRoutine(text, input, new Set(exercises.map((e) => e.id)))
    if (!draft) {
      await release()
      return json({ error: 'AI_INVALID', message: 'La IA devolvió una rutina que no se pudo usar. Probá de nuevo (no se descontó del límite).' }, 502)
    }

    // 5. Borrador
    const { data: programId, error: draftError } = await supabase.rpc('ai_routine_create_draft', {
      p_org: org.id,
      p_ticket: ticket,
      p_payload: draft as unknown as Json,
    })
    if (draftError || !programId) {
      console.error('[ai/routine] draft', draftError?.message)
      await release()
      return json({ error: 'ERROR', message: 'No se pudo guardar el borrador. Probá de nuevo.' }, 500)
    }
    return json({ programId, remaining })
  } catch (e) {
    console.error('[ai/routine]', e instanceof Error ? e.message : e)
    await release()
    return json({ error: 'ERROR', message: 'Ocurrió un error. Probá de nuevo.' }, 500)
  }
}
