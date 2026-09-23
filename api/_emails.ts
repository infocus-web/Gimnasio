// Contenido de cada email automático
import { emailLayout, esc, fmtDate, fmtMoney, getSettings, qrAttachment, sendEmail, siteUrl } from './_lib.js'

type Member = { id: string; first_name: string; last_name: string; email: string | null; qr_token: string; portal_token: string; paid_until: string | null }

const METHOD: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
  mercadopago: 'Mercado Pago',
  otro: 'Otro',
}

export async function sendWelcome(m: Member, req?: Request) {
  if (!m.email) throw new Error('El socio no tiene email')
  const gym = await getSettings()
  const portal = `${siteUrl(req)}/m/${m.portal_token}`
  const html = emailLayout(
    gym,
    `<h1 style="margin:0 0 12px;font-size:24px">¡Hola ${esc(m.first_name)}!</h1>
<p>Te damos la bienvenida a <b>${esc(gym.gym_name)}</b>. Este es tu código QR personal para entrar al gimnasio: mostralo en recepción desde el celular o impreso.</p>
<p style="text-align:center;margin:24px 0"><img src="cid:qr" alt="Tu código QR" width="220" height="220" style="border:1px solid #e4e4e7;border-radius:12px;padding:8px"></p>
<p>En tu link personal vas a encontrar siempre tu QR, tu rutina con videos de cada ejercicio, los horarios de las clases y el estado de tu cuota (y podés pagarla con Mercado Pago).</p>
<p style="color:#71717a;font-size:13px">Guardá este email o agregá el link a la pantalla de inicio del celular. No lo compartas: es personal.</p>`,
    { label: 'Abrir mi link personal', url: portal },
  )
  return sendEmail(m.email, `Tu acceso a ${gym.gym_name}`, html, [await qrAttachment(m.qr_token)])
}

export async function sendReceipt(
  m: Member,
  p: { amount: number; method: string; period_from: string; period_to: string; paid_at: string },
  planName: string | null,
  req?: Request,
) {
  if (!m.email) throw new Error('El socio no tiene email')
  const gym = await getSettings()
  const row = (k: string, v: string) =>
    `<tr><td style="padding:8px 0;color:#71717a">${k}</td><td style="padding:8px 0;text-align:right;font-weight:bold">${esc(v)}</td></tr>`
  const html = emailLayout(
    gym,
    `<h1 style="margin:0 0 12px;font-size:22px">¡Gracias por tu pago, ${esc(m.first_name)}!</h1>
<p>Registramos el siguiente pago:</p>
<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f4f4f5;border-bottom:1px solid #f4f4f5;margin:12px 0">
${row('Monto', fmtMoney(p.amount))}
${planName ? row('Plan', planName) : ''}
${row('Medio de pago', METHOD[p.method] ?? p.method)}
${row('Fecha', fmtDate(p.paid_at))}
${row('Período cubierto', `${fmtDate(p.period_from)} al ${fmtDate(p.period_to)}`)}
</table>
<p>Tu cuota queda al día hasta el <b>${fmtDate(p.period_to)}</b>. ¡Nos vemos en el gym!</p>`,
    { label: 'Ver mi cuenta', url: `${siteUrl(req)}/m/${m.portal_token}` },
  )
  return sendEmail(m.email, `Comprobante de pago · ${gym.gym_name}`, html)
}

export async function sendReminder(m: Member, daysLeft: number, planPrice: number | null) {
  const gym = await getSettings()
  const html = emailLayout(
    gym,
    `<h1 style="margin:0 0 12px;font-size:22px">Hola ${esc(m.first_name)} 👋</h1>
<p>Te avisamos que tu cuota vence ${daysLeft === 0 ? '<b>hoy</b>' : `en <b>${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}</b>`} (${fmtDate(m.paid_until)}).</p>
<p>Podés renovarla en recepción o pagarla online con Mercado Pago desde tu link personal${planPrice ? ` (${fmtMoney(planPrice)})` : ''}.</p>`,
    { label: 'Pagar mi cuota', url: `${siteUrl()}/m/${m.portal_token}` },
  )
  return sendEmail(m.email!, `Tu cuota vence ${daysLeft === 0 ? 'hoy' : `el ${fmtDate(m.paid_until)}`}`, html)
}

export async function sendExpired(m: Member) {
  const gym = await getSettings()
  const html = emailLayout(
    gym,
    `<h1 style="margin:0 0 12px;font-size:22px">Te extrañamos, ${esc(m.first_name)}</h1>
<p>Tu cuota venció el <b>${fmtDate(m.paid_until)}</b>. Renovala para seguir entrenando sin cortar la racha 💪</p>`,
    { label: 'Renovar ahora', url: `${siteUrl()}/m/${m.portal_token}` },
  )
  return sendEmail(m.email!, `Tu cuota en ${gym.gym_name} venció`, html)
}

export async function sendBirthday(m: Member) {
  const gym = await getSettings()
  const html = emailLayout(
    gym,
    `<h1 style="margin:0 0 12px;font-size:26px">¡Feliz cumpleaños, ${esc(m.first_name)}! 🎉</h1>
<p>Todo el equipo de <b>${esc(gym.gym_name)}</b> te desea un gran día. ¡Gracias por entrenar con nosotros!</p>`,
  )
  return sendEmail(m.email!, `¡Feliz cumple, ${m.first_name}!`, html)
}

export async function sendTest(to: string) {
  const gym = await getSettings()
  const html = emailLayout(gym, `<h1 style="margin:0 0 12px;font-size:22px">¡Funciona! ✅</h1><p>Los emails automáticos de ${esc(gym.gym_name)} están bien configurados.</p>`)
  return sendEmail(to, `Prueba de email · ${gym.gym_name}`, html)
}
