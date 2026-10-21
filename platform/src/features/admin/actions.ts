'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { siteUrl } from '@/lib/site-url'
import { getAdminContext } from './context'
import { MEMBER_BUCKET, isStoragePath, removeMemberFiles, saveMemberPhoto } from './member-files'

import { dbMessage, ERRORS, formObject, type ActionState } from './errors'

export type { ActionState }

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional()

const memberSchema = z.object({
  firstName: z.string().trim().min(1, 'Ingresá el nombre'),
  lastName: z.string().trim().default(''),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => (v === '' ? null : v))
    .pipe(z.email('Email inválido').nullable()),
  phone: optionalText,
  documentId: optionalText,
  birthDate: optionalText,
  medicalNotes: optionalText,
})

function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form')
    out[key] ??= issue.message
  }
  return out
}


async function origin() {
  return siteUrl()
}

/** Vincula la cuenta si ya existe; si no, manda la invitación por email (requiere SUPABASE_SECRET_KEY). */
async function linkOrInvite(orgId: string, slug: string, email: string, next: string): Promise<ActionState> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('link_existing_user', { p_org: orgId, p_email: email })
  if (error) return { message: dbMessage(error) }
  if (data === 'LINKED') return { ok: true, message: `${email} ya tenía cuenta: quedó vinculada.` }

  if (!process.env.SUPABASE_SECRET_KEY) {
    return {
      message:
        'Falta configurar SUPABASE_SECRET_KEY en Vercel para enviar invitaciones. La ficha quedó guardada con el email: cuando esté configurada, tocá "Invitar a la app".',
    }
  }
  const admin = createAdminClient()
  const redirectTo = `${await origin()}/auth/callback?next=${encodeURIComponent(next)}`
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })
  if (inviteError) {
    console.error('[admin] invite error', inviteError)
    if (/already|registered/i.test(inviteError.message)) {
      return { message: 'Ese email ya tiene cuenta pero no se pudo vincular. Revisá que coincida exactamente.' }
    }
    if (/rate|limit/i.test(inviteError.message)) {
      return { message: 'Se alcanzó el límite de emails por hora de Supabase. Probá más tarde o configurá un correo propio (SMTP).' }
    }
    return { message: 'No se pudo enviar la invitación. Probá de nuevo en unos minutos.' }
  }
  void slug
  return { ok: true, message: `Invitación enviada a ${email}.` }
}

// ---------------------------------------------------------------------
// Socios
// ---------------------------------------------------------------------

export async function createMember(slug: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('members.write')) return { message: ERRORS.FORBIDDEN }

  const raw = formObject(form)
  const parsed = memberSchema.safeParse(raw)
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) }
  const m = parsed.data
  const payerId = raw.payerId || null
  const planId = payerId ? null : raw.planId || null
  const invite = raw.invite === 'on'
  if (invite && !m.email) return { fieldErrors: { email: 'Para invitarlo a la app necesitamos su email' } }

  const supabase = await createClient()
  const { data: memberId, error } = await supabase.rpc('admin_create_member', {
    p_org: ctx.org.id,
    p_first_name: m.firstName,
    p_last_name: m.lastName,
    p_email: m.email ?? undefined,
    p_phone: m.phone ?? undefined,
    p_document_id: m.documentId ?? undefined,
    p_birth_date: m.birthDate ?? undefined,
    p_payer_id: payerId ?? undefined,
    p_plan_id: planId ?? undefined,
    p_start: raw.startDate || undefined,
  })
  if (error || !memberId) return { message: error ? dbMessage(error) : 'No se pudo crear la ficha.' }

  if (m.medicalNotes) {
    await supabase.from('members').update({ medical_notes: m.medicalNotes }).eq('id', memberId)
  }
  let notice = ''
  const photo = String(form.get('photo') ?? '')
  if (photo) {
    const photoError = await saveMemberPhoto(supabase, ctx.org.id, memberId, photo)
    if (photoError) notice = `${photoError} Podés sacarla de nuevo desde la ficha.`
  }
  if (invite && m.email) {
    const r = await linkOrInvite(ctx.org.id, slug, m.email, `/${slug}/app/pase`)
    notice = [notice, r.message ?? ''].filter(Boolean).join(' ')
  }
  revalidatePath(`/${slug}/admin`, 'layout')
  const qs = notice ? `?aviso=${encodeURIComponent(notice)}` : ''
  redirect(`/${slug}/admin/socios/${memberId}${qs}` as Route)
}

export async function updateMember(slug: string, memberId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('members.write')) return { message: ERRORS.FORBIDDEN }
  const parsed = memberSchema.safeParse(formObject(form))
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) }
  const m = parsed.data
  const status = String(form.get('status') ?? 'active')

  const supabase = await createClient()
  const { error } = await supabase
    .from('members')
    .update({
      first_name: m.firstName,
      last_name: m.lastName,
      email: m.email,
      phone: m.phone ?? null,
      document_id: m.documentId ?? null,
      birth_date: m.birthDate ?? null,
      medical_notes: m.medicalNotes ?? null,
      status: (['lead', 'active', 'frozen', 'archived'].includes(status) ? status : 'active') as
        'lead' | 'active' | 'frozen' | 'archived',
    })
    .eq('id', memberId)
    .eq('org_id', ctx.org.id)
  if (error) return { message: dbMessage(error) }
  revalidatePath(`/${slug}/admin`, 'layout')
  return { ok: true, message: 'Datos guardados.' }
}

export async function assignPlan(slug: string, memberId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('billing.write')) return { message: ERRORS.FORBIDDEN }
  const planId = String(form.get('planId') ?? '')
  if (!planId) return { fieldErrors: { planId: 'Elegí un plan' } }
  const start = String(form.get('startDate') ?? '') || undefined

  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_assign_plan', { p_member: memberId, p_plan: planId, p_start: start })
  if (error) return { message: dbMessage(error) }
  revalidatePath(`/${slug}/admin`, 'layout')
  return { ok: true, message: 'Plan asignado.' }
}

export async function inviteMemberToApp(slug: string, memberId: string, _prev: ActionState): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('members.write')) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { data: member } = await supabase
    .from('members')
    .select('email, user_id')
    .eq('id', memberId)
    .eq('org_id', ctx.org.id)
    .maybeSingle()
  if (!member) return { message: ERRORS.MEMBER_NOT_FOUND }
  if (member.user_id) return { ok: true, message: 'Ya tiene acceso a la app.' }
  if (!member.email) return { message: 'Cargale un email en la ficha primero.' }
  const r = await linkOrInvite(ctx.org.id, slug, member.email, `/${slug}/app/pase`)
  revalidatePath(`/${slug}/admin/socios/${memberId}`)
  return r
}

// ---------------------------------------------------------------------
// Equipo
// ---------------------------------------------------------------------

const inviteSchema = z.object({
  displayName: z.string().trim().min(1, 'Ingresá el nombre'),
  email: z.string().trim().toLowerCase().pipe(z.email('Email inválido')),
  role: z.enum(['admin', 'staff', 'trainer']),
})

export async function inviteStaff(slug: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('staff.manage')) return { message: ERRORS.FORBIDDEN }
  const parsed = inviteSchema.safeParse(formObject(form))
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) }
  const { displayName, email, role } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase
    .from('staff_invitations')
    .upsert(
      { org_id: ctx.org.id, email, role, display_name: displayName, accepted_at: null },
      { onConflict: 'org_id,email' },
    )
  if (error) return { message: dbMessage(error) }

  const r = await linkOrInvite(ctx.org.id, slug, email, `/${slug}/admin`)
  revalidatePath(`/${slug}/admin/equipo`)
  return r.ok ? r : { ok: true, message: `Invitación guardada. ${r.message ?? ''}` }
}

export async function updateStaff(slug: string, staffId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('staff.manage')) return { message: ERRORS.FORBIDDEN }
  const role = String(form.get('role') ?? '')
  if (!['admin', 'staff', 'trainer'].includes(role)) return { message: 'Rol inválido.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('staff')
    .update({ role: role as 'admin' | 'staff' | 'trainer' })
    .eq('id', staffId)
    .eq('org_id', ctx.org.id)
  if (error) return { message: dbMessage(error) }
  revalidatePath(`/${slug}/admin/equipo`)
  return { ok: true, message: 'Rol actualizado.' }
}

export async function cancelInvitation(slug: string, invitationId: string, _prev?: ActionState): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('staff.manage')) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { error } = await supabase.from('staff_invitations').delete().eq('id', invitationId).eq('org_id', ctx.org.id)
  if (error) return { message: dbMessage(error) ?? 'No se pudo cancelar la invitación.' }
  revalidatePath(`/${slug}/admin/equipo`)
  return { ok: true, message: 'Invitación cancelada.' }
}

export async function resendInvitation(slug: string, email: string, _prev: ActionState): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('staff.manage')) return { message: ERRORS.FORBIDDEN }
  const r = await linkOrInvite(ctx.org.id, slug, email, `/${slug}/admin`)
  revalidatePath(`/${slug}/admin/equipo`)
  return r
}

const DELETE_MESSAGES: Record<string, string> = {
  MEMBER_IS_PAYER: 'Es el titular de un grupo familiar: primero eliminá o pasá a otra cuenta a los integrantes.',
  MEMBER_NOT_FOUND: 'Ese socio ya no existe.',
  FORBIDDEN: ERRORS.FORBIDDEN ?? 'No tenés permiso.',
}

/** Elimina al socio y todo lo suyo (pagos, plan, entradas, rutinas). Solo dueño/admin. */
export async function deleteMember(slug: string, memberId: string, _prev: ActionState): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('org.manage')) return { message: 'Solo el dueño o un administrador puede eliminar socios.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('member_delete', { p_member: memberId })
  if (error) return { message: DELETE_MESSAGES[error.message.trim()] ?? dbMessage(error) ?? 'No se pudo eliminar.' }
  // Foto y apto físico: recién cuando el socio ya se borró (si fallaba antes, quedaba sin archivos).
  // Se borran con la clave del servidor: el socio ya no existe y las políticas del bucket lo exigen.
  await removeMemberFiles(createAdminClient(), ctx.org.id, memberId)
  // Su usuario de la app, si ya no lo usa nadie más
  const orphan = (data as { orphan_user_id?: string | null } | null)?.orphan_user_id
  if (orphan) {
    const { error: authError } = await createAdminClient().auth.admin.deleteUser(orphan)
    if (authError) console.error('[deleteMember] auth', authError.message)
  }
  revalidatePath(`/${slug}/admin/socios`, 'layout')
  revalidatePath(`/${slug}/admin/accesos`)
  redirect(`/${slug}/admin/socios` as Route)
}

/** Socio que ya tiene cuenta: le manda por email un link para entrar (sin contraseña). */
export async function sendAccessLink(slug: string, memberId: string, _prev: ActionState): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('members.write')) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { data: member } = await supabase
    .from('members')
    .select('email, user_id')
    .eq('id', memberId)
    .eq('org_id', ctx.org.id)
    .maybeSingle()
  if (!member) return { message: ERRORS.MEMBER_NOT_FOUND }
  if (!member.email) return { message: 'Cargale un email en la ficha primero.' }
  // Cliente sin sesión: enviar el link no toca la sesión del que está en el panel
  const anon = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const next = `/${slug}/app/pase`
  const { error } = await anon.auth.signInWithOtp({
    email: member.email,
    options: { shouldCreateUser: false, emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}` },
  })
  if (error) {
    console.error('[sendAccessLink]', error.status, error.code, error.message)
    if (error.status === 429 || /rate/i.test(error.code ?? '')) {
      return { message: 'Ya se mandó un link hace un momento. Esperá un minuto, o pedile que revise Spam.' }
    }
    return { message: 'No se pudo enviar el link. Probá de nuevo en unos minutos.' }
  }
  return { ok: true, message: `Le mandamos a ${member.email} un link para entrar a la app (revisá también Spam).` }
}

/** Foto del socio (webcam o archivo) desde la ficha. */
export async function updateMemberPhoto(slug: string, memberId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('members.write')) return { message: ERRORS.FORBIDDEN }
  const photo = String(form.get('photo') ?? '')
  if (!photo) return { message: 'Primero sacá la foto (o subí una).' }
  const supabase = await createClient()
  const err = await saveMemberPhoto(supabase, ctx.org.id, memberId, photo)
  if (err) return { message: err }
  revalidatePath(`/${slug}/admin/socios/${memberId}`)
  return { ok: true, message: 'Foto guardada.' }
}

/** Apto físico: el navegador ya subió el archivo al bucket privado; acá se registra en la ficha. */
export async function saveMedicalCert(
  slug: string,
  memberId: string,
  path: string,
  expiresOn: string | null,
): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('members.write')) return { message: ERRORS.FORBIDDEN }
  const prefix = `${ctx.org.id}/${memberId}/apto-`
  if (!path.startsWith(prefix) || path.includes('..')) return { message: 'Archivo inválido.' }
  const expires = expiresOn && /^\d{4}-\d{2}-\d{2}$/.test(expiresOn) ? expiresOn : null
  const supabase = await createClient()
  const { data: prev } = await supabase.from('members').select('medical_cert_path').eq('id', memberId).maybeSingle()
  const { error } = await supabase
    .from('members')
    .update({ medical_cert_path: path, medical_cert_uploaded_at: new Date().toISOString(), medical_cert_expires_on: expires })
    .eq('id', memberId)
    .eq('org_id', ctx.org.id)
  if (error) return { message: dbMessage(error) ?? 'No se pudo guardar el apto.' }
  if (isStoragePath(prev?.medical_cert_path) && prev.medical_cert_path !== path) {
    await supabase.storage.from(MEMBER_BUCKET).remove([prev.medical_cert_path])
  }
  revalidatePath(`/${slug}/admin/socios/${memberId}`)
  return { ok: true, message: 'Apto físico guardado.' }
}

export async function removeMedicalCert(slug: string, memberId: string, _prev: ActionState): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('members.write')) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { data: prev } = await supabase.from('members').select('medical_cert_path').eq('id', memberId).maybeSingle()
  const { error } = await supabase
    .from('members')
    .update({ medical_cert_path: null, medical_cert_uploaded_at: null, medical_cert_expires_on: null })
    .eq('id', memberId)
    .eq('org_id', ctx.org.id)
  if (error) return { message: dbMessage(error) ?? 'No se pudo quitar.' }
  if (isStoragePath(prev?.medical_cert_path)) await supabase.storage.from(MEMBER_BUCKET).remove([prev.medical_cert_path])
  revalidatePath(`/${slug}/admin/socios/${memberId}`)
  return { ok: true, message: 'Apto físico quitado.' }
}

/** Corrige el vencimiento del plan vigente (error de carga, días de congelamiento, cortesía). */
export async function adjustMembershipEnd(slug: string, memberId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('billing.write')) return { message: ERRORS.FORBIDDEN }
  const date = String(form.get('endDate') ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { fieldErrors: { endDate: 'Elegí la nueva fecha de vencimiento' } }
  const supabase = await createClient()
  const { data: m } = await supabase
    .from('member_directory')
    .select('membership_id, membership_status')
    .eq('id', memberId)
    .eq('org_id', ctx.org.id)
    .maybeSingle()
  if (!m?.membership_id) return { message: 'No tiene un plan para ajustar: asignale uno primero.' }
  // Vence al final de ese día en el horario del gimnasio
  const offset =
    new Intl.DateTimeFormat('en-US', { timeZone: ctx.org.timezone, timeZoneName: 'longOffset' })
      .formatToParts(new Date(`${date}T12:00:00Z`))
      .find((p) => p.type === 'timeZoneName')
      ?.value.replace('GMT', '') || '+00:00'
  const end = new Date(`${date}T23:59:59${offset}`)
  if (Number.isNaN(end.getTime())) return { fieldErrors: { endDate: 'Fecha inválida' } }
  const reactivate = end.getTime() > Date.now() && m.membership_status === 'expired'
  const { error } = await supabase
    .from('memberships')
    .update({ current_period_end: end.toISOString(), ...(reactivate ? { status: 'active' as const } : {}) })
    .eq('id', m.membership_id)
    .eq('org_id', ctx.org.id)
  if (error) return { message: dbMessage(error) ?? 'No se pudo cambiar el vencimiento.' }
  revalidatePath(`/${slug}/admin`, 'layout')
  return { ok: true, message: `Nuevo vencimiento: ${date.split('-').reverse().join('/')}.` }
}
