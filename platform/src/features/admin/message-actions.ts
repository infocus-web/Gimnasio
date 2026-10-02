'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAdminContext } from './context'

const schema = z.object({
  memberId: z.uuid(),
  phone: z.string().regex(/^[0-9]{8,15}$/),
  body: z.string().trim().min(1).max(2000),
  templateKey: z.string().max(40).nullable(),
})

/**
 * Registra que el profe abrió WhatsApp con un mensaje para un alumno.
 * Queda el historial (quién, a quién, qué y cuándo) y deja lista la tabla para el envío por API.
 * La base valida que el alumno sea suyo (o que tenga permiso sobre todos los socios).
 */
export async function logWhatsappMessage(slug: string, input: z.infer<typeof schema>): Promise<{ ok: boolean }> {
  const ctx = await getAdminContext(slug)
  if (!ctx) return { ok: false }
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false }
  const supabase = await createClient()
  const { error } = await supabase.from('message_outbox').insert({
    org_id: ctx.org.id,
    sender_staff_id: ctx.staff.id,
    member_id: parsed.data.memberId,
    phone: parsed.data.phone,
    body: parsed.data.body,
    template_key: parsed.data.templateKey,
    status: 'manual',
  })
  if (error) console.error('[whatsapp] log', error.message)
  return { ok: !error }
}
