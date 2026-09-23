// POST /api/mp/checkout — el socio (desde su link personal) inicia el pago de su cuota
import { HttpError, db, env, handle, json, siteUrl } from '../_lib.js'

export const POST = handle(async (req) => {
  const { token } = (await req.json().catch(() => ({}))) as { token?: string }
  if (!token || token.length < 20) throw new HttpError(400, 'Link inválido')

  const accessToken = env('MP_ACCESS_TOKEN')
  if (!accessToken) throw new HttpError(503, 'El pago online todavía no está habilitado. Consultá en recepción.')

  const { data: m } = await db()
    .from('members')
    .select('id, first_name, last_name, email, portal_token, active, plans(id, name, price, duration_days)')
    .eq('portal_token', token)
    .maybeSingle()
  if (!m) throw new HttpError(404, 'Socio no encontrado')
  const plan = (Array.isArray(m.plans) ? m.plans[0] : m.plans) as { id: string; name: string; price: number } | null
  if (!plan) throw new HttpError(400, 'No tenés un plan asignado. Consultá en recepción.')
  if (Number(plan.price) <= 0) throw new HttpError(400, 'El plan no tiene precio cargado')

  const { data: gym } = await db().from('settings').select('gym_name').eq('id', 1).single()
  const site = siteUrl(req)
  const portal = `${site}/m/${m.portal_token}`

  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        {
          id: plan.id,
          title: `${gym?.gym_name ?? 'Gimnasio'} · ${plan.name}`,
          quantity: 1,
          unit_price: Number(plan.price),
          currency_id: 'ARS',
        },
      ],
      payer: m.email ? { email: m.email, name: m.first_name, surname: m.last_name } : undefined,
      external_reference: `${m.id}|${plan.id}`,
      notification_url: `${site}/api/mp/webhook`,
      back_urls: { success: `${portal}?pago=ok`, pending: `${portal}?pago=pendiente`, failure: `${portal}?pago=error` },
      auto_return: 'approved',
      statement_descriptor: (gym?.gym_name ?? 'GIMNASIO').slice(0, 22),
      expires: true,
      expiration_date_to: new Date(Date.now() + 2 * 86400000).toISOString(),
    }),
  })
  const pref = (await res.json()) as { init_point?: string; message?: string }
  if (!res.ok || !pref.init_point) throw new HttpError(502, `Mercado Pago: ${pref.message ?? 'no se pudo iniciar el pago'}`)
  return json({ url: pref.init_point })
})
