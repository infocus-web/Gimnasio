'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { siteUrl } from '@/lib/site-url'
import { getAdminContext } from './context'

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
  if (invite && m.email) {
    const r = await linkOrInvite(ctx.org.id, slug, m.email, `/${slug}/app/pase`)
    notice = r.message ?? ''
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

export async function cancelInvitation(slug: string, invitationId: string): Promise<void> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('staff.manage')) return
  const supabase = await createClient()
  await supabase.from('staff_invitations').delete().eq('id', invitationId).eq('org_id', ctx.org.id)
  revalidatePath(`/${slug}/admin/equipo`)
}

export async function resendInvitation(slug: string, email: string, _prev: ActionState): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('staff.manage')) return { message: ERRORS.FORBIDDEN }
  const r = await linkOrInvite(ctx.org.id, slug, email, `/${slug}/admin`)
  revalidatePath(`/${slug}/admin/equipo`)
  return r
}
