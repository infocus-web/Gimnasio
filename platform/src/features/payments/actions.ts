'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getAdminContext } from '@/features/admin/context'
import { ERRORS, formObject, type ActionState } from '@/features/admin/errors'
import { formatMoney } from '@/features/admin/format'
import { normalizeArPhone, whatsappLink } from '@/features/admin/whatsapp'
import { getMemberContext } from '@/lib/member-context'
import { createPreference, mpConfigured, publicSiteUrl } from './mercadopago'
import { payMessage } from './errors'
import { SALE_METHODS, toCents } from './money'

interface IntentInfo {
  intent_id: string
  amount_cents: number
  currency: string
  plan_name: string
  org_name: string
  payer_first_name: string
  payer_last_name: string
  payer_email: string | null
  payer_phone: string | null
}

const NOT_CONFIGURED = 'El gimnasio todavía no conectó Mercado Pago.'

/** ¿Se puede pagar online? (lo pregunta el botón "Pagar mi plan" de la app) */
export async function onlinePaymentsEnabled() {
  return mpConfigured()
}

async function preferenceFor(info: IntentInfo, backUrl: string, expiresInHours: number) {
  const pref = await createPreference({
    intentId: info.intent_id,
    title: `${info.plan_name} · ${info.org_name}`,
    amountCents: Number(info.amount_cents),
    currency: info.currency,
    payer: { email: info.payer_email, name: info.payer_first_name, surname: info.payer_last_name },
    backUrl,
    expiresInHours,
  })
  const supabase = await createClient()
  const { error } = await supabase.rpc('payment_intent_set_preference', {
    p_intent: info.intent_id,
    p_preference_id: pref.id,
    p_init_point: pref.init_point,
  })
  if (error) throw new Error(error.message)
  return pref.init_point
}

// ---------------------------------------------------------------------
// App del socio: pagar su plan
// ---------------------------------------------------------------------
export async function startMemberCheckout(slug: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  if (!mpConfigured()) return { message: NOT_CONFIGURED }
  const ctx = await getMemberContext(slug)
  if ('error' in ctx) return { message: 'Iniciá sesión para pagar.' }
  const planId = String(form.get('planId') ?? '') || undefined

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('payment_intent_create', { p_member: ctx.meId, p_plan: planId })
  if (error) return { message: payMessage(error) }
  let url: string
  try {
    url = await preferenceFor(data as unknown as IntentInfo, `${publicSiteUrl()}/${slug}/app/pagar`, 24)
  } catch (e) {
    console.error('[pagar]', e instanceof Error ? e.message : e)
    return { message: 'No pudimos conectar con Mercado Pago. Probá de nuevo en unos minutos.' }
  }
  redirect(url as Route)
}

// ---------------------------------------------------------------------
// Panel: link de pago por WhatsApp
// ---------------------------------------------------------------------
export type LinkState = ActionState & { url?: string; waUrl?: string | null; text?: string }

export async function createPaymentLink(slug: string, memberId: string, _prev: LinkState): Promise<LinkState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('billing.write')) return { message: ERRORS.FORBIDDEN }
  if (!mpConfigured()) return { message: 'Conectá Mercado Pago para mandar links de pago (ver Pagos → Online).' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('payment_intent_create', { p_member: memberId })
  if (error) return { message: payMessage(error) }
  const info = data as unknown as IntentInfo
  let url: string
  try {
    url = await preferenceFor(info, `${publicSiteUrl()}/api/payments/mercadopago/resultado`, 72)
  } catch (e) {
    console.error('[link de pago]', e instanceof Error ? e.message : e)
    return { message: 'No pudimos conectar con Mercado Pago. Probá de nuevo en unos minutos.' }
  }
  const text =
    `Hola ${info.payer_first_name}! Te pasamos el link para pagar tu plan ${info.plan_name} en ${info.org_name} ` +
    `(${formatMoney(Number(info.amount_cents), info.currency)}): ${url}\n` +
    `Podés pagar con tarjeta, débito o dinero en Mercado Pago. Apenas se acredita, el plan queda renovado solo. El link vence en 3 días.`
  const phone = normalizeArPhone(info.payer_phone)
  revalidatePath(`/${slug}/admin/pagos/online`)
  return { ok: true, message: 'Link de pago listo.', url, text, waUrl: phone ? whatsappLink(phone, text) : null }
}

// ---------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------
export async function saveProduct(slug: string, productId: string | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('billing.write')) return { message: ERRORS.FORBIDDEN }
  const raw = formObject(form)
  const name = (raw.name ?? '').trim()
  const fe: Record<string, string> = {}
  if (!name) fe.name = 'Poné un nombre'
  else if (name.length > 80) fe.name = 'Máximo 80 caracteres'
  const price = toCents(raw.price ?? '')
  if (price === null) fe.price = 'Precio inválido'
  let stock: number | null = null
  if ((raw.stock ?? '').trim() !== '') {
    const n = Number(raw.stock)
    if (!Number.isInteger(n) || n < 0 || n > 100000) fe.stock = 'Cantidad entera, 0 o más (vacío = sin control de stock)'
    else stock = n
  }
  if (Object.keys(fe).length) return { fieldErrors: fe }

  const row = { name, price_cents: price!, stock, active: raw.active === 'on', sort: Number(raw.sort) || 0 }
  const supabase = await createClient()
  const res = productId
    ? await supabase.from('products').update(row).eq('id', productId).eq('org_id', ctx.org.id).select('id').single()
    : await supabase.from('products').insert({ ...row, org_id: ctx.org.id }).select('id').single()
  if (res.error) return { message: payMessage(res.error) }
  revalidatePath(`/${slug}/admin/pagos`, 'layout')
  return { ok: true, message: productId ? 'Producto actualizado.' : 'Producto agregado.' }
}

// ---------------------------------------------------------------------
// Venta en mostrador
// ---------------------------------------------------------------------
export async function recordSaleAction(slug: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('billing.write')) return { message: ERRORS.FORBIDDEN }
  let items: { product_id: string; quantity: number }[] = []
  try {
    const parsed = JSON.parse(String(form.get('items') ?? '[]')) as unknown
    if (Array.isArray(parsed)) {
      items = parsed
        .filter((i): i is { product_id: string; quantity: number } =>
          !!i && typeof i.product_id === 'string' && Number.isInteger(i.quantity) && i.quantity > 0)
        .slice(0, 50)
    }
  } catch {
    /* items vacío */
  }
  if (!items.length) return { message: 'Agregá al menos un producto.' }
  const method = String(form.get('method') ?? '')
  if (!(SALE_METHODS as readonly string[]).includes(method)) return { fieldErrors: { method: 'Elegí el medio de pago' } }
  const memberId = String(form.get('memberId') ?? '') || undefined
  const note = String(form.get('note') ?? '').trim() || undefined

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('record_sale', {
    p_org: ctx.org.id,
    p_items: items,
    p_method: method as (typeof SALE_METHODS)[number],
    p_member: memberId,
    p_note: note,
  })
  if (error) return { message: payMessage(error) }
  revalidatePath(`/${slug}/admin/pagos`, 'layout')
  const total = Number((data as { total_cents?: number } | null)?.total_cents ?? 0)
  return { ok: true, message: `Venta registrada por ${formatMoney(total)}.` }
}

export async function voidSaleAction(slug: string, saleId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('billing.write')) return { message: ERRORS.FORBIDDEN }
  const reason = String(form.get('reason') ?? '').trim()
  if (!reason) return { fieldErrors: { reason: 'Contá por qué se anula' } }
  const supabase = await createClient()
  const { error } = await supabase.rpc('void_sale', { p_sale: saleId, p_reason: reason })
  if (error) return { message: payMessage(error) }
  revalidatePath(`/${slug}/admin/pagos`, 'layout')
  return { ok: true, message: 'Venta anulada. El stock volvió.' }
}

export interface MemberHit {
  id: string
  name: string
  number: number | null
  document: string | null
}

/** Buscador de socios para la venta (nombre, DNI o N° de socio) */
export async function searchMembers(slug: string, q: string): Promise<MemberHit[]> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('members.read')) return []
  const term = q.trim().replace(/[%_,()*\\]/g, ' ').trim().slice(0, 60)
  if (term.length < 2) return []
  const supabase = await createClient()
  let query = supabase
    .from('member_directory')
    .select('id, first_name, last_name, member_number, document_id')
    .eq('org_id', ctx.org.id)
    .neq('status', 'archived')
    .limit(40)
  const words = term.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 3)
  if (/^\d+$/.test(term)) {
    query = query.or(`document_id.ilike.${term}%,member_number.eq.${Number(term) <= 2147483647 ? term : 0}`)
  } else {
    query = query.or(`first_name.ilike.%${words[0]}%,last_name.ilike.%${words[0]}%`)
  }
  const { data } = await query.order('first_name')
  // "juan pérez": el resto de las palabras se filtra acá
  const rows = (data ?? []).filter((m) =>
    /^\d+$/.test(term) ? true : words.slice(1).every((w) => `${m.first_name} ${m.last_name}`.toLowerCase().includes(w)),
  )
  return rows.slice(0, 8).map((m) => ({
    id: m.id!,
    name: `${m.first_name} ${m.last_name}`.trim(),
    number: m.member_number ?? null,
    document: m.document_id ?? null,
  }))
}

// ---------------------------------------------------------------------
// Cierre de caja
// ---------------------------------------------------------------------
export async function closeShift(slug: string, to: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('billing.write')) return { message: ERRORS.FORBIDDEN }
  const counted = toCents(String(form.get('counted') ?? ''))
  if (counted === null) return { fieldErrors: { counted: 'Ingresá el efectivo que contaste (0 si no hay)' } }
  const note = String(form.get('note') ?? '').trim() || undefined
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('cash_close_shift', {
    p_org: ctx.org.id,
    p_counted_cash_cents: counted,
    p_note: note,
    p_to: /^\d{4}-\d{2}-\d{2}T/.test(to) ? to : undefined,
  })
  if (error) return { message: payMessage(error) }
  revalidatePath(`/${slug}/admin/pagos`, 'layout')
  const diff = Number((data as { difference_cents?: number } | null)?.difference_cents ?? 0)
  return {
    ok: true,
    message:
      diff === 0
        ? 'Turno cerrado. La caja cierra justa.'
        : `Turno cerrado con ${diff > 0 ? 'sobrante' : 'faltante'} de ${formatMoney(Math.abs(diff))}.`,
  }
}

// ---------------------------------------------------------------------
// Pase por día online (web pública)
// ---------------------------------------------------------------------
export async function saveDayPassSettings(slug: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('billing.write')) return { message: ERRORS.FORBIDDEN }
  const enabled = form.get('enabled') === 'on'
  const price = toCents(String(form.get('price') ?? '')) ?? 0
  const days = Number(form.get('days') ?? 1)
  const entries = Number(form.get('entries') ?? 1)
  const fe: Record<string, string> = {}
  if (enabled && price <= 0) fe.price = 'Poné el precio del pase'
  if (!Number.isInteger(days) || days < 1 || days > 31) fe.days = 'Entre 1 y 31 días'
  if (!Number.isInteger(entries) || entries < 1 || entries > 60) fe.entries = 'Entre 1 y 60 entradas'
  if (Object.keys(fe).length) return { fieldErrors: fe }
  const supabase = await createClient()
  const { error } = await supabase.from('online_sale_settings').upsert({
    org_id: ctx.org.id,
    day_pass_enabled: enabled,
    day_pass_price_cents: price,
    day_pass_days: days,
    day_pass_entries: entries,
  })
  if (error) return { message: payMessage(error) }
  revalidatePath(`/${slug}/admin/pagos/online`)
  return { ok: true, message: enabled ? 'Listo: el pase por día ya se puede comprar online.' : 'Guardado. El pase online está apagado.' }
}
