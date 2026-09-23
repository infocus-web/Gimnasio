// GET /api/cron/reminders — lo ejecuta Vercel todos los días (ver vercel.json)
// Envía: aviso de vencimiento próximo, aviso de cuota vencida y saludo de cumpleaños.
import { claimEmail, db, env, getSettings, handle, json, markEmailFailed, todayAR } from '../_lib.js'
import { sendBirthday, sendExpired, sendReminder } from '../_emails.js'

export const GET = handle(async (req) => {
  const secret = env('CRON_SECRET')
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'No autorizado' }, 401)

  const gym = await getSettings()
  const days = gym.reminder_days ?? 3
  const reminderDate = todayAR(days)
  const yesterday = todayAR(-1)
  const today = todayAR()
  const result = { reminders: 0, expired: 0, birthdays: 0, errors: [] as string[] }

  const { data: members } = await db()
    .from('members')
    .select('id, first_name, last_name, email, qr_token, portal_token, paid_until, birth_date, plans(price)')
    .eq('active', true)
    .not('email', 'is', null)
    .or(`paid_until.eq.${reminderDate},paid_until.eq.${yesterday},birth_date.not.is.null`)

  for (const m of members ?? []) {
    const price = (Array.isArray(m.plans) ? m.plans[0]?.price : (m.plans as { price: number } | null)?.price) ?? null
    const jobs: [kind: string, ref: string, send: () => Promise<unknown>][] = []
    if (m.paid_until === reminderDate) jobs.push(['reminder', m.paid_until, () => sendReminder(m, days, price)])
    if (m.paid_until === yesterday) jobs.push(['expired', m.paid_until, () => sendExpired(m)])
    if (m.birth_date && m.birth_date.slice(5) === today.slice(5)) jobs.push(['birthday', today.slice(0, 4), () => sendBirthday(m)])

    for (const [kind, ref, send] of jobs) {
      try {
        if (!(await claimEmail(m.id, kind, ref, m.email!))) continue
        await send()
        if (kind === 'reminder') result.reminders++
        else if (kind === 'expired') result.expired++
        else result.birthdays++
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        result.errors.push(`${m.email}: ${msg}`)
        await markEmailFailed(m.id, kind, ref, msg)
      }
    }
  }
  return json(result)
})
