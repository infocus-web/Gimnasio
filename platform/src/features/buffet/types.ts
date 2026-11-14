/** Buffet (0052): tipos compartidos entre la web pública, la app del socio y el panel. */

export const BUFFET_BUCKET = 'buffet'

export const CATEGORIES = [
  { value: 'vianda', label: 'Viandas' },
  { value: 'sandwich', label: 'Sándwiches' },
  { value: 'licuado', label: 'Licuados y jugos' },
  { value: 'dulce', label: 'Tortas y dulces' },
  { value: 'cafeteria', label: 'Cafetería' },
  { value: 'bebida', label: 'Bebidas' },
  { value: 'otro', label: 'Otros' },
] as const
export type BuffetCategory = (typeof CATEGORIES)[number]['value']
export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]))

export interface BuffetDayItem {
  item_id: string
  name: string
  description: string | null
  category: BuffetCategory
  price_cents: number
  image_path: string | null
  /** true = está en el menú de ese día (plato del día); false = de la carta, siempre disponible */
  special: boolean
  stock: number | null
  /** Porciones que quedan (null = sin límite) */
  left: number | null
}

export interface BuffetDay {
  date: string
  /** false = ya pasó el horario de corte para pedir ese día */
  orderable: boolean
  items: BuffetDayItem[]
}

export interface BuffetCartaItem {
  item_id: string
  name: string
  description: string | null
  category: BuffetCategory
  price_cents: number
  image_path: string | null
  always_available: boolean
}

export interface BuffetPublic {
  org_id: string
  org_name: string
  currency: string
  today: string
  name: string
  tagline: string | null
  description: string | null
  cover_path: string | null
  pickup_text: string | null
  whatsapp: string | null
  order_cutoff: string
  accept_online: boolean
  accept_at_pickup: boolean
  days: BuffetDay[]
  carta: BuffetCartaItem[]
}

export type OrderStatus = 'pending_payment' | 'confirmed' | 'ready' | 'delivered' | 'cancelled'

export const ORDER_STATUS_UI: Record<OrderStatus, { label: string; className: string }> = {
  pending_payment: { label: 'Falta pagar', className: 'border-amber-500/40 bg-amber-500/10 text-amber-200' },
  confirmed: { label: 'Confirmado', className: 'border-sky-500/40 bg-sky-500/10 text-sky-200' },
  ready: { label: 'Listo para retirar', className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' },
  delivered: { label: 'Entregado', className: 'border-zinc-700 bg-zinc-900 text-zinc-400' },
  cancelled: { label: 'Cancelado', className: 'border-red-500/30 bg-red-500/10 text-red-300' },
}

export const PAID_VIA_LABEL: Record<string, string> = {
  mercadopago: 'Mercado Pago',
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  other: 'Otro',
}

export interface OrderRow {
  id: string
  member_id: string | null
  member_name: string
  pickup_date: string
  pickup_code: string
  status: OrderStatus
  pay_method: 'online' | 'at_pickup'
  total_cents: number
  currency: string
  note: string | null
  paid_at: string | null
  paid_via: string | null
  refunded_at: string | null
  created_at: string
  cancel_reason: string | null
  buffet_order_items: { name: string; quantity: number; unit_price_cents: number; subtotal_cents: number }[]
}

export const ORDER_SELECT =
  'id, member_id, member_name, pickup_date, pickup_code, status, pay_method, total_cents, currency, note, paid_at, paid_via, refunded_at, created_at, cancel_reason, buffet_order_items(name, quantity, unit_price_cents, subtotal_cents)'

/** Link público de una foto del buffet (o null). */
export function buffetImageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return null
  return `${base}/storage/v1/object/public/${BUFFET_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`
}

/** "Hoy", "Mañana" o "Jueves 14/11" a partir de YYYY-MM-DD (today en la zona del gimnasio). */
export function dayLabel(ymd: string, today: string, long = false) {
  const d = new Date(`${ymd}T12:00:00Z`)
  const t = new Date(`${today}T12:00:00Z`)
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Mañana'
  const fmt = new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: long ? 'long' : '2-digit' })
  const s = fmt.format(d).replace(',', '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function money(cents: number, currency = 'ARS') {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100)
}

/** "Menú de hoy" / "Menú de mañana" / "Menú del jueves 14 de noviembre" */
export function menuDayTitle(ymd: string, today: string) {
  const l = dayLabel(ymd, today, true)
  if (l === 'Hoy') return 'Menú de hoy'
  if (l === 'Mañana') return 'Menú de mañana'
  return `Menú del ${l.toLowerCase()}`
}
