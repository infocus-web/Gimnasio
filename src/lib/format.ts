import type { MemberStatus, PayMethod } from './types'

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
export const fmtMoney = (n: number | null | undefined) => money.format(Number(n ?? 0))

/** Fechas "YYYY-MM-DD" se interpretan como fecha local (sin corrimiento de zona). */
function parse(d: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00`) : new Date(d)
}

export const fmtDate = (d: string | null | undefined) =>
  d ? parse(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

export const fmtDateLong = (d: string | null | undefined) =>
  d ? parse(d).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }) : '—'

export const fmtDateTime = (d: string | null | undefined) =>
  d
    ? new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    : '—'

export const fmtTime = (t: string | null | undefined) => (t ? t.slice(0, 5) : '')

export const todayISO = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export const WEEKDAYS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
export const WEEKDAYS_SHORT = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export const STATUS_LABEL: Record<MemberStatus, string> = {
  al_dia: 'Al día',
  por_vencer: 'Por vencer',
  vencido: 'Vencido',
  inactivo: 'Inactivo',
}

export const METHOD_LABEL: Record<PayMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
  mercadopago: 'Mercado Pago',
  otro: 'Otro',
}

export const MUSCLE_GROUPS = ['Piernas', 'Glúteos', 'Pecho', 'Espalda', 'Hombros', 'Brazos', 'Abdomen', 'Cardio', 'Movilidad', 'Cuerpo completo']

export function daysLeftText(days: number | null | undefined) {
  if (days === null || days === undefined) return 'Sin pagos'
  if (days < 0) return `Vencida hace ${-days} ${-days === 1 ? 'día' : 'días'}`
  if (days === 0) return 'Vence hoy'
  return `${days} ${days === 1 ? 'día' : 'días'} restantes`
}

export function whatsappLink(phone: string | null | undefined, text = '') {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (!digits) return null
  if (!digits.startsWith('54')) digits = '549' + digits.replace(/^0/, '').replace(/^15/, '')
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

export const fullName = (m: { first_name: string; last_name: string }) => `${m.first_name} ${m.last_name}`.trim()

export const initials = (m: { first_name: string; last_name: string }) =>
  `${m.first_name[0] ?? ''}${m.last_name[0] ?? ''}`.toUpperCase()
