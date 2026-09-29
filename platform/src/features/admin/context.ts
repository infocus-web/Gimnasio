import 'server-only'
import { cache } from 'react'
import { getStaffContext } from '@/lib/member-context'
import { createClient } from '@/lib/supabase/server'

export type Permission =
  | 'org.manage' | 'staff.manage' | 'members.read' | 'members.write' | 'billing.read' | 'billing.write'
  | 'schedule.manage' | 'bookings.manage' | 'checkins.manage' | 'training.manage_all'
  | 'automations.manage' | 'reports.read'

/** Staff logueado + sus permisos en el gimnasio. null = no es staff activo. */
export const getAdminContext = cache(async (slug: string) => {
  const ctx = await getStaffContext(slug)
  if (!ctx) return null
  const supabase = await createClient()
  const { data } = await supabase.rpc('my_permissions', { p_org: ctx.org.id })
  const permissions = new Set((data ?? []) as Permission[])
  return { ...ctx, permissions, can: (p: Permission) => permissions.has(p) }
})

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Dueño',
  admin: 'Administrador',
  staff: 'Recepción',
  trainer: 'Profesor',
}
