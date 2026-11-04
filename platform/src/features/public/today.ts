import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { PublicToday } from './today-types'

/** Datos de hoy para la web pública. Ver public_today() en 0037. */
export async function getPublicToday(slug: string): Promise<PublicToday | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('public_today', { p_slug: slug })
  if (error || !data) {
    if (error) console.error('[hoy]', error.message)
    return null
  }
  return data as unknown as PublicToday
}
