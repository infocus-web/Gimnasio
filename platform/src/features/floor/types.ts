/** Formas de lo que devuelven las funciones SQL de 0031 (machine_view, tv_feed, business_dashboard). */

export interface MachineSet {
  set: number
  reps: number | null
  weight_kg: number | null
}

export interface MachineExerciseView {
  id: string
  name: string
  muscle_group: string | null
  video_url: string | null
  instructions: string | null
  last: { performed_at: string; sets: MachineSet[] | null } | null
  best: { weight_kg: number; reps: number | null; performed_at: string } | null
  in_routine: {
    day_name: string
    day_index: number
    is_today: boolean
    target_sets: number | null
    target_reps: string | null
    target_weight_kg: number | null
    rest_seconds: number | null
    notes: string | null
  } | null
}

export interface MachineViewResult {
  status: 'ok' | 'not_found'
  gym?: string
  machine?: { name: string; area: string | null; photo_url: string | null; code: string }
  exercises?: MachineExerciseView[]
  member?: { first_name: string; has_program: boolean } | null
  signed_in?: boolean
}

export interface TvClass {
  starts_at: string
  ends_at: string
  name: string
  color: string
  instructor: string
  room: string
  capacity: number
  booked: number
}

export interface TvFeed {
  status: 'ok' | 'unauthorized'
  gym?: string
  timezone?: string
  server_time?: string
  occupancy?: number
  occupancy_source?: string
  occupancy_level?: 'closed' | 'quiet' | 'normal' | 'full' | null
  capacity?: number | null
  message?: string | null
  ranking_enabled?: boolean
  classes?: TvClass[]
  ranking?: { name: string; days: number }[]
  birthdays?: string[]
}

export interface DashboardTotals {
  revenue_cents: number
  payments: number
  ticket_cents: number | null
  new_members: number
  lapsed: number
  renewal_due: number
  renewed: number
  renewal_pct: number | null
  entries: number
  unique_visitors: number
  active_members: number
}

export interface Dashboard {
  period: { from: string; to: string; days: number; prev_from: string; prev_to: string }
  current: DashboardTotals
  previous: DashboardTotals
  by_plan: { name: string; cents: number; payments: number }[]
  debt: { accounts: number; open_cents: number; list: { member_id: string; name: string; open_cents: number }[] }
  heatmap: { dow: number; hour: number; n: number }[]
  class_slots: { dow: number; hour: number; classes: number; instructors: number }[]
}

export const GOALS = {
  hipertrofia: 'Hipertrofia (ganar músculo)',
  fuerza: 'Fuerza',
  descenso: 'Descenso de peso',
  resistencia: 'Resistencia',
  salud: 'Salud y movilidad',
} as const
export type Goal = keyof typeof GOALS

export const AI_DAILY_LIMIT = 20
