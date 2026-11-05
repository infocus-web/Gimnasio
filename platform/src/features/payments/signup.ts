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
 * Después de pagar la inscripción: deja lista la cuenta para entrar a la app (UNA vez).
 *  · Eligió contraseña en el formulario (0041): se crea la cuenta con esa contraseña, sin email.
 *  · Sin cuenta ni contraseña guardada: invitación de Supabase (al crear el usuario se vincula solo con la ficha por email).
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

  // Eligió contraseña al inscribirse: se crea la cuenta con esa contraseña y no hace falta mandar ningún link
  if (!info.hasAccount) {
    const { data: hash } = await db.rpc('signup_password_hash', { p_intent: intentId })
    if (hash) {
      const { error } = await db.auth.admin.createUser({
        email: info.email,
        password_hash: hash,
        email_confirm: true, // el email lo validó Mercado Pago al cobrar; si no fuera suyo, el dueño lo recupera con "Olvidé mi contraseña"
        user_metadata: { full_name: info.firstName ?? undefined },
      })
      if (!error || /already|registered|exists/i.test(error.message)) {
        await db.rpc('signup_clear_password', { p_intent: intentId })
        // La ficha se vincula sola con la cuenta por el email (trigger handle_user_link)
        if (!error) return 'sent'
      } else {
        console.error('[inscripción] crear cuenta', error.message)
      }
    }
  }

  const next = `/${info.orgSlug}/app`
  const redirectTo = `${publicSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`
  try {
    let error: { message: string } | null = null
    if (!info.hasAccount) {
      // Invitación: al activarla elige su contraseña (después entra con email + contraseña)
      const choosePassword = `${publicSiteUrl()}/auth/callback?next=${encodeURIComponent(`/cuenta/clave?next=${encodeURIComponent(next)}`)}`
      ;({ error } = await db.auth.admin.inviteUserByEmail(info.email, {
        redirectTo: choosePassword,
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
