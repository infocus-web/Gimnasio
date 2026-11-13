'use server'

import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPreference, mpConfigured, publicSiteUrl } from '@/features/payments/mercadopago'
import { saveMemberPhoto } from '@/features/admin/member-files'
import { getSignupProfile } from './signup-profile'

export interface ProfileState {
  error?: string
  fieldErrors?: Partial<Record<'firstName' | 'lastName' | 'document' | 'phone' | 'birthDate' | 'photo' | 'terms', string>>
}

const DOC_TAKEN = 'Ese DNI ya está registrado en el gimnasio con otro email. Escribinos o acercate a recepción y lo resolvemos.'

/**
 * Paso 1 de la inscripción online: datos personales + foto de socio.
 * Crea la ficha (estado "lead": todavía sin plan) vinculada a la cuenta logueada,
 * o completa la que ya tenía. El plan y el pago vienen en el paso 2.
 * Usa la clave secreta porque el socio no puede crear su ficha ni cargar su foto
 * (ver 0027); todo queda atado a la cuenta logueada con email confirmado.
 */
export async function saveSignupProfile(slug: string, next: string, _prev: ProfileState, form: FormData): Promise<ProfileState> {
  const str = (k: string) => String(form.get(k) ?? '').trim()
  const v = {
    firstName: str('firstName').replace(/\s+/g, ' '),
    lastName: str('lastName').replace(/\s+/g, ' '),
    document: str('document').replace(/\D/g, ''),
    phone: str('phone'),
    birthDate: str('birthDate'),
    photo: str('photo'),
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email || !user.email_confirmed_at) {
    return { error: 'Para inscribirte primero creá tu cuenta o ingresá. Recargá la página.' }
  }
  const email = user.email.toLowerCase()
  const current = await getSignupProfile(slug, user.id)
  // Viene de /soy-socio: ya es socio del gimnasio (sistema viejo), no elige plan ni paga online
  const existingMember = next.startsWith(`/${slug}/soy-socio`)

  const fieldErrors: ProfileState['fieldErrors'] = {}
  if (v.firstName.length < 2 || v.firstName.length > 60) fieldErrors.firstName = 'Escribí tu nombre.'
  if (v.lastName.length < 2 || v.lastName.length > 60) fieldErrors.lastName = 'Escribí tu apellido.'
  if (v.document.length < 6 || v.document.length > 10) fieldErrors.document = 'Escribí tu DNI, solo números.'
  if (v.phone.replace(/\D/g, '').length < 8 || v.phone.length > 40) fieldErrors.phone = 'Escribí tu celular con código de área.'
  if (v.birthDate) {
    const age = (Date.now() - new Date(`${v.birthDate}T12:00:00`).getTime()) / (365.25 * 24 * 3600 * 1000)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.birthDate) || Number.isNaN(age) || age < 12 || age > 106) {
      fieldErrors.birthDate = 'Revisá la fecha de nacimiento.'
    }
  }
  if (!v.photo && !current?.photoPath) fieldErrors.photo = 'Sacate una foto: la usamos para reconocerte en la entrada.'
  if (form.get('terms') !== 'on') fieldErrors.terms = 'Tenés que aceptar para seguir.'
  if (Object.keys(fieldErrors).length) return { fieldErrors }

  if (!process.env.SUPABASE_SECRET_KEY) {
    return { error: 'Por ahora la inscripción online no está disponible. Escribinos por WhatsApp o acercate a recepción.' }
  }
  const admin = createAdminClient()
  const { data: org } = await admin.from('organizations').select('id').eq('slug', slug).maybeSingle()
  if (!org) return { error: 'No encontramos el gimnasio.' }

  const data = {
    first_name: v.firstName,
    last_name: v.lastName,
    document_id: v.document,
    phone: v.phone,
    birth_date: v.birthDate || null,
  }
  let memberId = current?.memberId ?? null

  if (!memberId) {
    // ¿Recepción ya le había cargado una ficha (mismo email o DNI) sin cuenta vinculada?
    const base = () => admin.from('members').select('id, email, document_id, user_id').eq('org_id', org.id).neq('status', 'archived')
    const [byEmail, byDoc] = await Promise.all([
      base().ilike('email', email.replace(/[\\%_]/g, (c) => `\\${c}`)).is('user_id', null).limit(1).maybeSingle(),
      base().eq('document_id', v.document).limit(1).maybeSingle(),
    ])
    const sameEmail = byEmail.data
    const sameDoc = byDoc.data
    if (sameDoc && sameDoc.id !== sameEmail?.id && (sameDoc.user_id || (sameDoc.email ?? '').toLowerCase() !== email)) {
      return { fieldErrors: { document: DOC_TAKEN } }
    }
    const existing = sameEmail ?? sameDoc
    if (existing) {
      // Ficha del gimnasio sin cuenta: se vincula a esta cuenta y se actualizan los datos
      const { error } = await admin.from('members').update({ ...data, user_id: user.id, email }).eq('id', existing.id)
      if (error) {
        console.error('[inscripción · datos] vincular', error.message)
        return error.code === '23505' ? { fieldErrors: { document: DOC_TAKEN } } : { error: 'No pudimos guardar tus datos. Probá de nuevo.' }
      }
      memberId = existing.id
    } else {
      const { data: loc } = await admin
        .from('locations')
        .select('id')
        .eq('org_id', org.id)
        .eq('active', true)
        .order('created_at')
        .limit(1)
        .maybeSingle()
      const { data: created, error } = await admin
        .from('members')
        .insert({ org_id: org.id, ...data, email, user_id: user.id, status: 'lead', home_location_id: loc?.id ?? null, tags: existingMember ? ['web', 'socio-existente'] : ['web'] })
        .select('id')
        .single()
      if (error || !created) {
        console.error('[inscripción · datos] alta', error?.message)
        return error?.code === '23505' ? { fieldErrors: { document: DOC_TAKEN } } : { error: 'No pudimos guardar tus datos. Probá de nuevo.' }
      }
      memberId = created.id
    }
  } else {
    const { error } = await admin.from('members').update(data).eq('id', memberId)
    if (error) {
      console.error('[inscripción · datos] actualizar', error.message)
      return error.code === '23505' ? { fieldErrors: { document: DOC_TAKEN } } : { error: 'No pudimos guardar tus datos. Probá de nuevo.' }
    }
  }

  if (v.photo) {
    const photoError = await saveMemberPhoto(admin, org.id, memberId, v.photo)
    if (photoError) return { fieldErrors: { photo: `${photoError} Probá sacarla de nuevo.` } }
  }

  redirect((existingMember ? `/${slug}/soy-socio` : next.startsWith(`/${slug}/inscripcion`) ? next : `/${slug}/inscripcion`) as Route)
}

export interface DuplicateNotice {
  /** warn: hay que resolverlo (no va a poder guardar) · info: todo bien, solo avisa */
  tone: 'warn' | 'info'
  text: string
}

/** p•••@gmail.com: alcanza para que el socio reconozca su email sin exponerlo entero */
function maskEmail(email: string | null) {
  if (!email) return null
  const [user, domain] = email.split('@')
  return domain ? `${(user ?? '').slice(0, 1)}•••@${domain}` : null
}

/**
 * Chequeo silencioso mientras el socio completa sus datos (al salir del campo DNI o celular).
 * Devuelve null si no hay nada que avisar. Solo para cuentas logueadas con email confirmado;
 * nunca devuelve nombres ni datos de otra ficha (a lo sumo el email enmascarado de su propia cuenta vieja).
 */
export async function checkSignupDuplicate(slug: string, field: 'document' | 'phone', raw: string): Promise<DuplicateNotice | null> {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (field === 'document' && (digits.length < 6 || digits.length > 10)) return null
  if (field === 'phone' && digits.length < 8) return null
  if (!process.env.SUPABASE_SECRET_KEY) return null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email || !user.email_confirmed_at) return null
  const email = user.email.toLowerCase()

  const admin = createAdminClient()
  const { data: org } = await admin.from('organizations').select('id').eq('slug', slug).maybeSingle()
  if (!org) return null
  const base = () => admin.from('members').select('id, email, user_id, phone').eq('org_id', org.id).neq('status', 'archived')

  if (field === 'document') {
    const { data: m } = await base().eq('document_id', digits).limit(1).maybeSingle()
    if (!m || m.user_id === user.id) return null
    if (m.user_id) {
      const masked = maskEmail(m.email)
      return {
        tone: 'warn',
        text: `Ese DNI ya tiene una cuenta en el gimnasio${masked ? ` (${masked})` : ''}. Cerrá sesión e ingresá con ese email, o escribinos y lo resolvemos.`,
      }
    }
    if ((m.email ?? '').toLowerCase() === email) {
      return { tone: 'info', text: '¡Te encontramos! Ya estás cargado/a en el gimnasio: al guardar, tu ficha queda vinculada a esta cuenta.' }
    }
    return { tone: 'warn', text: DOC_TAKEN }
  }

  // Celular: se compara por los últimos 8 dígitos (se guarda con distintos formatos)
  const tail = digits.slice(-8)
  const { data: rows } = await base().ilike('phone', `%${tail.slice(-4)}%`).limit(50)
  const other = (rows ?? []).find((r) => r.user_id !== user.id && (r.phone ?? '').replace(/\D/g, '').endsWith(tail))
  if (!other) return null
  if (!other.user_id && (other.email ?? '').toLowerCase() === email) return null
  return {
    tone: 'warn',
    text: 'Ese celular ya está registrado en otra ficha del gimnasio. Si ya tenés cuenta, ingresá con ese email; si no, revisá el número o consultá en recepción.',
  }
}

export interface SignupState {
  error?: string
  fieldErrors?: Partial<Record<'promo' | 'plan' | 'firstName' | 'lastName' | 'document' | 'phone' | 'email' | 'birthDate' | 'terms', string>>
}

const DB_ERRORS: Record<string, { field?: keyof NonNullable<SignupState['fieldErrors']>; text: string }> = {
  PLAN_NOT_FOUND: { field: 'plan', text: 'Elegí un plan.' },
  FIRST_NAME_REQUIRED: { field: 'firstName', text: 'Escribí tu nombre.' },
  LAST_NAME_REQUIRED: { field: 'lastName', text: 'Escribí tu apellido.' },
  EMAIL_INVALID: { field: 'email', text: 'Revisá tu email: lo vas a usar para entrar a la app.' },
  DOCUMENT_INVALID: { field: 'document', text: 'Escribí tu DNI, solo números.' },
  PHONE_INVALID: { field: 'phone', text: 'Escribí tu celular con código de área.' },
  BIRTH_DATE_INVALID: { field: 'birthDate', text: 'Revisá la fecha de nacimiento.' },
  ALREADY_MEMBER: {
    text: 'Ya sos socio y tenés un plan vigente. Entrá a la app con tu email y contraseña y renovalo desde "Pagar", o consultá en recepción.',
  },
  FRIEND_NOT_NEW: {
    field: 'promo',
    text: 'La promo "Traé a un amigo/a" es para personas nuevas en el gimnasio, y ese DNI o email ya está registrado. Podés inscribirte sin la promo.',
  },
  PROMO_REQUIRED: { field: 'promo', text: 'Elegí qué beneficio querés con el código de tu amigo/a.' },
  PROMO_NOT_AVAILABLE: { field: 'promo', text: 'Ese beneficio ya no está disponible. Elegí otro.' },
  REFERRAL_CODE_NOT_FOUND: { field: 'promo', text: 'Ese código no es válido o el socio no tiene el plan al día.' },
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
    birthDate: str('birthDate'),
    refCode: str('refCode').toUpperCase().replace(/[^A-Z0-9]/g, ''),
    promo: str('promo'),
  }

  // Cuenta primero, pago después: la inscripción queda a nombre de la cuenta con la que entró
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email || !user.email_confirmed_at) {
    return { error: 'Para inscribirte primero creá tu cuenta o ingresá. Recargá la página.' }
  }
  const email = user.email.toLowerCase()

  // Paso 1 hecho: los datos salen de la ficha (el formulario del paso 2 solo trae el plan)
  const profile = await getSignupProfile(slug, user.id)
  if (profile?.complete) {
    v.firstName = profile.firstName
    v.lastName = profile.lastName
    v.document = profile.document ?? ''
    v.phone = profile.phone ?? ''
    v.birthDate = profile.birthDate ?? ''
  }

  const fieldErrors: SignupState['fieldErrors'] = {}
  if (!UUID.test(v.plan)) fieldErrors.plan = 'Elegí un plan.'
  if (v.firstName.length < 2) fieldErrors.firstName = 'Escribí tu nombre.'
  if (v.lastName.length < 2) fieldErrors.lastName = 'Escribí tu apellido.'
  if (v.document.length < 6 || v.document.length > 10) fieldErrors.document = 'Escribí tu DNI, solo números.'
  if (v.phone.replace(/\D/g, '').length < 8) fieldErrors.phone = 'Escribí tu celular con código de área.'
  if (v.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(v.birthDate)) fieldErrors.birthDate = 'Revisá la fecha de nacimiento.'
  if (!profile?.complete && form.get('terms') !== 'on') fieldErrors.terms = 'Tenés que aceptar para seguir.'
  if (Object.keys(fieldErrors).length) return { fieldErrors }

  if (!mpConfigured() || !process.env.SUPABASE_SECRET_KEY) {
    return { error: 'Por ahora la inscripción online no está disponible. Escribinos por WhatsApp o acercate a recepción.' }
  }

  const { data, error } = await supabase.rpc('payment_intent_create_signup', {
    p_slug: slug,
    p_plan: v.plan,
    p_first_name: v.firstName,
    p_last_name: v.lastName,
    p_email: email,
    p_phone: v.phone,
    p_document: v.document,
    p_birth_date: v.birthDate || undefined,
    p_ref_code: v.refCode || undefined,
    p_promo: v.refCode ? v.promo || undefined : undefined,
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
      payer: { email, name: v.firstName, surname: v.lastName },
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
