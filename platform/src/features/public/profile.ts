import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export interface PublicPlan {
  name: string
  description: string | null
  kind: 'recurring' | 'class_pack' | 'drop_in' | 'trial'
  price_cents: number
  currency: string
  billing_interval: 'day' | 'week' | 'month' | 'year' | null
  interval_count: number
  class_credits: number | null
  max_members: number
}

export interface PublicGym {
  name: string
  slug: string
  address: string | null
  opening_hours: { weekday: number; open: string; close: string }[]
  profile: {
    tagline?: string
    hero_kicker?: string
    hero_text?: string
    hero_image?: string
    about_title?: string
    about_text?: string
    about_images?: string[]
    gallery?: string[]
    hours_text?: string
    phone?: string
    whatsapp?: string
    email?: string
    instagram?: string
  }
  plans: PublicPlan[]
  activities: { name: string; description: string | null; color: string; image_url: string | null }[]
  schedule: { weekday: number; start: string; end: string; activity: string; color: string; room: string }[]
}

/** Datos públicos del gimnasio (sin login). Ver public_gym_profile() en 0012. */
export const getPublicGym = cache(async (slug: string): Promise<PublicGym | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('public_gym_profile', { p_slug: slug })
  if (error || !data) return null
  return data as unknown as PublicGym
})

const PERIOD: Record<string, [string, string]> = {
  day: ['día', 'días'],
  week: ['semana', 'semanas'],
  month: ['mes', 'meses'],
  year: ['año', 'años'],
}

export function formatPrice(plan: PublicPlan) {
  const amount = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: plan.currency,
    maximumFractionDigits: 0,
  }).format(plan.price_cents / 100)
  if (plan.kind === 'class_pack') return { amount, period: `${plan.class_credits ?? ''} clases` }
  if (!plan.billing_interval) return { amount, period: '' }
  const [one, many] = PERIOD[plan.billing_interval] ?? ['', '']
  return { amount, period: plan.interval_count === 1 ? `por ${one}` : `cada ${plan.interval_count} ${many}` }
}

/** "Abierto ahora · cierra 23:00" / "Cerrado · abre mañana 07:00", en hora de Argentina. */
export function openStatus(hours: PublicGym['opening_hours'], timeZone = 'America/Argentina/Buenos_Aires') {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date())
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.find((p) => p.type === 'weekday')?.value ?? 'Mon') + 1
  const now = `${parts.find((p) => p.type === 'hour')?.value ?? '00'}:${parts.find((p) => p.type === 'minute')?.value ?? '00'}`.replace(/^24/, '00')
  const today = hours.find((h) => h.weekday === wd)
  if (today && now >= today.open && now < today.close) return { open: true, label: `Abierto ahora · cierra ${today.close}` }
  for (let i = 0; i < 7; i++) {
    const day = ((wd - 1 + i) % 7) + 1
    const h = hours.find((x) => x.weekday === day)
    if (!h || (i === 0 && now >= h.open)) continue
    const when = i === 0 ? 'hoy' : i === 1 ? 'mañana' : DAY_NAMES[day - 1]!.toLowerCase()
    return { open: false, label: `Cerrado · abre ${when} ${h.open}` }
  }
  return { open: false, label: 'Cerrado' }
}

export const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
