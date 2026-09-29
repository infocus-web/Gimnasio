'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAdminContext } from './context'
import { dbMessage, ERRORS, formObject, type ActionState } from './errors'

async function guard(slug: string, perm: 'schedule.manage' | 'bookings.manage' = 'schedule.manage') {
  const ctx = await getAdminContext(slug)
  return ctx?.can(perm) ? ctx : null
}

function done(slug: string, message: string): ActionState {
  revalidatePath(`/${slug}/admin/agenda`, 'layout')
  revalidatePath(`/${slug}`)
  return { ok: true, message }
}

function issues(err: z.ZodError): ActionState {
  const fe: Record<string, string> = {}
  for (const i of err.issues) fe[String(i.path[0])] ??= i.message
  return { fieldErrors: fe }
}

// ---------------------------------------------------------------------
// Clases (sesiones)
// ---------------------------------------------------------------------

export async function generateSessions(slug: string, _prev: ActionState): Promise<ActionState> {
  const ctx = await guard(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('generate_sessions', { p_org: ctx.org.id, p_weeks: 4 })
  if (error) return { message: dbMessage(error) }
  const r = data as { created: number; skipped: number }
  const extra = r.skipped ? ` ${r.skipped} fechas se saltearon por choque de sala o profesor.` : ''
  return done(slug, r.created ? `Se crearon ${r.created} clases de las próximas 4 semanas.${extra}` : `Las próximas 4 semanas ya estaban al día.${extra}`)
}

export async function cancelSession(slug: string, sessionId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await guard(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('cancel_session', {
    p_session: sessionId,
    p_reason: String(form.get('reason') ?? '').trim() || undefined,
  })
  if (error) return { message: dbMessage(error) }
  return done(slug, data ? `Clase cancelada. Se liberaron ${data} reservas.` : 'Clase cancelada.')
}

export async function bookForMember(slug: string, sessionId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await guard(slug, 'bookings.manage')
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const memberId = String(form.get('memberId') ?? '')
  if (!memberId) return { fieldErrors: { memberId: 'Elegí un socio de la lista' } }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('book_class', {
    p_session_id: sessionId,
    p_member_id: memberId,
    p_idempotency_key: `desk:${sessionId}:${memberId}`,
  })
  if (error) return { message: dbMessage(error) }
  const status = (data as { status?: string } | null)?.status
  return done(slug, status === 'waitlisted' ? 'Clase llena: quedó en lista de espera.' : 'Reserva confirmada.')
}

export async function cancelBookingDesk(slug: string, bookingId: string): Promise<void> {
  const ctx = await guard(slug, 'bookings.manage')
  if (!ctx) return
  const supabase = await createClient()
  await supabase.rpc('cancel_booking', { p_booking_id: bookingId })
  revalidatePath(`/${slug}/admin/agenda`, 'layout')
}

// ---------------------------------------------------------------------
// Grilla semanal
// ---------------------------------------------------------------------

const seriesSchema = z.object({
  classTypeId: z.uuid('Elegí la actividad'),
  roomId: z.uuid('Elegí la sala'),
  instructorId: z.uuid('Elegí el profesor'),
  weekday: z.coerce.number().int().min(1).max(7),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Hora inválida'),
  durationMin: z.coerce.number().int().min(5, 'Mínimo 5 minutos').max(480),
  capacity: z.coerce.number().int().min(1, 'Mínimo 1 lugar').max(500),
  validFrom: z.string().optional(),
})

export async function createSeries(slug: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await guard(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const parsed = seriesSchema.safeParse(formObject(form))
  if (!parsed.success) return issues(parsed.error)
  const s = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.from('class_series').insert({
    org_id: ctx.org.id,
    class_type_id: s.classTypeId,
    room_id: s.roomId,
    instructor_id: s.instructorId,
    weekday: s.weekday,
    start_time: s.startTime,
    duration_min: s.durationMin,
    capacity: s.capacity,
    ...(s.validFrom ? { valid_from: s.validFrom } : {}),
  })
  if (error) return { message: dbMessage(error) }
  const gen = await supabase.rpc('generate_sessions', { p_org: ctx.org.id, p_weeks: 4 })
  const r = (gen.data ?? { created: 0, skipped: 0 }) as { created: number; skipped: number }
  const warn = r.skipped ? ` Atención: ${r.skipped} fechas chocan con otra clase (misma sala o profe) y no se crearon.` : ''
  return done(slug, `Horario agregado. Se crearon ${r.created} clases.${warn}`)
}

export async function updateSeries(slug: string, seriesId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await guard(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const raw = formObject(form)
  const parsed = z
    .object({ roomId: z.uuid(), instructorId: z.uuid(), capacity: z.coerce.number().int().min(1).max(500) })
    .safeParse(raw)
  if (!parsed.success) return issues(parsed.error)
  const supabase = await createClient()
  const { error } = await supabase
    .from('class_series')
    .update({ room_id: parsed.data.roomId, instructor_id: parsed.data.instructorId, capacity: parsed.data.capacity })
    .eq('id', seriesId)
    .eq('org_id', ctx.org.id)
  if (error) return { message: dbMessage(error) }
  const { data } = await supabase.rpc('apply_series_to_future', { p_series: seriesId })
  return done(slug, `Guardado. Se actualizaron ${data ?? 0} clases futuras.`)
}

export async function endSeries(slug: string, seriesId: string, _prev: ActionState): Promise<ActionState> {
  const ctx = await guard(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('end_series', { p_series: seriesId })
  if (error) return { message: dbMessage(error) }
  const r = data as { deleted: number; kept_with_bookings: number }
  const kept = r.kept_with_bookings
    ? ` ${r.kept_with_bookings} clases ya tenían reservas y se mantienen (cancelalas desde la agenda si hace falta).`
    : ''
  return done(slug, `Horario dado de baja. Se borraron ${r.deleted} clases futuras.${kept}`)
}

// ---------------------------------------------------------------------
// Salas, equipos y actividades
// ---------------------------------------------------------------------

export async function saveRoom(slug: string, roomId: string | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await guard(slug)
  if (!ctx || !ctx.org.locationId) return { message: ERRORS.FORBIDDEN }
  const parsed = z
    .object({ name: z.string().trim().min(1, 'Poné un nombre'), capacity: z.coerce.number().int().min(1).max(1000) })
    .safeParse(formObject(form))
  if (!parsed.success) return issues(parsed.error)
  const supabase = await createClient()
  const row = { name: parsed.data.name, capacity: parsed.data.capacity, active: roomId ? form.get('active') === 'on' : true }
  const { error } = roomId
    ? await supabase.from('rooms').update(row).eq('id', roomId).eq('org_id', ctx.org.id)
    : await supabase.from('rooms').insert({ ...row, org_id: ctx.org.id, location_id: ctx.org.locationId })
  if (error) return { message: dbMessage(error) }
  return done(slug, roomId ? 'Sala guardada.' : 'Sala creada.')
}

export async function addEquipment(slug: string, roomId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await guard(slug)
  if (!ctx || !ctx.org.locationId) return { message: ERRORS.FORBIDDEN }
  const parsed = z
    .object({
      kind: z.string().trim().toLowerCase().min(1, 'Indicá el tipo (ej. bike)').max(30),
      count: z.coerce.number().int().min(1).max(100),
      startAt: z.coerce.number().int().min(1).max(999).default(1),
    })
    .safeParse(formObject(form))
  if (!parsed.success) return issues(parsed.error)
  const { kind, count, startAt } = parsed.data
  const rows = Array.from({ length: count }, (_, i) => ({
    org_id: ctx.org.id,
    location_id: ctx.org.locationId!,
    room_id: roomId,
    kind,
    label: `#${startAt + i}`,
  }))
  const supabase = await createClient()
  const { error } = await supabase.from('equipment').upsert(rows, { onConflict: 'location_id,kind,label', ignoreDuplicates: true })
  if (error) return { message: dbMessage(error) }
  return done(slug, `Se agregaron ${count} equipos "${kind}".`)
}

export async function setEquipmentStatus(slug: string, equipmentId: string, status: 'active' | 'maintenance' | 'retired'): Promise<void> {
  const ctx = await guard(slug)
  if (!ctx) return
  const supabase = await createClient()
  await supabase.from('equipment').update({ status }).eq('id', equipmentId).eq('org_id', ctx.org.id)
  revalidatePath(`/${slug}/admin/agenda`, 'layout')
}

const typeSchema = z.object({
  name: z.string().trim().min(1, 'Poné un nombre'),
  description: z.string().trim().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#edcc36'),
  durationMin: z.coerce.number().int().min(5).max(480),
  capacity: z.coerce.number().int().min(1).max(500),
  equipmentKind: z.string().trim().toLowerCase().optional(),
})

export async function saveClassType(slug: string, typeId: string | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await guard(slug)
  if (!ctx) return { message: ERRORS.FORBIDDEN }
  const parsed = typeSchema.safeParse(formObject(form))
  if (!parsed.success) return issues(parsed.error)
  const t = parsed.data
  const row = {
    name: t.name,
    description: t.description || null,
    color: t.color,
    default_duration_min: t.durationMin,
    default_capacity: t.capacity,
    equipment_kind: t.equipmentKind || null,
    active: typeId ? form.get('active') === 'on' : true,
  }
  const supabase = await createClient()
  const { error } = typeId
    ? await supabase.from('class_types').update(row).eq('id', typeId).eq('org_id', ctx.org.id)
    : await supabase.from('class_types').insert({ ...row, org_id: ctx.org.id })
  if (error) return { message: dbMessage(error) }
  return done(slug, typeId ? 'Actividad guardada.' : 'Actividad creada.')
}
