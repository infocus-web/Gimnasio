/** Música de la TV de la sala (0065): bucket público `musica`, ruta <org_id>/<uuid>.mp3|m4a */
export const MUSIC_BUCKET = 'musica'
export const MUSIC_MAX_MB = 25

export interface MusicState {
  playing: boolean
  volume: number
  shuffle: boolean
  seq?: number
  now_id?: string | null
  now_title?: string | null
  tv_linked?: boolean
}

export interface MusicTrack {
  id: string
  title: string
  duration_s: number | null
  active: boolean
}

export function musicUrl(path: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return null
  return `${base}/storage/v1/object/public/${MUSIC_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`
}

/** Lo que devuelve music_status / music_control, limpio */
export function cleanMusicState(raw: unknown): MusicState {
  const m = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const vol = Number(m.volume)
  return {
    playing: m.playing === true,
    volume: Number.isFinite(vol) ? Math.min(100, Math.max(0, Math.round(vol))) : 70,
    shuffle: m.shuffle === true,
    seq: Number(m.seq) || 0,
    now_id: typeof m.now_id === 'string' ? m.now_id : null,
    now_title: typeof m.now_title === 'string' ? m.now_title : null,
    tv_linked: m.tv_linked !== false,
  }
}

export const fmtDuration = (s: number | null) => (s == null ? '' : `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`)
