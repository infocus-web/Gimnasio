import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPreference, mpConfigured, publicSiteUrl } from '@/features/payments/mercadopago'
import { formatMoney } from '@/features/admin/format'

/**
 * Compra pública de un PASE POR DÍA con Mercado Pago (sin cuenta).
 *   GET  /api/payments/pase-diario?gym=evolution   → formulario
 *   POST (mismo URL)                              → crea la intención + preferencia y redirige a MP
 * Al aprobarse, el webhook emite el pase (private.issue_day_pass) y le manda el link por email.
 * El precio y la validez los define el dueño en Pagos → Pagos online.
 */
export const dynamic = 'force-dynamic'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const ERR: Record<string, string> = {
  DAY_PASS_NOT_FOR_SALE: 'Por ahora el pase por día no se vende online. Consultá en recepción.',
  NAME_REQUIRED: 'Escribí tu nombre y apellido.',
  EMAIL_INVALID: 'Revisá tu email: ahí te mandamos el pase.',
  TOO_MANY_ATTEMPTS: 'Hiciste muchos intentos seguidos. Probá de nuevo en un rato.',
  DAY_PASS_BUSY: 'Hay muchas compras en curso en este momento. Probá de nuevo en unos minutos o comprá el pase en recepción.',
  ORG_NOT_FOUND: 'No encontramos el gimnasio.',
}

interface Offer {
  enabled: boolean
  org_name: string
  slug: string
  price_cents: number | null
  days: number | null
  entries: number | null
}

async function getOffer(slug: string): Promise<Offer | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null
  const supabase = await createClient()
  const { data } = await supabase.rpc('public_day_pass_offer', { p_slug: slug })
  return (data as Offer | null) ?? null
}

function page(offer: Offer | null, slug: string, opts: { error?: string; values?: Record<string, string> } = {}) {
  const v = opts.values ?? {}
  const can = !!offer?.enabled && mpConfigured()
  const validity = offer?.days && offer.days > 1 ? `${offer.days} días` : 'el día de hoy'
  const body = !offer
    ? '<h1>Gimnasio no encontrado</h1><p>Revisá el link.</p>'
    : !can
      ? `<h1>${esc(offer.org_name)}</h1><p>Por ahora el pase por día no se vende online. Acercate a recepción y te lo hacemos ahí.</p>`
      : `<h1>Pase por día</h1>
<p class="s">${esc(offer.org_name)} · vale para ${validity}${offer.entries && offer.entries > 1 ? ` · ${offer.entries} entradas` : ''}</p>
<p class="p">${formatMoney(Number(offer.price_cents))}</p>
${opts.error ? `<p class="e" role="alert">${esc(opts.error)}</p>` : ''}
<form method="post" novalidate>
<input type="hidden" name="gym" value="${esc(slug)}">
<label>Nombre y apellido<input name="name" required maxlength="120" autocomplete="name" value="${esc(v.name ?? '')}"></label>
<label>Email (te mandamos el pase acá)<input name="email" type="email" required maxlength="200" autocomplete="email" value="${esc(v.email ?? '')}"></label>
<label>Celular (opcional)<input name="phone" inputmode="tel" maxlength="40" autocomplete="tel" value="${esc(v.phone ?? '')}"></label>
<label>DNI (opcional)<input name="document" inputmode="numeric" maxlength="15" value="${esc(v.document ?? '')}"></label>
<button type="submit">Pagar con Mercado Pago</button>
</form>
<p class="n">Después de pagar recibís un QR para entrar por el molinete o mostrar en recepción.</p>`
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pase por día · ${esc(offer?.org_name ?? 'Evolution Fitness GYM')}</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#000;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px}
main{max-width:420px;width:100%;border:1px solid #27272a;background:#09090b;border-radius:24px;padding:28px 22px}
h1{font-size:24px;margin:0 0 4px}.s{color:#a1a1aa;margin:0 0 12px}.p{font-size:32px;font-weight:800;margin:0 0 16px;color:#edcc36}
label{display:block;font-size:13px;color:#a1a1aa;margin:0 0 12px}input{display:block;width:100%;box-sizing:border-box;margin-top:4px;min-height:44px;border-radius:12px;border:1px solid #27272a;background:#000;color:#fff;padding:0 12px;font-size:16px}
input:focus-visible,button:focus-visible{outline:2px solid #edcc36;outline-offset:2px}
button{width:100%;min-height:48px;border:0;border-radius:12px;background:#edcc36;color:#000;font-weight:800;font-size:16px;cursor:pointer;margin-top:4px}
.e{border:1px solid #7f1d1d;background:#450a0a;color:#fecaca;border-radius:12px;padding:10px 12px}.n{color:#71717a;font-size:12px;margin-top:14px}p{line-height:1.5}</style></head>
<body><main>${body}</main></body></html>`
  return new Response(html, { status: offer ? 200 : 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('gym') ?? 'evolution'
  return page(await getOffer(slug), slug)
}

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const str = (k: string) => String(form.get(k) ?? '').trim()
  const slug = str('gym') || 'evolution'
  const values = { name: str('name'), email: str('email'), phone: str('phone'), document: str('document') }
  const offer = await getOffer(slug)
  if (!offer?.enabled || !mpConfigured() || !process.env.SUPABASE_SECRET_KEY) return page(offer, slug)

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('payment_intent_create_day_pass', {
    p_slug: slug,
    p_name: values.name,
    p_email: values.email,
    p_phone: values.phone || undefined,
    p_document: values.document || undefined,
  })
  if (error) {
    const code = error.message.trim()
    if (!ERR[code]) console.error('[pase online]', error.message)
    return page(offer, slug, { error: ERR[code] ?? 'No pudimos iniciar el pago. Probá de nuevo.', values })
  }
  const info = data as { intent_id: string; amount_cents: number; currency: string; org_name: string }
  try {
    const [first, ...rest] = values.name.split(/\s+/)
    const pref = await createPreference({
      intentId: info.intent_id,
      title: `Pase por día · ${info.org_name}`,
      amountCents: Number(info.amount_cents),
      currency: info.currency,
      payer: { email: values.email, name: first ?? null, surname: rest.join(' ') || null },
      backUrl: `${publicSiteUrl()}/api/payments/mercadopago/resultado`,
      expiresInHours: 2,
    })
    // La intención pública no tiene usuario: la preferencia la guarda el servidor
    const { error: e2 } = await createAdminClient().rpc('payment_intent_set_preference', {
      p_intent: info.intent_id,
      p_preference_id: pref.id,
      p_init_point: pref.init_point,
    })
    if (e2) throw new Error(e2.message)
    return Response.redirect(pref.init_point, 303)
  } catch (e) {
    console.error('[pase online] preferencia', e instanceof Error ? e.message : e)
    return page(offer, slug, { error: 'No pudimos conectar con Mercado Pago. Probá de nuevo en unos minutos.', values })
  }
}
