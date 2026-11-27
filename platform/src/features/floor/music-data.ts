import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import { cleanMusicState, type MusicState, type MusicTrack } from '@/features/screens/music'

/** Estado de la música + lista de temas para los paneles (Pantallas, Pizarra, Recepción). */
export async function loadMusic(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string): Promise<{ state: MusicState; tracks: MusicTrack[] } | null> {
  const [status, list] = await Promise.all([
    supabase.rpc('music_status', { p_org: orgId }),
    supabase.from('music_tracks').select('id, title, duration_s, active').eq('org_id', orgId).order('sort').order('created_at'),
  ])
  if (status.error) return null
  return { state: cleanMusicState(status.data), tracks: (list.data ?? []) as MusicTrack[] }
}
