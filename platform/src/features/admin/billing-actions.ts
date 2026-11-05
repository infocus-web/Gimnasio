'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAdminContext } from './context'
import { dbMessage, ERRORS, formObject, type ActionState } from './errors'
import { toCents } from '@/features/payments/money'
import type { Database } from '@/types/database.types'
import { PERIOD_MAP, periodOf, rateLabel, type PeriodKey } from './rates'

const METHODS = ['cash', 'transfer', 'mercadopago', 'card_terminal', 'other'] as const

export async function recordPayment(slug: string, memberId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('billing.write')) return { message: ERRORS.FORBIDDEN }
  const raw = formObject(form)
  const cents = toCents(raw.amount ?? '')
  if (cents === null || cents === 0) return { fieldErrors: { amount: 'Ingresá el monto cobrado' } }
  const method = METHODS.includes(raw.method as (typeof METHODS)[number]) ? (raw.method as (typeof METHODS)[number]) : null
  if (!method) return { fieldErrors: { method: 'Elegí el medio de pago' } }
  const renew = raw.renew === 'on'

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('record_payment', {
    p_member: memberId,
    p_amount_cents: cents,
    p_method: method,
    p_plan: renew && raw.planId ? raw.planId : undefined,
    p_note: raw.note?.trim() || undefined,
    p_renew: renew,
  })
  if (error) return { message: dbMessage(error) }
  revalidatePath(`/${slug}/admin`, 'layout')
  const end = (data as { period_end?: string } | null)?.period_end
  const until = end
    ? ` Plan al día hasta el ${new Intl.DateTimeFormat('es-AR', { timeZone: ctx.org.timezone, dateStyle: 'short' }).format(new Date(end))}.`
    : ''
  return { ok: true, message: `Cobro registrado.${until}` }
}

export async function voidPayment(slug: string, paymentId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('billing.write')) return { message: ERRORS.FORBIDDEN }
  const reason = String(form.get('reason') ?? '').trim()
  if (!reason) return { fieldErrors: { reason: 'Contá por qué se anula' } }
  const supabase = await createClient()
  const { error } = await supabase.rpc('void_payment', { p_payment: paymentId, p_reason: reason })
  if (error) return { message: dbMessage(error) }
  revalidatePath(`/${slug}/admin`, 'layout')
  return { ok: true, message: 'Pago anulado. Si corresponde, ajustá el vencimiento del plan desde la ficha.' }
}

const planSchema = z
  .object({
    name: z.string().trim().min(1, 'Poné un nombre'),
    description: z.string().trim().optional(),
    kind: z.enum(['recurring', 'class_pack', 'drop_in', 'trial']),
    price: z.string(),
    billingInterval: z.enum(['day', 'week', 'month', 'year']).optional(),
    intervalCount: z.coerce.number().int().min(1).max(24).default(1),
    classCredits: z.coerce.number().int().min(1).max(500).optional(),
    creditsValidDays: z.coerce.number().int().min(1).max(730).optional(),
    maxMembers: z.coerce.number().int().min(1).max(10).default(1),
    maxBookingsPerWeek: z.coerce.number().int().min(1).max(50).optional(),
    bookingWindowDays: z.coerce.number().int().min(0).max(90).default(14),
    sort: z.coerce.number().int().default(0),
  })
  .refine((p) => p.kind !== 'recurring' || !!p.billingInterval, { path: ['billingInterval'], message: 'Elegí cada cuánto se paga' })
  .refine((p) => p.kind !== 'class_pack' || !!p.classCredits, { path: ['classCredits'], message: 'Indicá cuántas clases incluye' })

const emptyToUndef = (o: Record<string, string>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === '' ? undefined : v]))

export async function savePlan(slug: string, planId: string | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('billing.write')) return { message: ERRORS.FORBIDDEN }
  const raw = formObject(form)
  const parsed = planSchema.safeParse(emptyToUndef(raw))
  if (!parsed.success) {
    const fe: Record<string, string> = {}
    for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.message
    return { fieldErrors: fe }
  }
  const p = parsed.data
  const cents = toCents(p.price)
  if (cents === null) return { fieldErrors: { price: 'Precio inválido' } }

  const row = {
    org_id: ctx.org.id,
    name: p.name,
    description: p.description || null,
    kind: p.kind,
    price_cents: cents,
    currency: 'ARS',
    billing_interval: p.kind === 'recurring' ? p.billingInterval! : null,
    interval_count: p.kind === 'recurring' ? p.intervalCount : 1,
    class_credits: p.kind === 'class_pack' ? p.classCredits! : null,
    credits_valid_days: p.kind === 'class_pack' ? (p.creditsValidDays ?? 30) : null,
    max_members: p.maxMembers,
    max_bookings_per_week: p.maxBookingsPerWeek ?? null,
    booking_window_days: p.bookingWindowDays,
    is_public: raw.isPublic === 'on',
    active: raw.active === 'on',
    includes_open_gym: raw.includesOpenGym === 'on',
    sort: p.sort,
  }
  const supabase = await createClient()
  const res = planId
    ? await supabase.from('membership_plans').update(row).eq('id', planId).eq('org_id', ctx.org.id).select('id').single()
    : await supabase.from('membership_plans').insert(row).select('id').single()
  if (res.error) return { message: dbMessage(res.error) }

  // Actividades habilitadas (ninguna tildada = todas)
  const id = res.data.id
  const types = form.getAll('classTypes').map(String).filter(Boolean)
  await supabase.from('plan_class_types').delete().eq('plan_id', id)
  if (types.length) {
    const { error } = await supabase
      .from('plan_class_types')
      .insert(types.map((t) => ({ plan_id: id, class_type_id: t, org_id: ctx.org.id })))
    if (error) return { message: dbMessage(error) }
  }
  revalidatePath(`/${slug}/admin/pagos`, 'layout')
  revalidatePath(`/${slug}`)
  return { ok: true, message: planId ? 'Plan actualizado.' : 'Plan creado.' }
}


export async function saveRates(slug: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('billing.write')) return { message: ERRORS.FORBIDDEN }
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const fe: Record<string, string> = {}
  const price = (key: string) => {
    const text = String(form.get(key) ?? '').trim()
    const cents = text === '' ? 0 : toCents(text)
    if (cents === null) fe[key] = 'Precio inválido'
    return cents ?? 0
  }
  const period = (key: string): PeriodKey | null => {
    const v = String(form.get(key) ?? '')
    return v in PERIOD_MAP ? (v as PeriodKey) : null
  }
  const freq = (key: string) => {
    const n = Number(String(form.get(key) ?? ''))
    return Number.isInteger(n) && n >= 1 && n <= 7 ? n : null
  }

  const supabase = await createClient()
  const [{ data: plans }, { data: types }, { data: links }] = await Promise.all([
    supabase.from('membership_plans').select('id, includes_open_gym, billing_interval, interval_count, max_bookings_per_week').eq('org_id', ctx.org.id),
    supabase.from('class_types').select('id, name').eq('org_id', ctx.org.id),
    supabase.from('plan_class_types').select('plan_id, class_type_id').eq('org_id', ctx.org.id),
  ])
  const typeName = new Map((types ?? []).map((t) => [t.id, t.name]))
  const planTypes = new Map<string, string[]>()
  for (const l of links ?? []) planTypes.set(l.plan_id, [...(planTypes.get(l.plan_id) ?? []), l.class_type_id])

  type Upd = { id: string; row: Database['public']['Tables']['membership_plans']['Update'] }
  const updates: Upd[] = []
  for (const p of plans ?? []) {
    if (!form.has(`price_${p.id}`)) continue
    const row: Upd['row'] = { price_cents: price(`price_${p.id}`) }
    const only = planTypes.get(p.id) ?? []
    const activity = only.length === 1 ? typeName.get(only[0]!) : undefined
    // Solo se renombra si cambió la frecuencia / el período (así no se pisan nombres puestos a mano)
    if (activity && form.has(`freq_${p.id}`)) {
      const perWeek = freq(`freq_${p.id}`)
      if (perWeek !== p.max_bookings_per_week)
        Object.assign(row, rateLabel(activity, perWeek, null), { max_bookings_per_week: perWeek })
    }
    if (activity && form.has(`period_${p.id}`)) {
      const per = period(`period_${p.id}`)
      if (per && per !== periodOf(p.billing_interval, p.interval_count))
        Object.assign(row, rateLabel(activity, null, per), {
          kind: 'recurring',
          billing_interval: PERIOD_MAP[per].billing_interval,
          interval_count: PERIOD_MAP[per].interval_count,
        })
    }
    if (form.get(`remove_${p.id}`) === 'on') Object.assign(row, { active: false, is_public: false })
    updates.push({ id: p.id, row })
  }

  const inserts: { typeId: string; perWeek: number | null; period: PeriodKey | null; cents: number }[] = []
  for (const key of form.keys()) {
    const m = /^new__([0-9a-f-]{36})__(\d+)__price$/i.exec(key)
    if (!m || !UUID.test(m[1]!) || !typeName.has(m[1]!)) continue
    const cents = price(key)
    const base = `new__${m[1]}__${m[2]}__`
    if (cents > 0) inserts.push({ typeId: m[1]!, perWeek: freq(`${base}freq`), period: period(`${base}period`), cents })
    else fe[key] = 'Poné el precio de la opción nueva'
  }
  // Combos nuevos: varias actividades en un plan (con Musculación = entra a la sala)
  const combos: { types: string[]; perWeek: number | null; cents: number }[] = []
  for (const key of form.keys()) {
    const m = /^combo__(\d+)__price$/.exec(key)
    if (!m) continue
    const base = `combo__${m[1]}__`
    const types = [...new Set(form.getAll(`${base}types`).map(String))].filter((t) => typeName.has(t))
    const cents = price(key)
    if (types.length < 2) fe[`${base}types`] = 'Tildá al menos dos actividades'
    if (cents <= 0) fe[key] = 'Poné el precio del combo'
    if (types.length >= 2 && cents > 0) combos.push({ types, perWeek: freq(`${base}freq`), cents })
  }
  if (Object.keys(fe).length) return { fieldErrors: fe, message: 'Revisá los campos marcados.' }

  for (const u of updates) {
    const { error } = await supabase.from('membership_plans').update(u.row).eq('id', u.id).eq('org_id', ctx.org.id)
    if (error) return { message: dbMessage(error) }
  }
  for (const n of inserts) {
    const label = rateLabel(typeName.get(n.typeId)!, n.period ? null : n.perWeek, n.period)
    const per = n.period ? PERIOD_MAP[n.period] : PERIOD_MAP.month
    const { data, error } = await supabase
      .from('membership_plans')
      .insert({
        org_id: ctx.org.id,
        ...label,
        kind: 'recurring',
        price_cents: n.cents,
        currency: 'ARS',
        billing_interval: per.billing_interval,
        interval_count: per.interval_count,
        max_members: 1,
        max_bookings_per_week: n.period ? null : n.perWeek,
        booking_window_days: 14,
        includes_open_gym: !!n.period,   // opción de Musculación = entra a la sala
        is_public: true,
        active: true,
        sort: 100,
      })
      .select('id')
      .single()
    if (error) return { message: dbMessage(error) }
    const { error: e2 } = await supabase.from('plan_class_types').insert({ plan_id: data.id, class_type_id: n.typeId, org_id: ctx.org.id })
    if (e2) return { message: dbMessage(e2) }
  }
  for (const c of combos) {
    const names = c.types.map((t) => typeName.get(t)!)
    // Musculación al final: "Híbrido + Funcional + Musculación"
    names.sort((a, b) => Number(a === 'Musculación') - Number(b === 'Musculación') || a.localeCompare(b))
    const gym = names.includes('Musculación')
    const classes = names.filter((n) => n !== 'Musculación')
    const limit = c.perWeek ? `, hasta ${c.perWeek === 1 ? '1 clase' : `${c.perWeek} clases`} por semana` : ''
    const { data, error } = await supabase
      .from('membership_plans')
      .insert({
        org_id: ctx.org.id,
        name: names.join(' + ') + (c.perWeek ? ` (${c.perWeek}x semana)` : ''),
        description: `Clases de ${classes.join(', ')}${gym ? ' + sala de musculación libre' : ''}${limit}`,
        kind: 'recurring',
        price_cents: c.cents,
        currency: 'ARS',
        billing_interval: 'month',
        interval_count: 1,
        max_members: 1,
        max_bookings_per_week: c.perWeek,
        booking_window_days: 14,
        includes_open_gym: gym,
        is_public: true,
        active: true,
        sort: 200,
      })
      .select('id')
      .single()
    if (error) return { message: dbMessage(error) }
    const { error: e2 } = await supabase
      .from('plan_class_types')
      .insert(c.types.map((t) => ({ plan_id: data.id, class_type_id: t, org_id: ctx.org.id })))
    if (e2) return { message: dbMessage(e2) }
  }
  revalidatePath(`/${slug}/admin/pagos`, 'layout')
  revalidatePath(`/${slug}`)
  return { ok: true, message: 'Tarifas guardadas. La web ya muestra los precios nuevos.' }
}
