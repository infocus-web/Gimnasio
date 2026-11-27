'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAdminContext } from '@/features/admin/context'
import { dbMessage, ERRORS, type ActionState } from '@/features/admin/errors'
import { cleanMusicState, MUSIC_BUCKET, type MusicState } from '@/features/screens/music'

const MAX_TRACKS = 200
const MUSIC_ERRORS: Record<string, string> = {
  TRACK_NOT_FOUND: 'Ese tema ya no está. Recargá la página.',
  BAD_ACTION: 'Acción inválida.',
}
const msg = (e: { message: string; code?: string }) => MUSIC_ERRORS[e.message.trim()] ?? dbMessage(e)

function refresh(slug: string) {
  for (const p of ['pantallas', 'mis-clases/pizarra', 'recepcion']) revalidatePath(`/${slug}/admin/${p}`)
}

/** Cualquier persona del equipo: reproducir, pausar, siguiente, anterior, elegir tema, volumen, aleatorio. */
export async function musicControl(
  slug: string,
  action: 'play' | 'pause' | 'next' | 'prev' | 'track' | 'volume' | 'shuffle',
  value?: string,
): Promise<ActionState & { state?: MusicState }> {
  const ctx = await getAdminContext(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('music_control', { p_org: ctx.org.id, p_action: action, p_value: value ?? null })
  if (error) return { message: msg(error) }
  return { ok: true, state: cleanMusicState(data) }
}

async function adminCtx(slug: string) {
  const ctx = await getAdminContext(slug)
  return ctx?.can('org.manage') ? ctx : null
}

/** El archivo ya se subió al bucket desde el navegador: se registra al final de la lista. */
export async function addMusicTrack(slug: string, path: string, title: string, durationS: number | null): Promise<ActionState> {
  const ctx = await adminCtx(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  if (!new RegExp(`^${ctx.org.id}/[0-9a-f-]{36}\\.(mp3|m4a)$`).test(path)) return { message: 'El archivo no es válido.' }
  const clean = String(title ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Tema'
  const dur = Number.isFinite(durationS) && durationS != null ? Math.max(0, Math.min(86400, Math.round(durationS))) : null
  const supabase = await createClient()
  const { data: last, count } = await supabase
    .from('music_tracks')
    .select('sort', { count: 'exact' })
    .eq('org_id', ctx.org.id)
    .order('sort', { ascending: false })
    .limit(1)
  if ((count ?? 0) >= MAX_TRACKS) {
    await supabase.storage.from(MUSIC_BUCKET).remove([path])
    return { message: `Máximo ${MAX_TRACKS} temas. Borrá alguno para agregar otro.` }
  }
  const { error } = await supabase
    .from('music_tracks')
    .insert({ org_id: ctx.org.id, path, title: clean, duration_s: dur, sort: (last?.[0]?.sort ?? 0) + 1 })
  if (error) {
    await supabase.storage.from(MUSIC_BUCKET).remove([path])
    return { message: msg(error) }
  }
  refresh(slug)
  return { ok: true, message: 'Tema agregado.' }
}

export async function deleteMusicTrack(slug: string, id: string): Promise<ActionState> {
  const ctx = await adminCtx(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { data: row, error } = await supabase.from('music_tracks').delete().eq('id', id).eq('org_id', ctx.org.id).select('path').maybeSingle()
  if (error) return { message: msg(error) }
  if (row?.path) await supabase.storage.from(MUSIC_BUCKET).remove([row.path])
  refresh(slug)
  return { ok: true, message: 'Tema borrado.' }
}

export async function toggleMusicTrack(slug: string, id: string, active: boolean): Promise<ActionState> {
  const ctx = await adminCtx(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { error } = await supabase.from('music_tracks').update({ active }).eq('id', id).eq('org_id', ctx.org.id)
  if (error) return { message: msg(error) }
  refresh(slug)
  return { ok: true, message: active ? 'El tema vuelve a sonar.' : 'Tema pausado: la TV lo saltea.' }
}

/** Mover un tema un lugar antes (-1) o después (+1). */
export async function moveMusicTrack(slug: string, id: string, dir: -1 | 1): Promise<ActionState> {
  const ctx = await adminCtx(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { data: rows, error } = await supabase.from('music_tracks').select('id').eq('org_id', ctx.org.id).order('sort').order('created_at')
  if (error) return { message: msg(error) }
  const ids = (rows ?? []).map((r) => r.id)
  const i = ids.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= ids.length) return { ok: true }
  ;[ids[i], ids[j]] = [ids[j]!, ids[i]!]
  const results = await Promise.all(ids.map((rid, n) => supabase.from('music_tracks').update({ sort: n + 1 }).eq('id', rid).eq('org_id', ctx.org.id)))
  const failed = results.find((r) => r.error)
  if (failed?.error) return { message: msg(failed.error) }
  refresh(slug)
  return { ok: true }
}
