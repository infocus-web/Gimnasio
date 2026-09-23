// POST /api/email — envíos manuales desde el panel (bienvenida con QR, comprobante, prueba)
import { HttpError, db, handle, json, requireStaff } from './_lib.js'
import { sendReceipt, sendTest, sendWelcome } from './_emails.js'

export const POST = handle(async (req) => {
  const user = await requireStaff(req)
  const body = (await req.json().catch(() => ({}))) as { type?: string; member_id?: string; payment_id?: string }

  if (body.type === 'test') {
    if (!user.email) throw new HttpError(400, 'Tu usuario no tiene email')
    await sendTest(user.email)
    return json({ ok: true })
  }

  if (body.type === 'welcome') {
    const { data: m } = await db().from('members').select('*').eq('id', body.member_id).maybeSingle()
    if (!m) throw new HttpError(404, 'Socio no encontrado')
    if (!m.email) throw new HttpError(400, 'El socio no tiene email cargado')
    await sendWelcome(m, req)
    await db().from('email_log').insert({ member_id: m.id, kind: 'welcome', ref: new Date().toISOString(), to_email: m.email })
    return json({ ok: true })
  }

  if (body.type === 'receipt') {
    const { data: p } = await db().from('payments').select('*, members(*), plans(name)').eq('id', body.payment_id).maybeSingle()
    if (!p) throw new HttpError(404, 'Pago no encontrado')
    if (!p.members?.email) throw new HttpError(400, 'El socio no tiene email cargado')
    await sendReceipt(p.members, p, p.plans?.name ?? null, req)
    await db().from('email_log').insert({ member_id: p.member_id, kind: 'receipt', ref: p.id, to_email: p.members.email })
    return json({ ok: true })
  }

  throw new HttpError(400, 'Tipo de email desconocido')
})
