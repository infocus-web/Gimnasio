'use server'

import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPreference, mpConfigured, publicSiteUrl } from '@/features/payments/mercadopago'

export interface SignupState {
  error?: string
  fieldErrors?: Partial<Record<'plan' | 'firstName' | 'lastName' | 'document' | 'phone' | 'email' | 'birthDate' | 'terms', string>>
}

const DB_ERRORS: Record<string, { field?: keyof NonNullable<SignupState['fieldErrors']>; text: string }> = {
  PLAN_NOT_FOUND: { field: 'plan', text: 'Elegí un plan.' },
  FIRST_NAME_REQUIRED: { field: 'firstName', text: 'Escribí tu nombre.' },
  LAST_NAME_REQUIRED: { field: 'lastName', text: 'Escribí tu apellido.' },
  EMAIL_INVALID: { field: 'email', text: 'Revisá tu email: ahí te llega el acceso a la app.' },
  DOCUMENT_INVALID: { field: 'document', text: 'Escribí tu DNI, solo números.' },
  PHONE_INVALID: { field: 'phone', text: 'Escribí tu celular con código de área.' },
  BIRTH_DATE_INVALID: { field: 'birthDate', text: 'Revisá la fecha de nacimiento.' },
  ALREADY_MEMBER: {
    text: 'Ya sos socio y tenés un plan vigente. Entrá a la app con "Soy socio" y renovalo desde "Pagar", o consultá en recepción.',
  },
  TOO_MANY_ATTEMPTS: { text: 'Hiciste muchos intentos seguidos. Probá de nuevo en un rato.' },
  SIGNUP_BUSY: { text: 'Hay muchas inscripciones en curso en este momento. Probá de nuevo en unos minutos.' },
  ORG_NOT_FOUND: { text: 'No encontramos el gimnasio.' },
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function startSignup(slug: string, _prev: SignupState, form: FormData): Promise<SignupState> {
  const str = (k: string) => String(form.get(k) ?? '').trim()
  const v = {
    plan: str('plan'),
    firstName: str('firstName'),
    lastName: str('lastName'),
    document: str('document').replace(/\D/g, ''),
    phone: str('phone'),
    email: str('email').toLowerCase(),
    birthDate: str('birthDate'),
  }

  const fieldErrors: SignupState['fieldErrors'] = {}
  if (!UUID.test(v.plan)) fieldErrors.plan = 'Elegí un plan.'
  if (v.firstName.length < 2) fieldErrors.firstName = 'Escribí tu nombre.'
  if (v.lastName.length < 2) fieldErrors.lastName = 'Escribí tu apellido.'
  if (v.document.length < 6 || v.document.length > 10) fieldErrors.document = 'Escribí tu DNI, solo números.'
  if (v.phone.replace(/\D/g, '').length < 8) fieldErrors.phone = 'Escribí tu celular con código de área.'
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) fieldErrors.email = 'Revisá tu email: ahí te llega el acceso a la app.'
  if (v.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(v.birthDate)) fieldErrors.birthDate = 'Revisá la fecha de nacimiento.'
  if (form.get('terms') !== 'on') fieldErrors.terms = 'Tenés que aceptar para seguir.'
  if (Object.keys(fieldErrors).length) return { fieldErrors }

  if (!mpConfigured() || !process.env.SUPABASE_SECRET_KEY) {
    return { error: 'Por ahora la inscripción online no está disponible. Escribinos por WhatsApp o acercate a recepción.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('payment_intent_create_signup', {
    p_slug: slug,
    p_plan: v.plan,
    p_first_name: v.firstName,
    p_last_name: v.lastName,
    p_email: v.email,
    p_phone: v.phone,
    p_document: v.document,
    p_birth_date: v.birthDate || undefined,
  })
  if (error) {
    const code = error.message.trim()
    const known = DB_ERRORS[code]
    if (!known) {
      console.error('[inscripción]', error.message)
      return { error: 'No pudimos iniciar la inscripción. Probá de nuevo.' }
    }
    return known.field ? { fieldErrors: { [known.field]: known.text } } : { error: known.text }
  }

  const info = data as { intent_id: string; amount_cents: number; currency: string; plan_name: string; org_name: string }
  let initPoint: string
  try {
    const pref = await createPreference({
      intentId: info.intent_id,
      title: `${info.plan_name} · ${info.org_name}`,
      amountCents: Number(info.amount_cents),
      currency: info.currency,
      payer: { email: v.email, name: v.firstName, surname: v.lastName },
      backUrl: `${publicSiteUrl()}/api/payments/mercadopago/resultado`,
      expiresInHours: 2,
    })
    const { error: e2 } = await createAdminClient().rpc('payment_intent_set_preference', {
      p_intent: info.intent_id,
      p_preference_id: pref.id,
      p_init_point: pref.init_point,
    })
    if (e2) throw new Error(e2.message)
    initPoint = pref.init_point
  } catch (e) {
    console.error('[inscripción] preferencia', e instanceof Error ? e.message : e)
    return { error: 'No pudimos conectar con Mercado Pago. Probá de nuevo en unos minutos.' }
  }
  redirect(initPoint as Route)   // checkout de Mercado Pago (URL externa)
}
