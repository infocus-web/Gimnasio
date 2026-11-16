'use server'

import { revalidatePath } from 'next/cache'
import { getAdminContext } from '@/features/admin/context'
import { ERRORS, type ActionState } from '@/features/admin/errors'
import { createClient } from '@/lib/supabase/server'

type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }

/** Clave para el programa de cámaras de la PC del gimnasio (se muestra una sola vez). */
export async function createCameraKey(slug: string, _prev: ActionState): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('org.manage')) return { message: ERRORS.FORBIDDEN }
  const supabase = (await createClient()) as unknown as Rpc
  const { data, error } = await supabase.rpc('camera_key_create', { p_org: ctx.org.id })
  if (error || typeof data !== 'string') return { message: 'No se pudo generar la clave. Probá de nuevo.' }
  revalidatePath(`/${slug}/admin/camaras`)
  return {
    ok: true,
    secret: data,
    message: 'Pegá esta clave en el programa de cámaras de la PC. No se vuelve a mostrar (si la perdés, generá otra).',
  }
}

/**
 * Dirección para ver una cámara en vivo: el túnel de la PC del gimnasio + un pase firmado por la base
 * que solo sirve para esa cámara y vence en 4 horas. Solo para quien tiene permiso de ver cámaras.
 */
export async function cameraStreamUrl(slug: string, stream: string): Promise<string | null> {
  if (!/^[a-z0-9]{1,16}(_hd)?$/.test(stream)) return null
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('cameras.view')) return null
  const supabase = await createClient()
  const db = supabase as unknown as Rpc & {
    from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: { tunnel_url: string | null } | null }> } } }
  }
  const { data: site } = await db.from('camera_sites').select('tunnel_url').eq('org_id', ctx.org.id).maybeSingle()
  if (!site?.tunnel_url) return null
  const { data: token, error } = await db.rpc('camera_token', { p_org: ctx.org.id, p_stream: stream, p_minutes: 240 })
  if (error || typeof token !== 'string') return null
  const base = site.tunnel_url.replace(/^https:/, 'wss:')
  return `${base}/api/ws?src=${encodeURIComponent(stream)}&token=${encodeURIComponent(token)}`
}
