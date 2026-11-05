import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata, Route } from 'next'
import { ArrowLeft, X, HeartPulse, Check, UserX } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { bookForMember, cancelBookingDesk, cancelSession, editSession } from '@/features/admin/schedule-actions'
import { markAttendance } from '@/features/admin/coach-actions'
import { fmtTime } from '@/features/admin/format'
import { BookForMemberForm, CancelSessionForm } from '@/features/admin/ScheduleForms'
import { Card } from '@/features/admin/ui'
import { ActionButton, ConfirmAction } from '@/features/admin/ConfirmAction'
import { equipmentLabel } from '@/features/admin/equipment'
import { EditSessionForm } from '@/features/admin/ClassEditForms'
import { WhatsAppComposer, type ComposerStudent } from '@/features/admin/WhatsAppComposer'
import { classVars, normalizeArPhone } from '@/features/admin/whatsapp'
import { loadTemplates } from '@/features/admin/templates'
import { todayYMD } from '@/features/admin/format'

export const metadata: Metadata = { title: 'Clase' }

const STATUS: Record<string, { label: string; cls: string }> = {
  booked: { label: 'Reservado', cls: 'text-zinc-300' },
  checked_in: { label: 'Vino', cls: 'text-emerald-300' },
  waitlisted: { label: 'En espera', cls: 'text-amber-200' },
  no_show: { label: 'No vino', cls: 'text-red-300' },
  canceled: { label: 'Canceló', cls: 'text-zinc-500' },
  late_canceled: { label: 'Canceló tarde', cls: 'text-red-300' },
}

export default async function SessionPage({ params }: PageProps<'/[org]/admin/agenda/[sessionId]'>) {
  const { org: slug, sessionId } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx) return null // sin sesión de staff: el layout ya muestra el aviso
  const tz = ctx.org.timezone
  const supabase = await createClient()

  const { data: s } = await supabase
    .from('class_sessions_availability')
    .select('*')
    .eq('id', sessionId)
    .eq('org_id', ctx.org.id)
    .maybeSingle()
  if (!s) notFound()

  // 0040: el profe maneja SU clase (horario, cupo, anotar/sacar socios, cancelar)
  const canManageClass = ctx.can('schedule.manage') || (ctx.can('schedule.own') && s.instructor_id === ctx.staff.id)
  const canBook = ctx.can('bookings.manage') || canManageClass
  const isMine = s.instructor_id === ctx.staff.id

  const [{ data: roster }, { data: sessionRow }, { data: rooms }, { data: myClients }, templates] = await Promise.all([
    supabase
      .from('session_roster')
      .select('booking_id, member_id, member_name, phone, status, waitlist_position, equipment_label, medical_notes, source')
      .eq('session_id', sessionId)
      .order('status')
      .order('created_at'),
    supabase.from('class_sessions').select('cancel_reason').eq('id', sessionId).maybeSingle(),
    canManageClass
      ? supabase.from('rooms').select('id, name, capacity').eq('org_id', ctx.org.id).eq('active', true).order('name')
      : Promise.resolve({ data: null }),
    ctx.can('members.read')
      ? Promise.resolve({ data: null })
      : supabase.from('trainer_clients').select('member_id').eq('trainer_id', ctx.staff.id),
    isMine || ctx.can('members.write') ? loadTemplates(ctx.org.id, ctx.staff.id) : Promise.resolve(null),
  ])
  const clientIds = new Set((myClients ?? []).map((c) => c.member_id))

  const active = (roster ?? []).filter((r) => r.status === 'booked' || r.status === 'checked_in')
  // "No vino" sigue ocupando su lugar (así lo cuentan los reportes): va en la lista principal, no en cancelaciones
  const noShows = (roster ?? []).filter((r) => r.status === 'no_show')
  const waiting = (roster ?? []).filter((r) => r.status === 'waitlisted').sort((a, b) => (a.waitlist_position ?? 0) - (b.waitlist_position ?? 0))
  const others = (roster ?? []).filter((r) => !['booked', 'checked_in', 'no_show', 'waitlisted'].includes(r.status!))
  const occupied = active.length + noShows.length
  const future = new Date(s.starts_at!).getTime() > Date.now()
  const notEnded = new Date(s.ends_at!).getTime() > Date.now()
  const kindLabel = equipmentLabel(s.equipment_kind) || 'Equipo'
  const scheduled = s.status === 'scheduled'
  const canAttend =
    (ctx.can('bookings.manage') || s.instructor_id === ctx.staff.id) &&
    scheduled &&
    new Date(s.starts_at!).getTime() - 30 * 60_000 <= Date.now()
  const dateLabel = new Intl.DateTimeFormat('es-AR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(s.starts_at!))

  // Día y hora de la clase en la zona del gimnasio (para el formulario de edición)
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(s.starts_at!))
  const localTime = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(s.starts_at!))
  const durationMin = Math.round((new Date(s.ends_at!).getTime() - new Date(s.starts_at!).getTime()) / 60_000)

  // WhatsApp a los de esta clase
  const tagOf: Record<string, string> = { booked: 'anotados', checked_in: 'anotados', waitlisted: 'espera', no_show: 'no_vino' }
  const students: ComposerStudent[] = [...active, ...waiting, ...noShows].map((r) => ({
    id: r.member_id!,
    name: r.member_name ?? 'Socio',
    phone: normalizeArPhone(r.phone),
    tags: [tagOf[r.status!] ?? 'otros'],
  }))
  const waFilters = [
    { key: 'anotados', label: `Anotados (${active.length})` },
    ...(waiting.length ? [{ key: 'espera', label: `En espera (${waiting.length})` }] : []),
    ...(noShows.length ? [{ key: 'no_vino', label: `No vinieron (${noShows.length})` }] : []),
    { key: 'all', label: 'Todos' },
  ]

  const memberHref = (memberId: string) =>
    ctx.can('members.read') ? `/${slug}/admin/socios/${memberId}` : clientIds.has(memberId) ? `/${slug}/admin/alumnos/${memberId}` : null

  const Row = ({ r }: { r: NonNullable<typeof roster>[number] }) => {
    const href = memberHref(r.member_id!)
    return (
    <li className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
      <span className="min-w-0 flex-1">
        {href ? (
          <Link href={href as Route} className="font-semibold text-white hover:text-[#edcc36]">
            {r.member_name}
          </Link>
        ) : (
          <span className="font-semibold text-white">{r.member_name}</span>
        )}
        <span className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          {r.equipment_label && (
            <span>
              {kindLabel} {r.equipment_label}
            </span>
          )}
          {r.status === 'waitlisted' && <span>#{r.waitlist_position} en espera</span>}
          {r.source === 'front_desk' && <span>cargado en recepción</span>}
          {r.medical_notes && (
            <span className="inline-flex items-center gap-1 text-amber-200">
              <HeartPulse className="h-3 w-3" aria-hidden="true" /> {r.medical_notes}
            </span>
          )}
        </span>
      </span>
      {canAttend && ['booked', 'checked_in', 'no_show'].includes(r.status!) ? (
        <span className="flex items-start gap-1">
          <ActionButton
            action={markAttendance.bind(null, slug, r.booking_id!, r.status === 'checked_in' ? 'booked' : 'checked_in')}
            ariaPressed={r.status === 'checked_in'}
            ariaLabel={`${r.member_name} vino`}
            className={`inline-flex min-h-[40px] items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold ${r.status === 'checked_in' ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200' : 'border-zinc-700 text-zinc-300 hover:border-emerald-500/50'}`}
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" /> Vino
          </ActionButton>
          <ActionButton
            action={markAttendance.bind(null, slug, r.booking_id!, r.status === 'no_show' ? 'booked' : 'no_show')}
            ariaPressed={r.status === 'no_show'}
            ariaLabel={`${r.member_name} no vino`}
            className={`inline-flex min-h-[40px] items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold ${r.status === 'no_show' ? 'border-red-500/50 bg-red-500/15 text-red-200' : 'border-zinc-700 text-zinc-300 hover:border-red-500/50'}`}
          >
            <UserX className="h-3.5 w-3.5" aria-hidden="true" /> No vino
          </ActionButton>
        </span>
      ) : (
        <span className={`text-xs ${STATUS[r.status!]?.cls ?? ''}`}>{STATUS[r.status!]?.label ?? r.status}</span>
      )}
      {canBook && scheduled && notEnded && (r.status === 'booked' || r.status === 'waitlisted') && (
        <ConfirmAction
          action={cancelBookingDesk.bind(null, slug, r.booking_id!)}
          variant="icon"
          ariaLabel={`Cancelar reserva de ${r.member_name}`}
          confirmText={r.status === 'waitlisted' ? `Sale ${r.member_name} de la lista de espera.` : `Se cancela la reserva de ${r.member_name} y se libera el lugar.`}
          yesLabel="Sí, cancelar"
          className="flex flex-col items-end gap-1"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </ConfirmAction>
      )}
    </li>
    )
  }

  return (
    <div className="space-y-5">
      {ctx.can('schedule.manage') || ctx.can('bookings.manage') ? (
        <Link href={`/${slug}/admin/agenda` as Route} className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Agenda
        </Link>
      ) : (
        <Link href={`/${slug}/admin/mis-clases` as Route} className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Mis clases
        </Link>
      )}
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-5" style={{ borderLeft: `6px solid ${s.color ?? '#edcc36'}` }}>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 first-letter:uppercase">{dateLabel}</p>
        <h2 className={`text-2xl font-extrabold text-white ${scheduled ? '' : 'line-through'}`}>{s.class_name}</h2>
        <p className="text-sm text-zinc-400">
          {fmtTime(s.starts_at!, tz)}–{fmtTime(s.ends_at!, tz)} · {s.instructor_name} · {s.room_name}
        </p>
        <p className="mt-2 text-sm text-zinc-300">
          <strong className="text-white">{occupied}</strong> de {s.capacity} lugares · {waiting.length} en espera
          {noShows.length > 0 && <> · {noShows.length} no {noShows.length === 1 ? 'vino' : 'vinieron'}</>}
        </p>
        {!scheduled && (
          <p className="mt-2 text-sm text-red-300">
            Clase {s.status === 'canceled' ? 'cancelada' : 'finalizada'}
            {sessionRow?.cancel_reason ? `: ${sessionRow.cancel_reason}` : ''}
          </p>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Inscriptos">
          {active.length || noShows.length || waiting.length || others.length ? (
            <div className="space-y-4">
              {active.length > 0 && <ul className="divide-y divide-zinc-900">{active.map((r) => <Row key={r.booking_id} r={r} />)}</ul>}
              {noShows.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase text-red-300/80">No vino ({noShows.length})</h3>
                  <ul className="divide-y divide-zinc-900">{noShows.map((r) => <Row key={r.booking_id} r={r} />)}</ul>
                </div>
              )}
              {waiting.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase text-zinc-500">Lista de espera</h3>
                  <ul className="divide-y divide-zinc-900">{waiting.map((r) => <Row key={r.booking_id} r={r} />)}</ul>
                </div>
              )}
              {others.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-xs text-zinc-500">Cancelaciones ({others.length})</summary>
                  <ul className="divide-y divide-zinc-900">{others.map((r) => <Row key={r.booking_id} r={r} />)}</ul>
                </details>
              )}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Todavía nadie reservó.</p>
          )}
        </Card>

        <div className="space-y-5">
          {templates && students.length > 0 && (
            <WhatsAppComposer
              slug={slug}
              senderName={ctx.staff.display_name}
              students={students}
              templates={templates}
              filters={waFilters}
              preselect="anotados"
              classInfo={classVars(s.class_name ?? 'la clase', s.starts_at!, tz)}
              buttonLabel="WhatsApp a los de esta clase"
            />
          )}
          {canBook && scheduled && future && (
            <Card title="Anotar a un socio">
              <BookForMemberForm
                action={bookForMember.bind(null, slug, sessionId)}
                orgId={ctx.org.id}
                sessionId={ctx.can('bookings.manage') ? undefined : sessionId}
              />
            </Card>
          )}
          {canManageClass && scheduled && notEnded && rooms && (
            <EditSessionForm
              action={editSession.bind(null, slug, sessionId)}
              date={localDate}
              time={localTime}
              durationMin={durationMin}
              capacity={s.capacity ?? 1}
              roomId={s.room_id!}
              rooms={rooms.map((r) => ({ id: r.id, name: r.name, capacity: r.capacity }))}
              booked={occupied}
              minDate={todayYMD(tz)}
            />
          )}
          {canManageClass && scheduled && future && (
            <CancelSessionForm action={cancelSession.bind(null, slug, sessionId)} />
          )}
        </div>
      </div>
    </div>
  )
}
