'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAdminContext } from './context'
import { dbMessage, ERRORS, formObject, type ActionState } from './errors'

const METHODS = ['cash', 'transfer', 'mercadopago', 'card_terminal', 'other'] as const

/** "12.500,50" / "12500" / "12500.5" → centavos */
function toCents(raw: string) {
  const clean = raw.replace(/[^\d,.-]/g, '')
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean
  const n = Number(normalized)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}

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
