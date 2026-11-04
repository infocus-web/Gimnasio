export interface PublicTodayClass {
  starts_at: string
  ends_at: string
  name: string
  color: string
  instructor: string
  room: string
  spots: number
  capacity: number
}

export interface PublicToday {
  status: 'ok' | 'off' | 'not_found'
  timezone?: string
  server_time?: string
  message?: string | null
  people?: number | null
  level?: 'closed' | 'quiet' | 'normal' | 'full' | null
  classes?: PublicTodayClass[]
}
