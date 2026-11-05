'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAdminContext } from './context'
import { dbMessage, ERRORS, formObject, type ActionState } from './errors'
import type { MessageTemplate } from './whatsapp'

const schema = z.object({
  label: z.string().trim().min(1, 'Poné un nombre corto (ej. «Recordatorio»)').max(40, 'Máximo 40 letras'),
  body: z.string().trim().min(1, 'Escribí el mensaje').max(1500, 'Máximo 1500 caracteres'),
})

function refresh(slug: string) {
  revalidatePath(`/${slug}/admin/mis-clases`, 'layout')
  revalidatePath(`/${slug}/admin/alumnos`)
  revalidatePath(`/${slug}/admin/agenda`, 'layout')
}

/**
 * Crear o editar un mensaje predefinido (formulario de «Mensajes»).
 * «Del gimnasio» (lo ve todo el equipo) solo si puede administrar socios; si no, queda como propio.
 */
export async function saveTemplate(slug: string, templateId: string | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const raw = formObject(form)
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const fe: Record<string, string> = {}
    for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.message
    return { fieldErrors: fe }
  }
  const supabase = await createClient()
  if (templateId) {
    const { data, error } = await supabase
      .from('message_templates')
      .update({ label: parsed.data.label, body: parsed.data.body })
      .eq('id', templateId)
      .eq('org_id', ctx.org.id)
      .select('id')
    if (error) return { message: dbMessage(error) }
    if (!data?.length) return { message: 'Ese mensaje es del gimnasio: solo administración lo puede cambiar.' }
    refresh(slug)
    return { ok: true, message: 'Mensaje guardado.' }
  }
  const shared = raw.shared === 'on' && ctx.can('members.write')
  const { error } = await supabase.from('message_templates').insert({
    org_id: ctx.org.id,
    staff_id: shared ? null : ctx.staff.id,
    label: parsed.data.label,
    body: parsed.data.body,
    sort: shared ? 100 : 0,
  })
  if (error) return { message: dbMessage(error) }
  refresh(slug)
  return { ok: true, message: shared ? 'Mensaje agregado para todo el equipo.' : 'Mensaje agregado a tus mensajes.' }
}

export async function deleteTemplate(slug: string, templateId: string, _prev?: ActionState): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { data, error } = await supabase.from('message_templates').delete().eq('id', templateId).eq('org_id', ctx.org.id).select('id')
  if (error) return { message: dbMessage(error) }
  if (!data?.length) return { message: 'No se pudo borrar: ese mensaje es del gimnasio.' }
  refresh(slug)
  return { ok: true, message: 'Mensaje borrado.' }
}

/** Guardado rápido desde el armador de WhatsApp («Guardar como predefinido»): siempre queda como propio. */
export async function quickSaveTemplate(
  slug: string,
  input: { label: string; body: string },
): Promise<{ ok: true; template: MessageTemplate } | { ok: false; message: string }> {
  const ctx = await getAdminContext(slug)
  if (!ctx) return { ok: false, message: ERRORS.FORBIDDEN ?? 'No tenés permiso.' }
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Revisá el mensaje.' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('message_templates')
    .insert({ org_id: ctx.org.id, staff_id: ctx.staff.id, label: parsed.data.label, body: parsed.data.body, sort: 0 })
    .select('id, label, body')
    .single()
  if (error || !data) return { ok: false, message: (error ? dbMessage(error) : null) ?? 'No se pudo guardar.' }
  refresh(slug)
  return { ok: true, template: { key: data.id, id: data.id, label: data.label, body: data.body, mine: true } }
}
