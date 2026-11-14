'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { getAdminContext } from '@/features/admin/context'
import { dbMessage, ERRORS, formObject, type ActionState } from '@/features/admin/errors'
import { getMemberContext } from '@/lib/member-context'
import { createPreference, mpConfigured, publicSiteUrl } from '@/features/payments/mercadopago'
import { toCents } from '@/features/payments/money'
import { buffetDb, type LooseDb } from './data'
import { BUFFET_BUCKET, CATEGORIES } from './types'

const BUFFET_ERRORS: Record<string, string> = {
  BUFFET_CLOSED: 'El buffet no está tomando pedidos por la app en este momento.',
  INVALID_DAY: 'Ese día no se pueden hacer pedidos.',
  ORDER_CUTOFF: 'Ya pasó el horario para pedir para ese día.',
  PAY_METHOD_NOT_ALLOWED: 'Ese medio de pago no está disponible.',
  TOO_MANY_ORDERS: 'Hiciste muchos pedidos seguidos. Esperá un rato y probá de nuevo.',
  EMPTY_ORDER: 'Elegí al menos un producto.',
  INVALID_QUANTITY: 'Revisá las cantidades (máximo 20 de cada uno).',
  ITEM_NOT_AVAILABLE: 'Uno de los productos ya no está disponible ese día.',
  OUT_OF_STOCK: 'No quedan suficientes porciones de uno de los productos.',
  ALREADY_PAID: 'Ese pedido ya está pagado.',
  ORDER_CLOSED: 'Ese pedido ya fue entregado o cancelado.',
  PAID_CONTACT_BUFFET: 'Ese pedido ya está pagado: para cancelarlo hablá con el buffet.',
  PAYMENT_REQUIRED: 'El pedido no está pagado: elegí cómo te pagó.',
  INVALID_ACTION: 'Acción inválida.',
}

function buffetMessage(error: { message: string; code?: string; hint?: string | null }) {
  const code = error.message.trim()
  if (code === 'OUT_OF_STOCK' && error.hint) return `No quedan suficientes porciones de «${error.hint}».`
  if (code === 'ITEM_NOT_AVAILABLE' && error.hint) return `«${error.hint}» no está disponible ese día.`
  if (code === 'ORDER_CUTOFF' && error.hint) return `Los pedidos para ese día se toman hasta las ${error.hint} h.`
  if (BUFFET_ERRORS[code]) return BUFFET_ERRORS[code]
  return dbMessage(error)
}

interface CheckoutInfo {
  order_id: string
  intent_id: string | null
  total_cents: number
  currency: string
  title: string
  org_name: string
  payer_email: string | null
  payer_first_name: string
  payer_last_name: string
}

/** Arma la preferencia de Mercado Pago del pedido y devuelve el link de pago. */
async function checkoutUrl(db: LooseDb, slug: string, info: CheckoutInfo) {
  const pref = await createPreference({
    intentId: info.intent_id!,
    title: `${info.title} · ${info.org_name}`,
    amountCents: Number(info.total_cents),
    currency: info.currency,
    payer: { email: info.payer_email, name: info.payer_first_name, surname: info.payer_last_name },
    backUrl: `${publicSiteUrl()}/${slug}/app/buffet?pedido=${info.order_id}`,
    expiresInHours: 12,
  })
  const { error } = await db.rpc('payment_intent_set_preference', {
    p_intent: info.intent_id,
    p_preference_id: pref.id,
    p_init_point: pref.init_point,
  })
  if (error) throw new Error(error.message)
  return pref.init_point
}

const MP_DOWN = 'No pudimos conectar con Mercado Pago. Tu pedido quedó guardado: probá pagarlo de nuevo en unos minutos o elegí pagar al retirar.'

// ---------------------------------------------------------------------
// App del socio
// ---------------------------------------------------------------------
export async function placeBuffetOrder(slug: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getMemberContext(slug)
  if ('error' in ctx) return { message: 'Iniciá sesión para pedir.' }
  const date = String(form.get('date') ?? '')
  const pay = String(form.get('pay') ?? '')
  const note = String(form.get('note') ?? '').slice(0, 200)
  let items: { item_id: string; quantity: number }[] = []
  try {
    const raw = JSON.parse(String(form.get('items') ?? '[]')) as Record<string, number>
    items = Object.entries(raw)
      .filter(([, q]) => Number.isInteger(q) && q > 0)
      .map(([item_id, quantity]) => ({ item_id, quantity }))
  } catch {
    return { message: BUFFET_ERRORS.EMPTY_ORDER }
  }
  if (!items.length) return { message: BUFFET_ERRORS.EMPTY_ORDER }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { message: BUFFET_ERRORS.INVALID_DAY }
  if (pay === 'online' && !mpConfigured()) return { message: 'El pago online todavía no está habilitado. Elegí pagar al retirar.' }

  const db = await buffetDb()
  const { data, error } = await db.rpc('buffet_place_order', {
    p_member: ctx.meId,
    p_date: date,
    p_items: items,
    p_pay: pay,
    p_note: note || null,
  })
  if (error) return { message: buffetMessage(error) }
  const info = data as CheckoutInfo & { pickup_code: string }
  revalidatePath(`/${slug}/app/buffet`)
  if (pay !== 'online') {
    return { ok: true, message: `¡Pedido hecho! Tu código de retiro es ${info.pickup_code}. Lo pagás cuando lo retirás.` }
  }
  let url: string
  try {
    url = await checkoutUrl(db, slug, info)
  } catch (e) {
    console.error('[buffet · pagar]', e instanceof Error ? e.message : e)
    return { message: MP_DOWN }
  }
  redirect(url as Route)
}

export async function payBuffetOrder(slug: string, orderId: string, _prev: ActionState): Promise<ActionState> {
  if (!mpConfigured()) return { message: 'El pago online todavía no está habilitado.' }
  const ctx = await getMemberContext(slug)
  if ('error' in ctx) return { message: 'Iniciá sesión para pagar.' }
  const db = await buffetDb()
  const { data, error } = await db.rpc('buffet_order_pay_online', { p_order: orderId })
  if (error) return { message: buffetMessage(error) }
  let url: string
  try {
    url = await checkoutUrl(db, slug, data as CheckoutInfo)
  } catch (e) {
    console.error('[buffet · pagar]', e instanceof Error ? e.message : e)
    return { message: MP_DOWN }
  }
  redirect(url as Route)
}

export async function cancelBuffetOrder(slug: string, orderId: string, _prev: ActionState): Promise<ActionState> {
  const db = await buffetDb()
  const { error } = await db.rpc('buffet_cancel_my_order', { p_order: orderId })
  if (error) return { message: buffetMessage(error) }
  revalidatePath(`/${slug}/app/buffet`)
  return { ok: true, message: 'Pedido cancelado.' }
}

// ---------------------------------------------------------------------
// Panel del buffet
// ---------------------------------------------------------------------
async function buffetCtx(slug: string) {
  const ctx = await getAdminContext(slug)
  return ctx?.can('buffet.manage') ? ctx : null
}

function imageFromForm(form: FormData): { bytes: Buffer | null; error?: string } {
  const data = String(form.get('image') ?? '')
  if (!data) return { bytes: null }
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(data)
  if (!m?.[1]) return { bytes: null, error: 'La foto no tiene un formato válido.' }
  const bytes = Buffer.from(m[1], 'base64')
  if (bytes.length > 1_500_000) return { bytes: null, error: 'La foto es demasiado pesada.' }
  return { bytes }
}

/** Sube la foto nueva y borra la anterior. Devuelve la ruta nueva, o null si falló. */
async function uploadImage(db: LooseDb, orgId: string, key: string, bytes: Buffer) {
  const path = `${orgId}/${key}-${Date.now()}.jpg`
  const up = await db.storage.from(BUFFET_BUCKET).upload(path, bytes, { contentType: 'image/jpeg', cacheControl: '31536000' })
  if (up.error) {
    console.error('[buffet] upload', up.error.message)
    return null
  }
  return path
}

const clean = (v: string | undefined, max: number) => {
  const s = (v ?? '').trim()
  return s ? s.slice(0, max) : null
}

export async function saveBuffetSettings(slug: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await buffetCtx(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const raw = formObject(form)
  const fe: Record<string, string> = {}
  const name = (raw.name ?? '').trim()
  if (!name) fe.name = 'Poné un nombre'
  const cutoff = (raw.order_cutoff ?? '').trim()
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff)) fe.order_cutoff = 'Hora inválida (ej. 11:00)'
  const daysAhead = Number(raw.days_ahead)
  if (!Number.isInteger(daysAhead) || daysAhead < 0 || daysAhead > 14) fe.days_ahead = 'Entre 0 y 14'
  const acceptOnline = raw.accept_online === 'on'
  const acceptPickup = raw.accept_at_pickup === 'on'
  if (!acceptOnline && !acceptPickup) fe.accept_at_pickup = 'Dejá al menos un medio de pago'
  const img = imageFromForm(form)
  if (img.error) fe.image = img.error
  if (Object.keys(fe).length) return fe.image && Object.keys(fe).length === 1 ? { message: fe.image } : { fieldErrors: fe }

  const db = await buffetDb()
  const { data: prev } = await db.from('buffet_settings').select('cover_path').eq('org_id', ctx.org.id).maybeSingle()
  let cover: string | null | undefined
  if (img.bytes) {
    cover = await uploadImage(db, ctx.org.id, 'portada', img.bytes)
    if (!cover) return { message: 'No se pudo guardar la foto. Probá de nuevo.' }
  } else if (form.get('removeImage') === '1') {
    cover = null
  }
  const row = {
    org_id: ctx.org.id,
    enabled: raw.enabled === 'on',
    name: name.slice(0, 60),
    tagline: clean(raw.tagline, 120),
    description: clean(raw.description, 600),
    pickup_text: clean(raw.pickup_text, 160),
    whatsapp: clean(raw.whatsapp, 30),
    order_cutoff: cutoff,
    days_ahead: daysAhead,
    accept_online: acceptOnline,
    accept_at_pickup: acceptPickup,
    ...(cover !== undefined ? { cover_path: cover } : {}),
  }
  const { error } = await db.from('buffet_settings').upsert(row, { onConflict: 'org_id' })
  if (error) {
    if (cover) await db.storage.from(BUFFET_BUCKET).remove([cover])
    return { message: dbMessage(error) }
  }
  if (cover !== undefined && prev?.cover_path) await db.storage.from(BUFFET_BUCKET).remove([prev.cover_path as string])
  revalidatePath(`/${slug}`, 'layout')
  return { ok: true, message: row.enabled ? 'Guardado. El buffet se ve en la web y en la app.' : 'Guardado. El buffet está apagado: no se ve en la web ni en la app.' }
}

export async function saveBuffetItem(slug: string, itemId: string | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await buffetCtx(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const raw = formObject(form)
  const fe: Record<string, string> = {}
  const name = (raw.name ?? '').trim()
  if (!name) fe.name = 'Poné un nombre'
  else if (name.length > 80) fe.name = 'Máximo 80 caracteres'
  const price = toCents(raw.price ?? '')
  if (price === null) fe.price = 'Precio inválido'
  const category = raw.category ?? ''
  if (!CATEGORIES.some((c) => c.value === category)) fe.category = 'Elegí una categoría'
  const img = imageFromForm(form)
  if (img.error) fe.image = img.error
  if (Object.keys(fe).length) return fe.image && Object.keys(fe).length === 1 ? { message: fe.image } : { fieldErrors: fe }

  const row = {
    name,
    description: clean(raw.description, 300),
    category,
    price_cents: price!,
    always_available: raw.always_available === 'on',
    active: raw.active === 'on',
    sort: Number(raw.sort) || 0,
  }
  const db = await buffetDb()
  const res = itemId
    ? await db.from('buffet_items').update(row).eq('id', itemId).eq('org_id', ctx.org.id).select('id, image_path').single()
    : await db.from('buffet_items').insert({ ...row, org_id: ctx.org.id }).select('id, image_path').single()
  if (res.error) return { message: dbMessage(res.error) }
  const saved = res.data as { id: string; image_path: string | null }

  let note = ''
  if (img.bytes) {
    const path = await uploadImage(db, ctx.org.id, saved.id, img.bytes)
    if (!path) note = ', pero no se pudo guardar la foto. Probá de nuevo'
    else {
      const { error } = await db.from('buffet_items').update({ image_path: path }).eq('id', saved.id).eq('org_id', ctx.org.id)
      if (error) {
        await db.storage.from(BUFFET_BUCKET).remove([path])
        note = ', pero no se pudo guardar la foto. Probá de nuevo'
      } else if (saved.image_path) await db.storage.from(BUFFET_BUCKET).remove([saved.image_path])
    }
  } else if (form.get('removeImage') === '1' && saved.image_path) {
    const { error } = await db.from('buffet_items').update({ image_path: null }).eq('id', saved.id).eq('org_id', ctx.org.id)
    if (!error) await db.storage.from(BUFFET_BUCKET).remove([saved.image_path])
  }
  revalidatePath(`/${slug}`, 'layout')
  return { ok: true, message: `${itemId ? 'Producto actualizado' : 'Producto agregado a la carta'}${note}.` }
}

export async function deleteBuffetItem(slug: string, itemId: string, _prev: ActionState): Promise<ActionState> {
  const ctx = await buffetCtx(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const db = await buffetDb()
  const { data, error } = await db.from('buffet_items').delete().eq('id', itemId).eq('org_id', ctx.org.id).select('image_path').maybeSingle()
  if (error) return { message: dbMessage(error) }
  const path = (data as { image_path: string | null } | null)?.image_path
  if (path) await db.storage.from(BUFFET_BUCKET).remove([path])
  revalidatePath(`/${slug}`, 'layout')
  return { ok: true, message: 'Producto borrado de la carta (los pedidos viejos lo siguen mostrando).' }
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

export async function saveMenuEntry(slug: string, date: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await buffetCtx(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  if (!YMD.test(date)) return { message: 'Fecha inválida.' }
  const raw = formObject(form)
  const itemId = raw.item_id ?? ''
  if (!itemId) return { fieldErrors: { item_id: 'Elegí un producto de la carta' } }
  const fe: Record<string, string> = {}
  let price: number | null = null
  if ((raw.price ?? '').trim()) {
    price = toCents(raw.price!)
    if (price === null) fe.price = 'Precio inválido'
  }
  let stock: number | null = null
  if ((raw.stock ?? '').trim()) {
    const n = Number(raw.stock)
    if (!Number.isInteger(n) || n < 0 || n > 10000) fe.stock = 'Cantidad entera (vacío = sin límite)'
    else stock = n
  }
  if (Object.keys(fe).length) return { fieldErrors: fe }
  const db = await buffetDb()
  const { error } = await db
    .from('buffet_menu')
    .upsert({ org_id: ctx.org.id, menu_date: date, item_id: itemId, price_cents: price, stock, sort: Number(raw.sort) || 0 },
      { onConflict: 'org_id,menu_date,item_id' })
  if (error) return { message: dbMessage(error) }
  revalidatePath(`/${slug}`, 'layout')
  return { ok: true, message: 'Menú actualizado.' }
}

export async function removeMenuEntry(slug: string, date: string, itemId: string, _prev: ActionState): Promise<ActionState> {
  const ctx = await buffetCtx(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const db = await buffetDb()
  const { error } = await db.from('buffet_menu').delete().eq('org_id', ctx.org.id).eq('menu_date', date).eq('item_id', itemId)
  if (error) return { message: dbMessage(error) }
  revalidatePath(`/${slug}`, 'layout')
  return { ok: true, message: 'Sacado del menú de ese día.' }
}

/** Copia el menú de otro día (sin las porciones vendidas: solo qué platos, precio y porciones). */
export async function copyMenu(slug: string, toDate: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await buffetCtx(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const from = String(form.get('from') ?? '')
  if (!YMD.test(from) || !YMD.test(toDate)) return { message: 'Fecha inválida.' }
  if (from === toDate) return { message: 'Elegí otro día para copiar.' }
  const db = await buffetDb()
  const { data, error } = await db.from('buffet_menu').select('item_id, price_cents, stock, sort').eq('org_id', ctx.org.id).eq('menu_date', from)
  if (error) return { message: dbMessage(error) }
  const rows = (data ?? []) as { item_id: string; price_cents: number | null; stock: number | null; sort: number }[]
  if (!rows.length) return { message: 'Ese día no tenía menú cargado.' }
  const { error: e2 } = await db
    .from('buffet_menu')
    .upsert(rows.map((r) => ({ ...r, org_id: ctx.org.id, menu_date: toDate })), { onConflict: 'org_id,menu_date,item_id' })
  if (e2) return { message: dbMessage(e2) }
  revalidatePath(`/${slug}`, 'layout')
  return { ok: true, message: `Se copiaron ${rows.length} platos.` }
}

export async function updateBuffetOrder(slug: string, orderId: string, action: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await buffetCtx(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const db = await buffetDb()
  const { data, error } = await db.rpc('buffet_update_order', {
    p_order: orderId,
    p_action: action,
    p_paid_via: String(form.get('paid_via') ?? '') || null,
    p_reason: String(form.get('reason') ?? '') || null,
  })
  if (error) return { message: buffetMessage(error) }
  revalidatePath(`/${slug}/admin/buffet`, 'layout')
  const refund = (data as { refund_needed?: boolean } | null)?.refund_needed
  const msg: Record<string, string> = {
    ready: 'Marcado como listo.',
    deliver: 'Entregado.',
    undo_deliver: 'Vuelve a estar pendiente de entrega.',
    cancel: refund
      ? 'Pedido cancelado. Estaba pagado por Mercado Pago: pedile al administrador del gimnasio que haga la devolución.'
      : 'Pedido cancelado.',
  }
  return { ok: true, message: msg[action] ?? 'Listo.' }
}

export async function addBuffetPayout(slug: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('billing.write')) return { message: ERRORS.FORBIDDEN }
  const raw = formObject(form)
  const amount = toCents(raw.amount ?? '')
  const fe: Record<string, string> = {}
  if (!amount) fe.amount = 'Monto inválido'
  if (!YMD.test(raw.paid_on ?? '')) fe.paid_on = 'Fecha inválida'
  if (Object.keys(fe).length) return { fieldErrors: fe }
  const db = await buffetDb()
  const { error } = await db.from('buffet_payouts').insert({ org_id: ctx.org.id, amount_cents: amount, paid_on: raw.paid_on, note: clean(raw.note, 200) })
  if (error) return { message: dbMessage(error) }
  revalidatePath(`/${slug}/admin/buffet/rendicion`)
  return { ok: true, message: 'Pago al buffet registrado.' }
}

export async function deleteBuffetPayout(slug: string, id: string, _prev: ActionState): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('billing.write')) return { message: ERRORS.FORBIDDEN }
  const db = await buffetDb()
  const { error } = await db.from('buffet_payouts').delete().eq('id', id).eq('org_id', ctx.org.id)
  if (error) return { message: dbMessage(error) }
  revalidatePath(`/${slug}/admin/buffet/rendicion`)
  return { ok: true, message: 'Registro borrado.' }
}
