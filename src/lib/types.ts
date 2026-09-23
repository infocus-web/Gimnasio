export type Role = 'admin' | 'staff' | 'pending'
export type MemberStatus = 'al_dia' | 'por_vencer' | 'vencido' | 'inactivo'
export type PayMethod = 'efectivo' | 'transferencia' | 'debito' | 'credito' | 'mercadopago' | 'otro'

export interface Settings {
  id: number
  gym_name: string
  tagline: string | null
  address: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  instagram: string | null
  logo_url: string | null
  hero_url: string | null
  opening_hours: string | null
  grace_days: number
  reminder_days: number
}

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  role: Role
  created_at: string
}

export interface Plan {
  id: string
  name: string
  description: string | null
  price: number
  duration_days: number
  active: boolean
  show_public: boolean
  sort: number
}

export interface Member {
  id: string
  first_name: string
  last_name: string
  dni: string | null
  email: string | null
  phone: string | null
  birth_date: string | null
  address: string | null
  emergency_contact: string | null
  medical_notes: string | null
  notes: string | null
  photo_url: string | null
  plan_id: string | null
  paid_until: string | null
  joined_at: string
  active: boolean
  qr_token: string
  portal_token: string
  created_at: string
}

export interface MemberView extends Member {
  plan_name: string | null
  plan_price: number | null
  status: MemberStatus
  days_left: number | null
}

export interface Payment {
  id: string
  member_id: string
  plan_id: string | null
  amount: number
  method: PayMethod
  period_from: string
  period_to: string
  paid_at: string
  notes: string | null
  mp_payment_id: string | null
}

export interface Checkin {
  id: number
  member_id: string
  checked_at: string
  allowed: boolean
  reason: string | null
  method: string
}

export interface Exercise {
  id: string
  name: string
  muscle_group: string | null
  equipment: string | null
  description: string | null
  video_url: string | null
  thumbnail_url: string | null
}

export interface Routine {
  id: string
  name: string
  description: string | null
  goal: string | null
  level: 'principiante' | 'intermedio' | 'avanzado'
  days_per_week: number | null
  created_at: string
}

export interface RoutineItem {
  id: string
  routine_id: string
  day: number
  exercise_id: string
  sets: number | null
  reps: string | null
  rest_seconds: number | null
  notes: string | null
  position: number
}

export interface Activity {
  id: string
  name: string
  description: string | null
  instructor: string | null
  color: string | null
  image_url: string | null
  capacity: number | null
  active: boolean
  sort: number
}

export interface ScheduleSlot {
  id: string
  activity_id: string
  weekday: number
  start_time: string
  end_time: string
  room: string | null
}

export interface CheckInResult {
  found: boolean
  duplicate?: boolean
  allowed?: boolean
  reason?: string | null
  visits_this_month?: number
  member?: {
    id: string
    first_name: string
    last_name: string
    photo_url: string | null
    plan_name: string | null
    paid_until: string | null
    days_left: number | null
    medical_notes: string | null
  }
}
