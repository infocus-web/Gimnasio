'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.types'
import { getAdminContext } from './context'
import { dbMessage, ERRORS, formObject, type ActionState } from './errors'

const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .transform((v) => (v === '' ? undefined : v))
    .optional()

const imageUrl = z
  .string()
  .trim()
  .refine((v) => v === '' || v.startsWith('/img/') || /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/media\//.test(v), 'Imagen inválida')
  .transform((v) => (v === '' ? undefined : v))
  .optional()

const profileSchema = z.object({
  tagline: text(80),
  hero_kicker: text(60),
  hero_text: text(240),
  about_title: text(120),
  about_text: text(1200),
  phone: text(40),
  whatsapp: text(40),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => (v === '' ? undefined : v))
    .pipe(z.email('Email inválido').optional()),
  instagram: text(60),
  facebook: text(80),
  address: text(160),
  maps_url: z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : v))
    .pipe(z.url('Link inválido').optional()),
  hero_image: imageUrl,
  about_image_1: imageUrl,
  about_image_2: imageUrl,
})

/** "Lun a Vie 7 a 23 · Sáb 9 a 14" agrupando días consecutivos con el mismo horario */
function hoursText(hours: { weekday: number; open: string; close: string }[]) {
  const fmt = (t: string) => (t.endsWith(':00') ? String(Number(t.slice(0, 2))) : t)
  const groups: { from: number; to: number; open: string; close: string }[] = []
  for (const h of [...hours].sort((a, b) => a.weekday - b.weekday)) {
    const last = groups.at(-1)
    if (last && last.to === h.weekday - 1 && last.open === h.open && last.close === h.close) last.to = h.weekday
    else groups.push({ from: h.weekday, to: h.weekday, open: h.open, close: h.close })
  }
  return groups
    .map((g) => {
      const days = g.from === g.to ? DAY_SHORT[g.from - 1] : `${DAY_SHORT[g.from - 1]} a ${DAY_SHORT[g.to - 1]}`
      return `${days} ${fmt(g.open)} a ${fmt(g.close)}`
    })
    .join(' · ')
}

export async function saveWebProfile(slug: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('org.manage')) return { message: ERRORS.FORBIDDEN }
  const raw = formObject(form)
  const parsed = profileSchema.safeParse(raw)
  if (!parsed.success) {
    const fe: Record<string, string> = {}
    for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.message
    return { fieldErrors: fe, message: 'Revisá los campos marcados.' }
  }

  // Horarios: una fila por día abierto
  const hours: { weekday: number; open: string; close: string }[] = []
  for (let d = 1; d <= 7; d++) {
    if (raw[`day${d}_open_flag`] !== 'on') continue
    const open = raw[`day${d}_open`]
    const close = raw[`day${d}_close`]
    if (!/^\d{2}:\d{2}$/.test(open ?? '') || !/^\d{2}:\d{2}$/.test(close ?? '') || open! >= close!) {
      return { fieldErrors: { hours: `Revisá el horario del ${['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][d - 1]}` } }
    }
    hours.push({ weekday: d, open: open!, close: close! })
  }

  const gallery = form.getAll('gallery').map(String).filter((g) => imageUrl.safeParse(g).success && g)
  const p = parsed.data
  const supabase = await createClient()
  const { data: current } = await supabase.from('organizations').select('public_profile').eq('id', ctx.org.id).single()
  const prev = (current?.public_profile ?? {}) as Record<string, unknown>

  const next = {
    ...prev,
    tagline: p.tagline,
    hero_kicker: p.hero_kicker,
    hero_text: p.hero_text,
    about_title: p.about_title,
    about_text: p.about_text,
    phone: p.phone,
    whatsapp: p.whatsapp,
    email: p.email,
    instagram: p.instagram ? `@${p.instagram.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '')}` : undefined,
    facebook: p.facebook?.replace(/^https?:\/\/(www\.)?facebook\.com\//, '').replace(/\/$/, ''),
    address: p.address,
    maps_url: p.maps_url,
    hero_image: p.hero_image,
    about_images: [p.about_image_1, p.about_image_2].filter((x): x is string => !!x),
    gallery,
    hours_text: hours.length ? hoursText(hours) : 'Consultá horarios en recepción',
  }
  // jsonb sin claves vacías
  const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined && v !== null && v !== ''))

  const { error } = await supabase
    .from('organizations')
    .update({ public_profile: clean as Json, opening_hours: hours })
    .eq('id', ctx.org.id)
  if (error) return { message: dbMessage(error) }

  revalidatePath(`/${slug}`)
  revalidatePath(`/${slug}/admin/web`)
  return { ok: true, message: 'Web actualizada. Los cambios ya se ven en la página pública.' }
}
