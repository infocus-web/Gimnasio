'use server'

import { randomInt } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminContext } from './context'
import { dbMessage, ERRORS, formObject, type ActionState } from './errors'

const NO_KEY =
  'Falta configurar SUPABASE_SECRET_KEY en Vercel. Sin esa clave el sistema no puede crear cuentas, cambiar contraseñas ni bloquear accesos.'

/** Contraseña legible y fuerte: 3 bloques de 4 sin caracteres confusos (ej. "Kx7m-Qp4r-Zt9w") */
function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const block = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('')
  return `${block()}-${block()}-${block()}`
}

/** Quién puede tocar a quién: nadie toca al dueño ni a sí mismo; a los admins solo el dueño */
async function loadTarget(slug: string, staffId: string) {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('staff.manage')) return { error: ERRORS.FORBIDDEN } as const
  const supabase = await createClient()
  const { data: target } = await supabase
    .from('staff')
    .select('id, user_id, role, display_name, active')
    .eq('id', staffId)
    .eq('org_id', ctx.org.id)
    .maybeSingle()
  if (!target) return { error: 'No encontramos a esa persona.' } as const
  if (target.role === 'owner') return { error: 'La cuenta del dueño no se puede modificar desde acá.' } as const
  if (target.id === ctx.staff.id) return { error: ERRORS.CANNOT_MODIFY_OWN_ROLE } as const
  if (target.role === 'admin' && ctx.staff.role !== 'owner') return { error: ERRORS.ONLY_OWNER_CAN_MANAGE_ADMINS } as const
  return { ctx, target, supabase } as const
}

// ---------------------------------------------------------------------
// Crear cuenta con contraseña
// ---------------------------------------------------------------------
const createSchema = z.object({
  displayName: z.string().trim().min(1, 'Ingresá el nombre'),
  email: z.string().trim().toLowerCase().pipe(z.email('Email inválido')),
  role: z.enum(['admin', 'staff', 'trainer']),
  password: z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v === '' || v.length >= 10, 'Mínimo 10 caracteres (o dejalo vacío y la generamos)'),
})

export async function createStaffAccount(slug: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('staff.manage')) return { message: ERRORS.FORBIDDEN }
  const parsed = createSchema.safeParse(formObject(form))
  if (!parsed.success) {
    const fe: Record<string, string> = {}
    for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.message
    return { fieldErrors: fe }
  }
  const { displayName, email, role } = parsed.data
  if (role === 'admin' && ctx.staff.role !== 'owner') return { message: ERRORS.ONLY_OWNER_CAN_MANAGE_ADMINS }
  if (!process.env.SUPABASE_SECRET_KEY) return { message: NO_KEY }
  const password = parsed.data.password || generatePassword()

  const supabase = await createClient()
  // 1) La invitación define rol y nombre; el trigger de la base la convierte en staff al crearse la cuenta
  const inv = await supabase
    .from('staff_invitations')
    .upsert({ org_id: ctx.org.id, email, role, display_name: displayName, accepted_at: null }, { onConflict: 'org_id,email' })
  if (inv.error) return { message: dbMessage(inv.error) }

  // 2) Cuenta con contraseña, email ya confirmado y cambio de clave obligatorio al primer ingreso
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: displayName, must_change_password: true },
  })

  if (error) {
    if (/already|registered|exists/i.test(error.message)) {
      // Ya tenía cuenta (por ejemplo, es socio): se habilita sin tocar su contraseña
      const { data } = await supabase.rpc('link_existing_user', { p_org: ctx.org.id, p_email: email })
      revalidatePath(`/${slug}/admin/equipo`)
      return data === 'LINKED'
        ? { ok: true, message: `${email} ya tenía cuenta: quedó habilitado como ${role === 'trainer' ? 'profesor' : role === 'staff' ? 'recepción' : 'administrador'} con su contraseña actual. Si no la recuerda, usá "Nueva contraseña".` }
        : { message: 'Ese email ya tiene cuenta pero no se pudo vincular.' }
    }
    if (/password/i.test(error.message)) return { fieldErrors: { password: 'Contraseña demasiado débil o filtrada en internet. Probá otra.' } }
    console.error('[staff] createUser', error)
    return { message: 'No se pudo crear la cuenta. Probá de nuevo.' }
  }

  revalidatePath(`/${slug}/admin/equipo`)
  return {
    ok: true,
    message: `Cuenta creada para ${displayName}. Pasale el email y esta contraseña: al entrar por primera vez le vamos a pedir que la cambie.`,
    secret: password,
  }
}

// ---------------------------------------------------------------------
// Nueva contraseña (el admin la resetea)
// ---------------------------------------------------------------------
export async function resetStaffPassword(slug: string, staffId: string, _prev: ActionState): Promise<ActionState> {
  const t = await loadTarget(slug, staffId)
  if ('error' in t) return { message: t.error }
  if (!process.env.SUPABASE_SECRET_KEY) return { message: NO_KEY }
  const password = generatePassword()
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(t.target.user_id, {
    password,
    user_metadata: { must_change_password: true },
  })
  if (error) {
    console.error('[staff] reset password', error)
    return { message: 'No se pudo cambiar la contraseña.' }
  }
  return { ok: true, message: `Nueva contraseña para ${t.target.display_name} (la tiene que cambiar al entrar):`, secret: password }
}

// ---------------------------------------------------------------------
// Bloquear / desbloquear
// ---------------------------------------------------------------------
export async function setStaffBlocked(slug: string, staffId: string, blocked: boolean, _prev: ActionState): Promise<ActionState> {
  const t = await loadTarget(slug, staffId)
  if ('error' in t) return { message: t.error }
  const { ctx, target, supabase } = t

  const { error } = await supabase.from('staff').update({ active: !blocked }).eq('id', staffId).eq('org_id', ctx.org.id)
  if (error) return { message: dbMessage(error) }

  // Si además NO es socio, se bloquea la cuenta entera (no puede ni loguearse).
  // Si es socio, conserva su app de socio y pierde solo el panel.
  let extra = ''
  const { count } = await supabase.from('members').select('id', { count: 'exact', head: true }).eq('user_id', target.user_id)
  if (process.env.SUPABASE_SECRET_KEY && !count) {
    const admin = createAdminClient()
    const r = await admin.auth.admin.updateUserById(target.user_id, { ban_duration: blocked ? '876000h' : 'none' })
    if (r.error) console.error('[staff] ban', r.error)
    else extra = blocked ? ' La cuenta quedó bloqueada: no puede iniciar sesión.' : ' La cuenta vuelve a poder iniciar sesión.'
  } else if (count) {
    extra = blocked ? ' Como también es socio, conserva su app de socio.' : ''
  }

  revalidatePath(`/${slug}/admin/equipo`)
  return { ok: true, message: `${target.display_name} ${blocked ? 'fue bloqueado' : 'fue desbloqueado'}.${extra}` }
}

// ---------------------------------------------------------------------
// Eliminar del equipo
// ---------------------------------------------------------------------
export async function deleteStaff(slug: string, staffId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const t = await loadTarget(slug, staffId)
  if ('error' in t) return { message: t.error }
  const { ctx, target, supabase } = t
  if (String(form.get('confirm') ?? '').trim().toUpperCase() !== 'ELIMINAR') {
    return { fieldErrors: { confirm: 'Escribí ELIMINAR para confirmar' } }
  }

  const { error } = await supabase.from('staff').delete().eq('id', staffId).eq('org_id', ctx.org.id)
  if (error) {
    if (error.code === '23503') {
      return {
        message: `${target.display_name} tiene clases, rutinas o alumnos a su nombre. Reasignalos (Agenda → Grilla, Rutinas) o usá "Bloquear", que corta el acceso y conserva el historial.`,
      }
    }
    return { message: dbMessage(error) }
  }

  // Si no es socio ni staff de otro gimnasio, se borra también la cuenta de acceso
  let extra = ''
  const [{ count: asMember }, { count: asStaff }] = await Promise.all([
    supabase.from('members').select('id', { count: 'exact', head: true }).eq('user_id', target.user_id),
    supabase.from('staff').select('id', { count: 'exact', head: true }).eq('user_id', target.user_id),
  ])
  if (process.env.SUPABASE_SECRET_KEY && !asMember && !asStaff) {
    const admin = createAdminClient()
    const r = await admin.auth.admin.deleteUser(target.user_id)
    if (!r.error) extra = ' También se borró su cuenta de acceso.'
  } else if (asMember) {
    extra = ' Conserva su cuenta porque también es socio.'
  }

  revalidatePath(`/${slug}/admin/equipo`)
  return { ok: true, message: `${target.display_name} fue eliminado del equipo.${extra}` }
}
