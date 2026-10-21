import type { NextRequest } from 'next/server'
import { mpConfigured } from '@/features/payments/mercadopago'
import { syncMpPayment } from '@/features/payments/sync'
import { dayPassInfo } from '@/features/payments/day-pass'

/**
 * Vuelta de Mercado Pago para los LINKS DE PAGO que manda recepción por WhatsApp
 * (el socio puede no tener la app ni sesión iniciada). Página simple y autocontenida.
 * Si vino con payment_id se consulta a MP y se aplica (idempotente) para no depender
 * de que el webhook llegue antes.
 */
export const dynamic = 'force-dynamic'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const estado = sp.get('estado')
  const paymentId = sp.get('payment_id') ?? sp.get('collection_id')
  let kind: 'ok' | 'pending' | 'fail' = estado === 'aprobado' ? 'ok' : estado === 'pendiente' ? 'pending' : 'fail'
  let until: string | null = null
  let passUrl: string | null = null
  let passByEmail = false
  const preferenceId = sp.get('preference_id')

  if (paymentId && /^\d{1,20}$/.test(paymentId) && mpConfigured() && process.env.SUPABASE_SECRET_KEY) {
    try {
      const r = await syncMpPayment(paymentId)
      if (r.ok) {
        kind = r.status === 'approved' ? 'ok' : r.status === 'rejected' || r.status === 'cancelled' ? 'fail' : 'pending'
        if (r.dayPass) {
          // El link del pase da acceso al gimnasio: solo se muestra si la vuelta trae la MISMA preferencia
          // con la que se compró (el payment_id solo, que aparece en comprobantes, no alcanza).
          const info = await dayPassInfo(r.intentId)
          if (info && preferenceId && info.preferenceId && preferenceId === info.preferenceId) passUrl = info.url
          else passByEmail = true
        }
        if (r.periodEnd) {
          until = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'long' }).format(new Date(r.periodEnd))
        }
      }
    } catch {
      /* se muestra lo que dijo MP en la URL; el webhook termina de aplicarlo */
    }
  }

  const ui = {
    ok: passUrl ? {
      color: '#34d399',
      title: '¡Pase comprado!',
      text: 'Te lo mandamos también por email. Abrilo en la entrada y mostrá el QR.',
    } : passByEmail ? {
      color: '#34d399',
      title: '¡Pase comprado!',
      text: 'Te mandamos el pase por email. Abrilo desde el celular en la entrada y mostrá el QR.',
    } : {
      color: '#34d399',
      title: '¡Pago aprobado!',
      text: until ? `Tu plan quedó al día hasta el ${esc(until)}. Ya podés entrar al gimnasio.` : 'Tu plan quedó renovado. Ya podés entrar al gimnasio.',
    },
    pending: {
      color: '#edcc36',
      title: 'Pago en proceso',
      text: 'Mercado Pago todavía está procesando el pago. Apenas se acredite queda listo solo (el plan se renueva o el pase te llega por email). No hace falta que pagues de nuevo.',
    },
    fail: {
      color: '#f87171',
      title: 'El pago no se completó',
      text: 'No se cobró nada. Podés volver a abrir el link para intentarlo con otro medio, o pagar en recepción.',
    },
  }[kind]

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(ui.title)} · Evolution Fitness GYM</title><meta name="robots" content="noindex">
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#000;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px}
.c{max-width:420px;width:100%;border:1px solid #27272a;background:#09090b;border-radius:24px;padding:32px 24px;text-align:center}
.d{width:64px;height:64px;border-radius:50%;margin:0 auto 16px;display:grid;place-items:center;border:2px solid ${ui.color};color:${ui.color};font-size:32px;font-weight:800}
h1{font-size:22px;margin:0 0 8px}p{color:#a1a1aa;line-height:1.5;margin:0 0 20px}
a{display:inline-flex;min-height:44px;align-items:center;justify-content:center;padding:0 20px;border-radius:12px;background:#edcc36;color:#000;font-weight:700;text-decoration:none}
a:focus-visible{outline:2px solid #fff;outline-offset:2px}</style></head>
<body><main class="c"><div class="d" aria-hidden="true">${kind === 'ok' ? '✓' : kind === 'pending' ? '…' : '!'}</div>
<h1>${esc(ui.title)}</h1><p>${ui.text}</p>${passUrl ? `<a href="${esc(passUrl)}">Abrir mi pase</a>` : '<a href="/">Ir a Evolution Fitness GYM</a>'}</main></body></html>`
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}
