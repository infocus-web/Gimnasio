'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.types'
import { getAdminContext } from '@/features/admin/context'
import { dbMessage, ERRORS, formObject, type ActionState } from '@/features/admin/errors'
import { isValidTime, type AccessWindow } from './windows'
import { passError } from './labels'

const MAX_WINDOWS = 3
const METHODS = ['cash', 'transfer', 'mercadopago', 'card_terminal', 'other'] as const

/** Estado de "Emitir pase": además del mensaje, el pase recién creado (para compartirlo). */
export type PassActionState = ActionState & { pass?: { id: string; code: string; qr: string; validUntil: string } }

function toCents(raw: string) {
  const clean = raw.replace(/[^\d,.]/g, '')
  if (!clean) return null
  let normalized: string
  if (clean.includes(',')) normalized = clean.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(clean)) normalized = clean.replace(/\./g, '')
  else if (/^\d+\.\d{1,2}$/.test(clean)) normalized = clean
  else normalized = clean.replace(/\./g, '')
  const n = Number(normalized)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}

// ---------------------------------------------------------------------
// Horario del plan (Pagos → Planes)
// ---------------------------------------------------------------------
export async function savePlanHours(slug: string, planId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('billing.write')) return { message: ERRORS.FORBIDDEN }

  let windows: AccessWindow[] | null = null
  if (form.get('mode') === 'custom') {
    windows = []
    const fe: Record<string, string> = {}
    for (let i = 0; i < MAX_WINDOWS; i++) {
      const days = form
        .getAll(`days_${i}`)
        .map(Number)
        .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
      const from = String(form.get(`from_${i}`) ?? '').trim()
      const to = String(form.get(`to_${i}`) ?? '').trim()
      if (!days.length && !from && !to) continue
      if (!days.length) fe[`days_${i}`] = 'Elegí al menos un día'
      if (!isValidTime(from) || from === '24:00') fe[`from_${i}`] = 'Hora inválida'
      if (!isValidTime(to)) fe[`to_${i}`] = 'Hora inválida'
      if (from && from === to) fe[`to_${i}`] = 'Tiene que ser distinta de "desde"'
      windows.push({ days: [...new Set(days)].sort((a, b) => a - b), from, to })
    }
    if (Object.keys(fe).length) return { fieldErrors: fe, message: 'Revisá los horarios marcados.' }
    if (!windows.length) return { message: 'Agregá al menos una franja o elegí "Puede entrar siempre".' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('membership_plans')
    .update({ access_windows: windows as unknown as Json })
    .eq('id', planId)
    .eq('org_id', ctx.org.id)
  if (error) return { message: dbMessage(error) }
  revalidatePath(`/${slug}/admin/pagos/planes`)
  return { ok: true, message: windows ? 'Horario del plan guardado.' : 'Listo: este plan puede entrar siempre.' }
}

// ---------------------------------------------------------------------
// Pases (Panel → Pases e invitados)
// ---------------------------------------------------------------------
export async function issueDayPass(slug: string, _prev: ActionState, form: FormData): Promise<PassActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('checkins.manage')) return { message: ERRORS.FORBIDDEN }
  const raw = formObject(form)
  const fe: Record<string, string> = {}
  const kind = raw.kind === 'trial' ? 'trial' : 'day'
  const name = (raw.name ?? '').trim().replace(/\s+/g, ' ')
  if (name.length < 2) fe.name = 'Escribí nombre y apellido'
  const days = Number(raw.days)
  if (![1, 3, 7].includes(days)) fe.days = 'Elegí la validez'
  const entries = Number(raw.entries || '1')
  if (!Number.isInteger(entries) || entries < 1 || entries > 60) fe.entries = 'Entre 1 y 60'
  const price = raw.price ? toCents(raw.price) : null
  if (raw.price && price === null) fe.price = 'Monto inválido'
  const method = METHODS.includes(raw.method as (typeof METHODS)[number]) ? raw.method : null
  if (price && !method) fe.method = 'Elegí cómo pagó'
  const email = (raw.email ?? '').trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fe.email = 'Email inválido'
  if (Object.keys(fe).length) return { fieldErrors: fe }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('day_pass_issue', {
    p_org: ctx.org.id,
    p_kind: kind,
    p_holder_name: name,
    p_holder_phone: raw.phone?.trim() || null,
    p_holder_document: raw.document?.trim() || null,
    p_holder_email: email || null,
    p_days: days,
    p_max_entries: entries,
    p_price_cents: price || null,
    p_payment_method: price ? method : null,
  })
  if (error) return { message: passError(error.message) }
  const d = data as { id: string; code: string; qr: string; valid_until: string }
  revalidatePath(`/${slug}/admin/pases`)
  return {
    ok: true,
    message: `Pase creado para ${name}. Código ${d.code}. Mandáselo por WhatsApp con el botón de abajo.`,
    pass: { id: d.id, code: d.code, qr: d.qr, validUntil: d.valid_until },
  }
}

export async function revokeDayPass(slug: string, passId: string): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('checkins.manage')) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { error } = await supabase.rpc('day_pass_revoke', { p_pass: passId })
  if (error) return { message: passError(error.message) }
  revalidatePath(`/${slug}/admin/pases`)
  return { ok: true, message: 'Pase anulado.' }
}

// ---------------------------------------------------------------------
// Reglas de acceso (dueño / administrador)
// ---------------------------------------------------------------------
export async function saveAccessSettings(slug: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('org.manage')) return { message: ERRORS.FORBIDDEN }
  const raw = formObject(form)
  const fe: Record<string, string> = {}
  const guests = Number(raw.guests)
  if (!Number.isInteger(guests) || guests < 0 || guests > 10) fe.guests = 'Entre 0 y 10'
  const stay = Number(raw.stay)
  if (!Number.isInteger(stay) || stay < 15 || stay > 300) fe.stay = 'Entre 15 y 300 minutos'
  const capacity = Number(raw.capacity)
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 2000) fe.capacity = 'Entre 1 y 2000 personas'
  if (Object.keys(fe).length) return { fieldErrors: fe }

  const supabase = await createClient()
  const { error } = await supabase.rpc('access_settings_save', {
    p_org: ctx.org.id,
    p_guest_passes_per_month: guests,
    p_require_medical_cert: raw.medical === 'on',
    p_avg_stay_minutes: stay,
    p_capacity: capacity,
  })
  if (error) return { message: dbMessage(error) }
  revalidatePath(`/${slug}/admin/pases`)
  return { ok: true, message: 'Reglas de acceso guardadas. El molinete las aplica desde ahora.' }
}
