import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

/** Bucket privado con la foto y el apto físico de cada socio (ver migración 0026). */
export const MEMBER_BUCKET = 'socios'

type Db = SupabaseClient<Database>

/** Las fotos viejas eran URL públicas; las nuevas, una ruta dentro del bucket privado. */
export const isStoragePath = (p: string | null | undefined): p is string => !!p && !/^https?:\/\//.test(p)

/** Link firmado (vence) para mostrar un archivo privado. */
export async function signedUrl(supabase: Db, path: string | null | undefined, seconds = 600) {
  if (!path) return null
  if (!isStoragePath(path)) return path
  const { data } = await supabase.storage.from(MEMBER_BUCKET).createSignedUrl(path, seconds)
  return data?.signedUrl ?? null
}

/** Guarda la foto (data URL JPEG de la webcam) y la deja como foto del socio. Devuelve un error legible o null. */
export async function saveMemberPhoto(supabase: Db, orgId: string, memberId: string, dataUrl: string) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m?.[1]) return 'La foto no tiene un formato válido.'
  const bytes = Buffer.from(m[1], 'base64')
  if (bytes.length > 2_000_000) return 'La foto es demasiado pesada.'
  const path = `${orgId}/${memberId}/foto-${Date.now()}.jpg`
  const up = await supabase.storage.from(MEMBER_BUCKET).upload(path, bytes, { contentType: 'image/jpeg' })
  if (up.error) {
    console.error('[saveMemberPhoto] upload', up.error.message)
    return 'No se pudo guardar la foto.'
  }
  const { data: prev } = await supabase.from('members').select('photo_url').eq('id', memberId).maybeSingle()
  const { error } = await supabase.from('members').update({ photo_url: path }).eq('id', memberId)
  if (error) {
    await supabase.storage.from(MEMBER_BUCKET).remove([path])
    return 'No se pudo guardar la foto.'
  }
  if (isStoragePath(prev?.photo_url)) await supabase.storage.from(MEMBER_BUCKET).remove([prev.photo_url])
  return null
}

/** Borra todos los archivos del socio (al eliminarlo). */
export async function removeMemberFiles(supabase: Db, orgId: string, memberId: string) {
  const folder = `${orgId}/${memberId}`
  const { data } = await supabase.storage.from(MEMBER_BUCKET).list(folder, { limit: 100 })
  if (data?.length) await supabase.storage.from(MEMBER_BUCKET).remove(data.map((f) => `${folder}/${f.name}`))
}
