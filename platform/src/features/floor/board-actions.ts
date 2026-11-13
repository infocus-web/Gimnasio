'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAdminContext } from '@/features/admin/context'
import { dbMessage, ERRORS, type ActionState } from '@/features/admin/errors'
import { BOARD_BUCKET, cleanMedia, cleanTimer, type BoardMedia, type BoardTimer } from '@/features/screens/board'
import type { Json } from '@/types/database.types'

const BOARD_ERRORS: Record<string, string> = {
  BOARD_NOT_FOUND: 'Esa pizarra ya no existe. Recargá la página.',
  BOARD_NOT_LIVE: 'La pizarra ya no está en la TV.',
}

function msg(error: { message: string; code?: string; hint?: string | null }) {
  return BOARD_ERRORS[error.message.trim()] ?? dbMessage(error)
}

/** Profes y administración */
async function boardCtx(slug: string) {
  const ctx = await getAdminContext(slug)
  if (!ctx) return null
  const ok =
    ctx.staff.role === 'trainer' || ctx.can('schedule.own') || ctx.can('training.manage_all') || ctx.can('org.manage')
  return ok ? ctx : null
}

function done(slug: string, message?: string): ActionState {
  revalidatePath(`/${slug}/admin/mis-clases/pizarra`)
  return { ok: true, message }
}

export interface BoardInput {
  title: string
  body: string
  media: BoardMedia[]
  timer: BoardTimer | null
}

/** Crear (id = null) o editar una pizarra. */
export async function saveBoard(slug: string, id: string | null, v: BoardInput): Promise<ActionState & { id?: string }> {
  const ctx = await boardCtx(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const title = String(v.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
  if (!title) return { fieldErrors: { title: 'Poné un título (ej.: "Funcional · Martes")' } }
  const body = String(v.body ?? '').trim().slice(0, 2000) || null
  const row = { title, body, media: cleanMedia(v.media, `${ctx.org.id}/`) as unknown as Json, timer: cleanTimer(v.timer) as unknown as Json | null, updated_at: new Date().toISOString() }
  const supabase = await createClient()

  if (id) {
    // Archivos que se sacaron de la pizarra: se borran del almacenamiento
    const { data: prev } = await supabase.from('class_boards').select('media').eq('id', id).eq('org_id', ctx.org.id).maybeSingle()
    const { error } = await supabase.from('class_boards').update(row).eq('id', id).eq('org_id', ctx.org.id)
    if (error) return { message: msg(error) }
    const keep = new Set((row.media as unknown as BoardMedia[]).map((m) => m.path))
    const gone = cleanMedia(prev?.media, `${ctx.org.id}/`).filter((m) => !keep.has(m.path)).map((m) => m.path)
    if (gone.length) await supabase.storage.from(BOARD_BUCKET).remove(gone)
    return { ...done(slug, 'Pizarra guardada.'), id }
  }
  const { data, error } = await supabase
    .from('class_boards')
    .insert({ ...row, org_id: ctx.org.id, staff_id: ctx.staff.id })
    .select('id')
    .single()
  if (error || !data) return { message: error ? msg(error) : 'No se pudo guardar.' }
  return { ...done(slug, 'Pizarra creada.'), id: data.id }
}

export async function deleteBoard(slug: string, id: string): Promise<ActionState> {
  const ctx = await boardCtx(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { data, error } = await supabase.from('class_boards').delete().eq('id', id).eq('org_id', ctx.org.id).select('media').maybeSingle()
  if (error) return { message: msg(error) }
  const files = cleanMedia(data?.media, `${ctx.org.id}/`).map((m) => m.path)
  if (files.length) await supabase.storage.from(BOARD_BUCKET).remove(files)
  return done(slug, 'Pizarra borrada.')
}

/** Mostrarla en la TV durante unos minutos (después la TV vuelve sola a lo general). */
export async function showBoard(slug: string, id: string, minutes: number): Promise<ActionState> {
  const ctx = await boardCtx(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { error } = await supabase.rpc('tv_board_show', { p_board: id, p_minutes: Math.round(minutes) || 60 })
  if (error) return { message: msg(error) }
  return done(slug, 'Tu pizarra ya está en la TV.')
}

export async function hideBoard(slug: string): Promise<ActionState> {
  const ctx = await boardCtx(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { error } = await supabase.rpc('tv_board_hide', { p_org: ctx.org.id })
  if (error) return { message: msg(error) }
  return done(slug, 'La TV volvió a la pantalla general.')
}

export async function boardTimer(slug: string, action: 'start' | 'pause' | 'reset'): Promise<ActionState & { state?: unknown }> {
  const ctx = await boardCtx(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  if (!['start', 'pause', 'reset'].includes(action)) return { message: 'Acción inválida.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('tv_board_timer', { p_org: ctx.org.id, p_action: action })
  if (error) return { message: msg(error) }
  revalidatePath(`/${slug}/admin/mis-clases/pizarra`)
  return { ok: true, state: data }
}

const QUICK_TITLE = 'Temporizador'

/**
 * Temporizador rápido: sin preparar una pizarra. Usa (o crea) la pizarra "Temporizador" del profe,
 * le pone el temporizador elegido y la muestra en la TV. Después se maneja con Iniciar / Pausar.
 */
export async function quickTimer(slug: string, timer: BoardTimer, minutes: number): Promise<ActionState> {
  const ctx = await boardCtx(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const t = cleanTimer(timer)
  if (!t) return { message: 'Elegí el tipo de temporizador.' }
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('class_boards')
    .select('id')
    .eq('org_id', ctx.org.id)
    .eq('staff_id', ctx.staff.id)
    .eq('title', QUICK_TITLE)
    .is('body', null)
    .limit(1)
    .maybeSingle()
  let id = existing?.id ?? null
  if (id) {
    const { error } = await supabase
      .from('class_boards')
      .update({ timer: t as unknown as Json, media: [] as unknown as Json, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return { message: msg(error) }
  } else {
    const { data, error } = await supabase
      .from('class_boards')
      .insert({ org_id: ctx.org.id, staff_id: ctx.staff.id, title: QUICK_TITLE, body: null, media: [] as unknown as Json, timer: t as unknown as Json })
      .select('id')
      .single()
    if (error || !data) return { message: error ? msg(error) : 'No se pudo crear.' }
    id = data.id
  }
  const { error } = await supabase.rpc('tv_board_show', { p_board: id, p_minutes: Math.round(minutes) || 60 })
  if (error) return { message: msg(error) }
  return done(slug, 'Temporizador en la TV. Tocá Iniciar cuando arranquen.')
}
