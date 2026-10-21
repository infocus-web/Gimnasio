'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAdminContext } from '@/features/admin/context'
import { dbMessage, formObject, type ActionState } from '@/features/admin/errors'
import { buildEmail, emailConfigured, sendEmail } from './email'
import { NOTICE_META, engagementErrorText, renderTemplate, sampleVars, type NoticeKind } from './shared'

const KINDS = Object.keys(NOTICE_META) as [NoticeKind, ...NoticeKind[]]

function errorText(error: { message: string; code?: string; hint?: string | null }) {
  return engagementErrorText(error) ?? dbMessage(error)
}

async function ctxFor(slug: string, needManage: boolean) {
  const ctx = await getAdminContext(slug)
  if (!ctx || !ctx.can('members.write')) return null
  if (needManage && !ctx.can('automations.manage') && !ctx.can('org.manage')) return null
  return ctx
}

const FORBIDDEN: ActionState = { message: 'No tenés permiso para esta acción.' }

const noticeSchema = z.object({
  kind: z.enum(KINDS),
  subject: z.string().trim().min(1, 'Escribí el asunto').max(150, 'Máximo 150 caracteres'),
  body: z.string().trim().min(1, 'Escribí el texto').max(1500, 'Máximo 1500 caracteres'),
})

export async function saveNotice(slug: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await ctxFor(slug, true)
  if (!ctx) return FORBIDDEN
  const parsed = noticeSchema.safeParse(formObject(form))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message
    return { message: 'Revisá los datos marcados.', fieldErrors }
  }
  const enabled = form.get('enabled') === 'on'
  const supabase = await createClient()
  const { error } = await supabase.rpc('engagement_save_notice', {
    p_org: ctx.org.id,
    p_kind: parsed.data.kind,
    p_enabled: enabled,
    p_subject: parsed.data.subject,
    p_body: parsed.data.body,
  })
  if (error) return { message: errorText(error) }
  revalidatePath(`/${slug}/admin/comunicacion`)
  return { ok: true, message: enabled ? 'Guardado. El aviso está activado.' : 'Guardado. El aviso está apagado.' }
}

const int = (min: number, max: number, msg: string) => z.coerce.number().int(msg).min(min, msg).max(max, msg)
const rulesSchema = z.object({
  birthdayGiftDays: int(0, 7, 'Entre 0 y 7 días'),
  referralRewardDays: int(0, 60, 'Entre 0 y 60 días'),
  freezeMaxDays: int(0, 90, 'Entre 0 y 90 días'),
})

export async function saveRules(slug: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await ctxFor(slug, true)
  if (!ctx) return FORBIDDEN
  const parsed = rulesSchema.safeParse(formObject(form))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message
    return { message: 'Revisá los datos marcados.', fieldErrors }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('engagement_save_rules', {
    p_org: ctx.org.id,
    p_birthday_gift_days: parsed.data.birthdayGiftDays,
    p_referral_reward_days: parsed.data.referralRewardDays,
    p_freeze_max_days_year: parsed.data.freezeMaxDays,
  })
  if (error) return { message: errorText(error) }
  revalidatePath(`/${slug}/admin/comunicacion`, 'layout')
  return { ok: true, message: 'Reglas guardadas.' }
}

/** Manda el aviso (con el texto que está en pantalla, sin guardar) al email de quien está logueado. */
export async function sendTestEmail(slug: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await ctxFor(slug, false)
  if (!ctx) return FORBIDDEN
  const parsed = noticeSchema.safeParse(formObject(form))
  if (!parsed.success) return { message: 'Completá el asunto y el texto antes de probar.' }
  if (!emailConfigured()) {
    return { message: 'Falta conectar el envío de emails: hay que cargar RESEND_API_KEY en Vercel. Mientras tanto los avisos quedan pendientes.' }
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return { message: 'Tu usuario no tiene email.' }
  const vars = sampleVars(parsed.data.kind, ctx.org.name, String(user.user_metadata?.full_name ?? 'Martina'))
  const subject = `[Prueba] ${renderTemplate(parsed.data.subject, vars)}`
  const body = renderTemplate(parsed.data.body, vars)
  const { html, text } = buildEmail({ orgName: ctx.org.name, orgSlug: ctx.org.slug, subject, body })
  const res = await sendEmail({ to: user.email, subject, html, text })
  if (!res.ok) return { message: `No se pudo enviar: ${res.error}` }
  return { ok: true, message: `Listo: te mandamos la prueba a ${user.email}. Revisá también la carpeta de spam.` }
}

export async function markContacted(slug: string, memberId: string): Promise<ActionState> {
  const ctx = await ctxFor(slug, false)
  if (!ctx) return FORBIDDEN
  if (!z.uuid().safeParse(memberId).success) return { message: 'Socio inválido.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('engagement_mark_contacted', { p_member: memberId })
  if (error) return { message: errorText(error) }
  revalidatePath(`/${slug}/admin/comunicacion/riesgo`)
  return { ok: true, message: 'Marcado como contactado: no aparece en la lista por 14 días.' }
}

const referralSchema = z.object({
  memberId: z.uuid('Elegí el socio nuevo'),
  code: z.string().trim().min(3, 'Escribí el código').max(200),
})

export async function applyReferral(slug: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await ctxFor(slug, false)
  if (!ctx) return FORBIDDEN
  const parsed = referralSchema.safeParse(formObject(form))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message
    return { message: 'Revisá los datos marcados.', fieldErrors }
  }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('referral_apply', { p_member_new: parsed.data.memberId, p_code: parsed.data.code })
  if (error) return { message: errorText(error) }
  const r = (data ?? {}) as { referrer?: string; rewarded?: boolean }
  revalidatePath(`/${slug}/admin/comunicacion/referidos`)
  return {
    ok: true,
    message: r.rewarded
      ? `Referido registrado (lo recomendó ${r.referrer}). Como ya pagó, los dos recibieron sus días gratis.`
      : `Referido registrado (lo recomendó ${r.referrer}). Cuando registre su primer pago, los dos reciben los días gratis.`,
  }
}
