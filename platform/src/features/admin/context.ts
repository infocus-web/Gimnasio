import 'server-only'
import { cache } from 'react'
import { getStaffContext } from '@/lib/member-context'
import { createClient } from '@/lib/supabase/server'

export type Permission =
  | 'org.manage' | 'staff.manage' | 'members.read' | 'members.write' | 'billing.read' | 'billing.write'
  | 'schedule.manage' | 'bookings.manage' | 'checkins.manage' | 'training.manage_all'
  | 'automations.manage' | 'reports.read'
  | 'schedule.own'   // 0040: el profe maneja SUS clases
  | 'sales.write'    // 0047: vender en el mostrador (sin ver caja ni pagos)
  | 'buffet.manage'  // 0052: carta, menú del día y pedidos del buffet

/** Staff logueado + sus permisos en el gimnasio. null = no es staff activo. */
export const getAdminContext = cache(async (slug: string) => {
  const ctx = await getStaffContext(slug)
  if (!ctx) return null
  const supabase = await createClient()
  // Con contraseña temporal no se opera nada hasta cambiarla (no solo una redirección de pantalla)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user?.user_metadata?.must_change_password === true) return null
  const { data } = await supabase.rpc('my_permissions', { p_org: ctx.org.id })
  const permissions = new Set((data ?? []) as Permission[])
  return { ...ctx, permissions, can: (p: Permission) => permissions.has(p) }
})

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Dueño',
  admin: 'Administrador',
  staff: 'Recepción',
  trainer: 'Profesor',
  buffet: 'Buffet',
}
