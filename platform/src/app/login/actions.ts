'use server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { publicSiteUrl } from '@/features/payments/mercadopago'

/**
 * Acceso de socios con usuario (DNI o email) + contraseña, y recuperación con código.
 * El email de un socio NUNCA se le devuelve a quien solo conoce el DNI:
 *  · Login con DNI: la base verifica DNI + contraseña y recién ahí devuelve el email (0041).
 *  · Recuperación: el email se resuelve y se usa acá en el servidor.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; loggedIn?: boolean }

const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)
const onlyDigits = (s: string) => s.replace(/\D/g, '')

async function resolveEmail(identifier: string): Promise<string | null> {
  const id = identifier.trim().toLowerCase()
  if (isEmail(id)) return id
  const dni = onlyDigits(id)
  if (dni.length < 6 || dni.length > 10) return null
  const { data } = await createAdminClient().rpc('member_email_by_document', { p_document: dni })
  return data ?? null
}

/** DNI + contraseña → email de la cuenta (solo si la contraseña es correcta). El celular inicia sesión con eso. */
export async function emailForDniLogin(dni: string, password: string): Promise<Result<{ email: string }>> {
  const doc = onlyDigits(dni)
  if (doc.length < 6 || doc.length > 10) return { ok: false, error: 'Escribí tu DNI (solo números) o tu email.' }
  const { data, error } = await createAdminClient().rpc('member_login_email', { p_document: doc, p_password: password })
  if (error) {
    if (error.message.includes('TOO_MANY_ATTEMPTS')) {
      return { ok: false, error: 'Demasiados intentos con ese DNI. Esperá 15 minutos o tocá "Olvidé mi contraseña".' }
    }
    console.error('[login dni]', error.message)
    return { ok: false, error: 'No pudimos verificar tus datos. Probá de nuevo.' }
  }
  if (!data) return { ok: false, error: 'DNI o contraseña incorrectos.' }
  return { ok: true, email: data }
}

/** Manda el código de 6 números para elegir una contraseña nueva. Responde igual exista o no la cuenta. */
export async function sendPasswordResetCode(identifier: string): Promise<Result> {
  const email = await resolveEmail(identifier)
  if (email) {
    const anon = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error } = await anon.auth.resetPasswordForEmail(email, {
      // Si en vez del código tocan el botón del email, llegan con la sesión iniciada a elegir la contraseña nueva
      redirectTo: `${publicSiteUrl()}/login?nueva=1`,
    })
    if (error) {
      if (error.status === 429 || (error.code ?? '').includes('rate_limit')) {
        return { ok: false, error: 'Ya te mandamos un código hace un momento. Revisá tu correo (también Spam) o probá de nuevo en un minuto.' }
      }
      console.error('[recuperar clave]', error.message)
    }
  }
  return { ok: true }
}

/** Código del email + contraseña nueva → queda con la sesión iniciada y la contraseña cambiada. */
export async function resetPasswordWithCode(identifier: string, code: string, password: string): Promise<Result> {
  const token = onlyDigits(code)
  if (token.length < 6) return { ok: false, error: 'El código tiene 6 números.' }
  if (password.length < 8) return { ok: false, error: 'La contraseña tiene que tener al menos 8 caracteres.' }
  if (password.length > 72) return { ok: false, error: 'La contraseña es demasiado larga (máximo 72 caracteres).' }
  const email = await resolveEmail(identifier)
  if (!email) return { ok: false, error: 'El código no es correcto o ya venció. Revisalo o pedí uno nuevo.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' })
  if (error) {
    return {
      ok: false,
      error: error.status === 429 ? 'Demasiados intentos. Esperá un minuto y probá de nuevo.' : 'El código no es correcto o ya venció. Revisalo o pedí uno nuevo.',
    }
  }
  const { error: e2 } = await supabase.auth.updateUser({ password })
  if (e2) {
    if (e2.code === 'same_password') return { ok: true } // ya era esa: igual queda adentro
    // El código ya se usó y la sesión quedó iniciada: se sigue en el paso "contraseña nueva"
    if (e2.code === 'weak_password') return { ok: false, loggedIn: true, error: 'Esa contraseña es muy fácil. Probá con otra más larga o con números.' }
    console.error('[recuperar clave] update', e2.message)
    return { ok: false, loggedIn: true, error: 'No pudimos guardar la contraseña nueva. Probá de nuevo.' }
  }
  return { ok: true }
}
