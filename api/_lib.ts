// Utilidades compartidas por las funciones /api (no es un endpoint: empieza con "_")
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import QRCode from 'qrcode'

export const env = (k: string) => process.env[k] ?? ''

let admin: SupabaseClient | null = null
/** Cliente con permisos de servicio (solo en el servidor, nunca en el navegador). */
export function db(): SupabaseClient {
  if (!admin) {
    const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL')
    const key = env('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) throw new HttpError(500, 'Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en Vercel')
    admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  return admin
}

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await fn(req)
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500
      console.error(e)
      return json({ error: e instanceof Error ? e.message : 'Error' }, status)
    }
  }
}

/** Verifica que quien llama sea admin o staff (token de sesión de Supabase). */
export async function requireStaff(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'No autenticado')
  const { data, error } = await db().auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Sesión inválida')
  const { data: prof } = await db().from('profiles').select('role, email').eq('id', data.user.id).maybeSingle()
  if (!prof || !['admin', 'staff'].includes(prof.role)) throw new HttpError(403, 'Sin permiso')
  return { id: data.user.id, email: prof.email as string | null }
}

export function siteUrl(req?: Request) {
  const fromEnv = env('PUBLIC_SITE_URL').replace(/\/$/, '')
  if (fromEnv) return fromEnv
  if (req) return new URL(req.url).origin
  return env('VERCEL_PROJECT_PRODUCTION_URL') ? `https://${env('VERCEL_PROJECT_PRODUCTION_URL')}` : ''
}

/** Fecha de hoy en Argentina, formato YYYY-MM-DD */
export function todayAR(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 86400000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(now)
}

export const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—')
export const fmtMoney = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(n))

export async function getSettings() {
  const { data } = await db().from('settings').select('*').eq('id', 1).single()
  return data as { gym_name: string; logo_url: string | null; address: string | null; whatsapp: string | null; email: string | null; reminder_days: number }
}

// ---------------- emails (Resend) ----------------
export interface Attachment {
  filename: string
  content: string // base64
  content_id?: string
}

export async function sendEmail(to: string, subject: string, html: string, attachments: Attachment[] = []) {
  const key = env('RESEND_API_KEY')
  if (!key) throw new HttpError(500, 'Falta RESEND_API_KEY en Vercel')
  const from = env('EMAIL_FROM') || 'Gimnasio <onboarding@resend.dev>'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html, attachments: attachments.length ? attachments : undefined }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new HttpError(502, `Resend rechazó el email: ${body}`)
  }
  return res.json()
}

export async function qrAttachment(value: string): Promise<Attachment> {
  const buf = await QRCode.toBuffer(value, { width: 480, margin: 2, errorCorrectionLevel: 'M' })
  return { filename: 'mi-qr.png', content: buf.toString('base64'), content_id: 'qr' }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Plantilla base de todos los emails. `body` es HTML ya armado. */
export function emailLayout(gym: { gym_name: string; logo_url: string | null; address?: string | null; whatsapp?: string | null }, body: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#09090b;padding:22px 28px">
${gym.logo_url ? `<img src="${esc(gym.logo_url)}" alt="" height="36" style="vertical-align:middle;border-radius:8px;margin-right:10px">` : ''}
<span style="color:#edcc36;font-size:20px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;vertical-align:middle">${esc(gym.gym_name)}</span>
</td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.55">${body}
${cta ? `<p style="margin:28px 0 8px"><a href="${esc(cta.url)}" style="display:inline-block;background:#edcc36;color:#09090b;text-decoration:none;font-weight:bold;padding:13px 22px;border-radius:0;text-transform:uppercase;letter-spacing:1px;font-size:13px">${esc(cta.label)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #f4f4f5;color:#a1a1aa;font-size:12px">
${esc(gym.gym_name)}${gym.address ? ` · ${esc(gym.address)}` : ''}${gym.whatsapp ? ` · WhatsApp ${esc(gym.whatsapp)}` : ''}
</td></tr></table></td></tr></table></body></html>`
}

export { esc }

/** Registra el envío para no repetirlo. Devuelve false si ya se había enviado. */
export async function claimEmail(memberId: string | null, kind: string, ref: string, to: string) {
  const { error } = await db().from('email_log').insert({ member_id: memberId, kind, ref, to_email: to, ok: true })
  if (error) {
    if (error.code === '23505') return false // ya enviado
    throw error
  }
  return true
}

export async function markEmailFailed(memberId: string | null, kind: string, ref: string, err: string) {
  await db().from('email_log').update({ ok: false, error: err.slice(0, 500) }).match({ member_id: memberId, kind, ref, ok: true })
}
