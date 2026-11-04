import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { publicSiteUrl } from './mercadopago'

export interface SignupInfo {
  email: string
  firstName: string | null
  orgSlug: string
  periodEnd: string | null
  hasAccount: boolean
  emailSentAt: string | null
}

/** Inscripción online ya aprobada (o null si todavía no se aprobó / no es una inscripción). */
export async function signupInfo(intentId: string): Promise<SignupInfo | null> {
  const db = createAdminClient()
  const { data: i } = await db
    .from('payment_intents')
    .select('org_id, kind, status, result, buyer_email, email_sent_at')
    .eq('id', intentId)
    .maybeSingle()
  const r = (i?.result ?? null) as { member_id?: string; first_name?: string; period_end?: string; has_account?: boolean } | null
  if (!i || i.kind !== 'signup' || i.status !== 'approved' || !r?.member_id || !i.buyer_email) return null
  const { data: o } = await db.from('organizations').select('slug').eq('id', i.org_id).single()
  if (!o) return null
  return {
    email: i.buyer_email,
    firstName: r.first_name ?? null,
    orgSlug: o.slug,
    periodEnd: r.period_end ?? null,
    hasAccount: !!r.has_account,
    emailSentAt: i.email_sent_at,
  }
}

/**
 * Después de pagar la inscripción: le manda UNA vez el email para entrar a la app.
 *  · Sin cuenta: invitación de Supabase (al crear el usuario se vincula solo con la ficha por email).
 *  · Con cuenta (por ejemplo de otro gimnasio): link para entrar sin contraseña.
 * Se "reserva" el envío con email_sent_at para que dos avisos de MP a la vez no manden dos emails.
 */
export async function sendSignupAccessOnce(intentId: string): Promise<'sent' | 'already' | 'pending' | 'none'> {
  const info = await signupInfo(intentId)
  if (!info) return 'none'
  if (info.emailSentAt) return 'already'

  const db = createAdminClient()
  const { data: claimed } = await db
    .from('payment_intents')
    .update({ email_sent_at: new Date().toISOString() })
    .eq('id', intentId)
    .is('email_sent_at', null)
    .select('id')
  if (!claimed?.length) return 'already'

  const next = `/${info.orgSlug}/app`
  const redirectTo = `${publicSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`
  try {
    let error: { message: string } | null = null
    if (!info.hasAccount) {
      ;({ error } = await db.auth.admin.inviteUserByEmail(info.email, {
        redirectTo,
        data: { full_name: info.firstName ?? undefined },
      }))
      // Ya tenía usuario (se creó entre medio): se manda el link para entrar
      if (error && /already|registered|exists/i.test(error.message)) error = await otp(info.email, redirectTo)
    } else {
      error = await otp(info.email, redirectTo)
    }
    if (error) throw new Error(error.message)
    return 'sent'
  } catch (e) {
    console.error('[inscripción] email', e instanceof Error ? e.message : e)
    await db.from('payment_intents').update({ email_sent_at: null }).eq('id', intentId)
    return 'pending'
  }
}

async function otp(email: string, redirectTo: string) {
  const anon = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } })
  return error ? { message: error.message } : null
}
