'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAdminContext } from './context'
import { dbMessage, ERRORS, type ActionState } from './errors'
import { KIOSK_BUCKET } from './kiosk-slides'
import { isPromoOrientation, isPromoPosition, isPromoStyle } from '@/features/screens/promo'

const MAX_SLIDES = 30

async function guard(slug: string) {
  const ctx = await getAdminContext(slug)
  return ctx?.can('org.manage') ? ctx : null
}

function done(slug: string, message: string): ActionState {
  revalidatePath(`/${slug}/admin/pantallas`)
  return { ok: true, message }
}

/** La imagen ya se subió al bucket desde el navegador: se registra al final de la lista. */
export async function addKioskSlide(slug: string, path: string): Promise<ActionState> {
  const ctx = await guard(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  if (!new RegExp(`^${ctx.org.id}/[0-9a-f-]{36}\\.jpg$`).test(path)) return { message: 'La imagen no es válida.' }
  const supabase = await createClient()
  const { data: last, count } = await supabase
    .from('kiosk_slides')
    .select('sort', { count: 'exact' })
    .eq('org_id', ctx.org.id)
    .order('sort', { ascending: false })
    .limit(1)
  if ((count ?? 0) >= MAX_SLIDES) {
    await supabase.storage.from(KIOSK_BUCKET).remove([path])
    return { message: `Máximo ${MAX_SLIDES} imágenes. Borrá alguna para agregar otra.` }
  }
  const { error } = await supabase
    .from('kiosk_slides')
    .insert({ org_id: ctx.org.id, image_path: path, sort: (last?.[0]?.sort ?? 0) + 1 })
  if (error) {
    await supabase.storage.from(KIOSK_BUCKET).remove([path])
    return { message: dbMessage(error) }
  }
  return done(slug, 'Imagen agregada.')
}

export async function deleteKioskSlide(slug: string, id: string): Promise<ActionState> {
  const ctx = await guard(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from('kiosk_slides')
    .delete()
    .eq('id', id)
    .eq('org_id', ctx.org.id)
    .select('image_path')
    .maybeSingle()
  if (error) return { message: dbMessage(error) }
  if (row?.image_path) await supabase.storage.from(KIOSK_BUCKET).remove([row.image_path])
  return done(slug, 'Imagen borrada.')
}

export async function toggleKioskSlide(slug: string, id: string, active: boolean): Promise<ActionState> {
  const ctx = await guard(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { error } = await supabase.from('kiosk_slides').update({ active }).eq('id', id).eq('org_id', ctx.org.id)
  if (error) return { message: dbMessage(error) }
  return done(slug, active ? 'La tablet vuelve a mostrarla.' : 'Pausada: la tablet no la muestra.')
}

/** Mover una imagen un lugar antes (-1) o después (+1). Se renumera toda la lista. */
export async function moveKioskSlide(slug: string, id: string, dir: -1 | 1): Promise<ActionState> {
  const ctx = await guard(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { data: rows, error } = await supabase
    .from('kiosk_slides')
    .select('id')
    .eq('org_id', ctx.org.id)
    .order('sort')
    .order('created_at')
  if (error) return { message: dbMessage(error) }
  const ids = (rows ?? []).map((r) => r.id)
  const i = ids.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= ids.length) return { ok: true }
  ;[ids[i], ids[j]] = [ids[j]!, ids[i]!]
  const results = await Promise.all(
    ids.map((rid, n) => supabase.from('kiosk_slides').update({ sort: n + 1 }).eq('id', rid).eq('org_id', ctx.org.id)),
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) return { message: dbMessage(failed.error) }
  return done(slug, 'Orden guardado.')
}

/** Textos animados, estilo, posición y orientación de una imagen (0049). */
export async function updateKioskSlide(
  slug: string,
  id: string,
  v: { badge: string; title: string; subtitle: string; style: string; position: string; orientation: string },
): Promise<ActionState> {
  const ctx = await guard(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const clean = (s: string, max: number) => {
    const t = String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
    return t || null
  }
  if (!isPromoStyle(v.style) || !isPromoPosition(v.position) || !isPromoOrientation(v.orientation)) {
    return { message: 'Revisá las opciones elegidas.' }
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from('kiosk_slides')
    .update({
      badge: clean(v.badge, 30),
      title: clean(v.title, 80),
      subtitle: clean(v.subtitle, 160),
      style: v.style,
      text_position: v.position,
      orientation: v.orientation,
    })
    .eq('id', id)
    .eq('org_id', ctx.org.id)
  if (error) return { message: dbMessage(error) }
  return done(slug, 'Guardado. Llega a las pantallas en unos minutos.')
}
