'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAdminContext } from './context'
import { dbMessage, ERRORS, type ActionState } from './errors'

const MESSAGES: Record<string, string> = {
  INVALID_SERIAL: 'El número de serie tiene que tener entre 6 y 32 letras o números (está en Menú → Info del sistema).',
  SERIAL_TAKEN: 'Ese lector ya está registrado.',
  DEVICE_NOT_FOUND: 'Ese lector ya no existe.',
  ACCESS_NOT_ALLOWED: 'No está al día (plan vencido, moroso o congelado): el lector no lo va a dejar pasar. Cobrale primero.',
  PIN_TAKEN: 'Ese número ya lo tiene otro socio.',
  MEMBER_NOT_FOUND: 'No encontramos ese socio.',
}

function msg(error: { message: string; code?: string; hint?: string | null }) {
  return MESSAGES[error.message.trim()] ?? dbMessage(error) ?? 'Ocurrió un error.'
}

function refresh(slug: string) {
  revalidatePath(`/${slug}/admin/accesos`)
  revalidatePath(`/${slug}/admin/socios`, 'layout')
}

export async function registerDevice(slug: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('org.manage')) return { message: ERRORS.FORBIDDEN }
  const serial = String(form.get('serial') ?? '').trim()
  const name = String(form.get('name') ?? '').trim()
  if (!serial) return { fieldErrors: { serial: 'Ingresá el número de serie del lector' } }
  const supabase = await createClient()
  const { error } = await supabase.rpc('access_device_register', { p_org: ctx.org.id, p_serial: serial, p_name: name || 'Lector' })
  if (error) {
    const m = msg(error)
    return error.message.trim() === 'INVALID_SERIAL' ? { fieldErrors: { serial: m } } : { message: m }
  }
  refresh(slug)
  return {
    ok: true,
    message: 'Lector registrado. En menos de un minuto empieza a recibir a los socios al día (mirá "Cargados" abajo).',
  }
}

type DeviceOp = 'resync' | 'query' | 'confirm_ip' | 'enable' | 'disable' | 'delete'

export async function deviceAction(slug: string, deviceId: string, op: DeviceOp, _prev: ActionState): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('org.manage')) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const res =
    op === 'resync'
      ? await supabase.rpc('access_device_resync', { p_device: deviceId })
      : op === 'query'
        ? await supabase.rpc('access_device_query_users', { p_device: deviceId })
        : op === 'confirm_ip'
          ? await supabase.rpc('access_device_confirm_ip', { p_device: deviceId })
          : op === 'delete'
            ? await supabase.rpc('access_device_delete', { p_device: deviceId })
            : await supabase.rpc('access_device_update', { p_device: deviceId, p_name: '', p_active: op === 'enable' })
  if (res.error) return { message: msg(res.error) }
  refresh(slug)
  const done: Record<DeviceOp, string> = {
    resync: `Listo: se vuelven a enviar ${typeof res.data === 'number' ? res.data : 'todos los'} socios al día.`,
    query: 'Le pedimos al lector su lista de usuarios. Actualizá en un minuto.',
    confirm_ip: 'Nueva conexión confirmada.',
    enable: 'Lector activado.',
    disable: 'Lector pausado: el sistema deja de enviarle cambios (el lector sigue abriendo a quien ya tiene cargado).',
    delete: 'Lector eliminado del sistema.',
  }
  return { ok: true, message: done[op] }
}

export async function linkDeviceUser(slug: string, deviceId: string, pin: number, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('org.manage')) return { message: ERRORS.FORBIDDEN }
  const dni = String(form.get('dni') ?? '').replace(/\D/g, '')
  if (dni.length < 7) return { fieldErrors: { dni: 'DNI del socio (solo números)' } }
  const supabase = await createClient()
  const { data: member } = await supabase
    .from('members')
    .select('id, first_name, last_name')
    .eq('org_id', ctx.org.id)
    .eq('document_id', dni)
    .maybeSingle()
  if (!member) return { fieldErrors: { dni: 'No hay ningún socio con ese DNI' } }
  const { error } = await supabase.rpc('access_link_pin', { p_device: deviceId, p_pin: pin, p_member: member.id })
  if (error) return { message: msg(error) }
  refresh(slug)
  return { ok: true, message: `Vinculado a ${member.first_name} ${member.last_name}: conserva su cara y ahora entra según sus pagos.` }
}

export async function forgetDeviceUser(slug: string, deviceId: string, pin: number, _prev: ActionState): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('org.manage')) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { error } = await supabase.rpc('access_forget_pin', { p_device: deviceId, p_pin: pin })
  if (error) return { message: msg(error) }
  refresh(slug)
  return { ok: true, message: 'Se borra del lector en menos de un minuto.' }
}

export async function enrollMember(slug: string, memberId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext(slug)
  if (!ctx?.can('checkins.manage')) return { message: ERRORS.FORBIDDEN }
  if (form.get('consent') !== 'on') {
    return { fieldErrors: { consent: 'Confirmá que el socio aceptó el uso de su cara/palma/huella para entrar' } }
  }
  const deviceId = String(form.get('deviceId') ?? '')
  const type = Number(form.get('bioType') ?? 9)
  if (!deviceId) return { fieldErrors: { deviceId: 'Elegí el lector' } }
  const supabase = await createClient()
  const { error } = await supabase.rpc('access_enroll', { p_member: memberId, p_device: deviceId, p_bio_type: type })
  if (error) return { message: msg(error) }
  revalidatePath(`/${slug}/admin/socios/${memberId}`)
  return {
    ok: true,
    message:
      'Pedido enviado: en unos segundos el lector muestra la pantalla de registro. Que el socio se pare frente al lector. Si no aparece, registralo desde el menú del lector (Usuarios → buscar su número → Cara).',
  }
}
