'use server'

import { randomInt } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { siteUrl } from '@/lib/site-url'
import { getAdminContext } from './context'
import { dbMessage, ERRORS, formObject, type ActionState } from './errors'

const PUBLIC_ERRORS: Record<string, [field: string | null, msg: string]> = {
  NAME_REQUIRED: ['firstName', 'Completá nombre y apellido.'],
  INVALID_DOCUMENT: ['documentId', 'El DNI tiene que tener entre 7 y 9 números.'],
  INVALID_EMAIL: ['email', 'Revisá el email.'],
  INVALID_PHONE: ['phone', 'Revisá el teléfono (con código de área).'],
  INVALID_ROLE: ['role', 'Elegí tu puesto.'],
  RATE_LIMITED: [null, 'Hay muchas solicitudes en este momento. Probá de nuevo en un rato.'],
  ORG_NOT_FOUND: [null, 'El gimnasio no existe.'],
  ALREADY_STAFF: ['email', 'Ese email ya es del equipo: entrá por "Acceso equipo" (al pie de la web) con tu contraseña.'],
  ALREADY_PENDING: [null, 'Ya hay una solicitud tuya esperando aprobación. No hace falta mandarla de nuevo.'],
}

/** Formulario público del padrón. No crea cuentas: solo deja la solicitud para que la apruebe el dueño. */
export async function submitStaffRequest(slug: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const raw = formObject(form)
  // Anti-bots: campo trampa invisible (solo lo completa un robot) y tiempo mínimo de llenado,
  // medido en el celular de la persona (antes se comparaban relojes y descartaba envíos reales).
  if (raw.hp_field || raw.website) {
    console.warn('[padron] descartado por campo trampa', slug)
    return { ok: true, message: '¡Listo! Tu solicitud quedó registrada.' }
  }
  const elapsed = Number(raw.elapsed_ms ?? 0)
  if (Number.isFinite(elapsed) && elapsed > 0 && elapsed < 2000) {
    return { message: 'Revisá tus datos y tocá "Enviar" de nuevo.' }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('submit_staff_request', {
    p_slug: slug,
    p_first_name: raw.firstName ?? '',
    p_last_name: raw.lastName ?? '',
    p_document_id: raw.documentId ?? '',
    p_phone: raw.phone ?? '',
    p_email: raw.email ?? '',
    p_role: raw.role ?? '',
    p_message: raw.message || undefined,
  })
  if (error) {
    const known = PUBLIC_ERRORS[error.message.trim()]
    if (known) return known[0] ? { fieldErrors: { [known[0]]: known[1] } } : { message: known[1] }
    console.error('[padron] submit', error)
    return { message: 'No se pudo enviar. Probá de nuevo.' }
  }
  return {
    ok: true,
    message: '¡Listo! Tu solicitud quedó registrada. Cuando la aprueben te llega tu acceso (por email o te lo pasan por WhatsApp).',
  }
}

// ---------------------------------------------------------------------
// Aprobación desde el panel
// ---------------------------------------------------------------------
const NO_KEY =
  'Falta configurar SUPABASE_SECRET_KEY en Vercel: sin esa clave no se pueden crear las cuentas aprobadas.'

function generatePassword() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const b = () => Array.from({ length: 4 }, () => a[randomInt(a.length)]).join('')
  return `${b()}-${b()}-${b()}`
}

async function origin() {
  return siteUrl()
}

export async function approveStaffRequest(slug: string, requestId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('staff.manage')) return { message: ERRORS.FORBIDDEN }
  const role = String(form.get('role') ?? '')
  if (!['trainer', 'staff', 'admin'].includes(role)) return { message: 'Elegí el rol.' }
  if (role === 'admin' && ctx.staff.role !== 'owner') return { message: ERRORS.ONLY_OWNER_CAN_MANAGE_ADMINS }
  const method = form.get('method') === 'password' ? 'password' : 'email'
  if (!process.env.SUPABASE_SECRET_KEY) return { message: NO_KEY }

  const supabase = await createClient()
  const { data: req } = await supabase
    .from('staff_requests')
    .select('*')
    .eq('id', requestId)
    .eq('org_id', ctx.org.id)
    .eq('status', 'pending')
    .maybeSingle()
  if (!req) return { message: 'La solicitud ya no está pendiente.' }
  const displayName = `${req.first_name} ${req.last_name}`

  // 1) Invitación con rol, nombre, teléfono y DNI (el trigger la convierte en staff al crearse la cuenta)
  const inv = await supabase.from('staff_invitations').upsert(
    {
      org_id: ctx.org.id,
      email: req.email,
      role: role as 'trainer' | 'staff' | 'admin',
      display_name: displayName,
      phone: req.phone,
      document_id: req.document_id,
      accepted_at: null,
    },
    { onConflict: 'org_id,email' },
  )
  if (inv.error) return { message: dbMessage(inv.error) }

  // 2) Cuenta
  const admin = createAdminClient()
  let secret: string | undefined
  let message: string
  const res =
    method === 'email'
      ? await admin.auth.admin.inviteUserByEmail(req.email, {
          redirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(`/${slug}/admin`)}`,
          data: { full_name: displayName, must_change_password: true },
        })
      : await admin.auth.admin.createUser({
          email: req.email,
          password: (secret = generatePassword()),
          email_confirm: true,
          user_metadata: { full_name: displayName, must_change_password: true },
        })

  if (res.error) {
    if (/already|registered|exists/i.test(res.error.message)) {
      const { data } = await supabase.rpc('link_existing_user', { p_org: ctx.org.id, p_email: req.email })
      if (data !== 'LINKED') return { message: 'Ese email ya tiene cuenta pero no se pudo vincular.' }
      secret = undefined
      message = `${displayName} ya tenía cuenta (por ejemplo, como socio): quedó habilitado con su contraseña actual.`
    } else if (/rate|limit/i.test(res.error.message)) {
      return { message: 'Se alcanzó el límite de emails por hora. Probá más tarde o elegí "Generar contraseña temporal".' }
    } else {
      console.error('[padron] approve', res.error)
      return { message: 'No se pudo crear la cuenta. Probá de nuevo.' }
    }
  } else {
    message =
      method === 'email'
        ? `Aprobado. A ${req.email} le llegó un email para crear su contraseña y entrar.`
        : `Aprobado. Pasale a ${displayName} su email y esta contraseña temporal (la cambia al entrar):`
  }

  await supabase
    .from('staff_requests')
    .update({ status: 'approved', reviewed_by: (await supabase.auth.getUser()).data.user?.id ?? null, reviewed_at: new Date().toISOString() })
    .eq('id', requestId)
  revalidatePath(`/${slug}/admin`, 'layout')
  return { ok: true, message, secret }
}

export async function rejectStaffRequest(slug: string, requestId: string, _prev: ActionState): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('staff.manage')) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { error } = await supabase
    .from('staff_requests')
    .update({ status: 'rejected', reviewed_by: (await supabase.auth.getUser()).data.user?.id ?? null, reviewed_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('org_id', ctx.org.id)
  if (error) return { message: dbMessage(error) }
  revalidatePath(`/${slug}/admin`, 'layout')
  return { ok: true, message: 'Solicitud rechazada.' }
}
