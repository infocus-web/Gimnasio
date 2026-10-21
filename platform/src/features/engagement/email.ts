import 'server-only'

/**
 * Emails de los avisos automáticos: HTML con el estilo del gimnasio y envío por la API REST de Resend.
 * Sin RESEND_API_KEY no se envía nada (los avisos quedan "pendientes" y el panel lo avisa).
 */

const FROM = 'Evolution Fitness GYM <no-responder@evolutiongym.fitness>'

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY)
}

/** URL pública para el botón del email (sin depender del request: lo usa también el cron). */
export function publicBaseUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  return 'https://evolutiongym.fitness'
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export function buildEmail({ orgName, orgSlug, subject, body }: { orgName: string; orgSlug: string; subject: string; body: string }) {
  const appUrl = `${publicBaseUrl()}/${orgSlug}/app`
  const paragraphs = body
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#e4e4e7">${esc(p)}</p>`)
    .join('')
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#000000">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000000;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0b0b0c;border:1px solid #27272a;border-radius:20px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">
<tr><td style="background:#edcc36;padding:16px 24px">
<p style="margin:0;font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#000000">${esc(orgName)}</p>
</td></tr>
<tr><td style="padding:28px 24px 8px">
<h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:#ffffff">${esc(subject)}</h1>
${paragraphs}
</td></tr>
<tr><td style="padding:8px 24px 28px">
<a href="${esc(appUrl)}" style="display:inline-block;background:#edcc36;color:#000000;font-weight:800;font-size:15px;text-decoration:none;padding:14px 26px;border-radius:12px">Abrir la app</a>
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #27272a">
<p style="margin:0;font-size:12px;line-height:1.5;color:#71717a">Recibís este email porque sos socio de ${esc(orgName)}. Si no querés recibir más avisos, pedilo en recepción. Este correo no recibe respuestas.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`
  const text = `${subject}\n\n${body}\n\nAbrir la app: ${appUrl}\n\n— ${orgName}`
  return { html, text }
}

export type SendResult = { ok: true; id: string | null } | { ok: false; error: string; retry: boolean }

export async function sendEmail(input: { to: string; subject: string; html: string; text: string; idempotencyKey?: string }): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { ok: false, error: 'Falta conectar el envío de emails (RESEND_API_KEY).', retry: true }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : {}),
      },
      body: JSON.stringify({ from: FROM, to: [input.to], subject: input.subject, html: input.html, text: input.text }),
      signal: AbortSignal.timeout(15_000),
    })
    const data = (await res.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null
    if (res.ok) return { ok: true, id: data?.id ?? null }
    const error = `Resend ${res.status}: ${data?.message ?? data?.name ?? res.statusText}`
    return { ok: false, error, retry: res.status === 429 || res.status >= 500 }
  } catch (e) {
    return { ok: false, error: `Sin conexión con Resend: ${e instanceof Error ? e.message : String(e)}`, retry: true }
  }
}
