import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { MESSAGE_TEMPLATES, type MessageTemplate } from './whatsapp'

/**
 * Mensajes predefinidos que ve este miembro del equipo: los del gimnasio + los suyos.
 * Si el gimnasio todavía no tiene ninguno cargado (base sin la migración 0040), usa los de siempre.
 */
export async function loadTemplates(orgId: string, myStaffId: string): Promise<MessageTemplate[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('message_templates')
    .select('id, staff_id, label, body, sort')
    .eq('org_id', orgId)
    .order('sort')
    .order('label')
  if (error || !data?.length) return MESSAGE_TEMPLATES
  // Primero los propios (los que el profe armó para él), después los del gimnasio
  return [...data]
    .sort((a, b) => Number(b.staff_id === myStaffId) - Number(a.staff_id === myStaffId))
    .map((t) => ({ key: t.id, id: t.id, label: t.label, body: t.body, mine: t.staff_id === myStaffId }))
}
