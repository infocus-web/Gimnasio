import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata, Route } from 'next'
import { ArrowLeft, X, HeartPulse, Check, UserX } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { bookForMember, cancelBookingDesk, cancelSession } from '@/features/admin/schedule-actions'
import { markAttendance } from '@/features/admin/coach-actions'
import { fmtTime } from '@/features/admin/format'
import { BookForMemberForm, CancelSessionForm } from '@/features/admin/ScheduleForms'
import { Card } from '@/features/admin/ui'

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
  const ctx = (await getAdminContext(slug))!
  const tz = ctx.org.timezone
  const supabase = await createClient()

  const { data: s } = await supabase
    .from('class_sessions_availability')
    .select('*')
    .eq('id', sessionId)
    .eq('org_id', ctx.org.id)
    .maybeSingle()
  if (!s) notFound()

  const [{ data: roster }, { data: sessionRow }] = await Promise.all([
    supabase
      .from('session_roster')
      .select('booking_id, member_id, member_name, status, waitlist_position, equipment_label, medical_notes, source')
      .eq('session_id', sessionId)
      .order('status')
      .order('created_at'),
    supabase.from('class_sessions').select('cancel_reason').eq('id', sessionId).maybeSingle(),
  ])

  const active = (roster ?? []).filter((r) => r.status === 'booked' || r.status === 'checked_in')
  const waiting = (roster ?? []).filter((r) => r.status === 'waitlisted').sort((a, b) => (a.waitlist_position ?? 0) - (b.waitlist_position ?? 0))
  const others = (roster ?? []).filter((r) => !['booked', 'checked_in', 'waitlisted'].includes(r.status!))
  const future = new Date(s.starts_at!).getTime() > Date.now()
  const scheduled = s.status === 'scheduled'
  const canAttend =
    (ctx.can('bookings.manage') || s.instructor_id === ctx.staff.id) &&
    scheduled &&
    new Date(s.starts_at!).getTime() - 30 * 60_000 <= Date.now()
  const dateLabel = new Intl.DateTimeFormat('es-AR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(s.starts_at!))

  const Row = ({ r }: { r: NonNullable<typeof roster>[number] }) => (
    <li className="flex items-center gap-3 py-2.5 text-sm">
      <span className="min-w-0 flex-1">
        <Link href={(ctx.can('members.read') ? `/${slug}/admin/socios/${r.member_id}` : `/${slug}/admin/alumnos/${r.member_id}`) as Route} className="font-semibold text-white hover:text-[#edcc36]">
          {r.member_name}
        </Link>
        <span className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          {r.equipment_label && <span>Bici {r.equipment_label}</span>}
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
        <span className="flex gap-1">
          <form action={markAttendance.bind(null, slug, r.booking_id!, r.status === 'checked_in' ? 'booked' : 'checked_in')}>
            <button type="submit" aria-pressed={r.status === 'checked_in'} aria-label={`${r.member_name} vino`}
              className={`inline-flex min-h-[40px] items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold ${r.status === 'checked_in' ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200' : 'border-zinc-700 text-zinc-300 hover:border-emerald-500/50'}`}>
              <Check className="h-3.5 w-3.5" aria-hidden="true" /> Vino
            </button>
          </form>
          <form action={markAttendance.bind(null, slug, r.booking_id!, r.status === 'no_show' ? 'booked' : 'no_show')}>
            <button type="submit" aria-pressed={r.status === 'no_show'} aria-label={`${r.member_name} no vino`}
              className={`inline-flex min-h-[40px] items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold ${r.status === 'no_show' ? 'border-red-500/50 bg-red-500/15 text-red-200' : 'border-zinc-700 text-zinc-300 hover:border-red-500/50'}`}>
              <UserX className="h-3.5 w-3.5" aria-hidden="true" /> No vino
            </button>
          </form>
        </span>
      ) : (
        <span className={`text-xs ${STATUS[r.status!]?.cls ?? ''}`}>{STATUS[r.status!]?.label ?? r.status}</span>
      )}
      {ctx.can('bookings.manage') && future && !canAttend && (r.status === 'booked' || r.status === 'waitlisted') && (
        <form action={cancelBookingDesk.bind(null, slug, r.booking_id!)}>
          <button type="submit" aria-label={`Cancelar reserva de ${r.member_name}`}
            className="grid h-9 w-9 place-items-center rounded-lg border border-zinc-800 text-zinc-500 hover:border-red-500/50 hover:text-red-300">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
      )}
    </li>
  )

  return (
    <div className="space-y-5">
      <Link href={`/${slug}/admin/agenda` as Route} className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Agenda
      </Link>
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-5" style={{ borderLeft: `6px solid ${s.color ?? '#edcc36'}` }}>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 first-letter:uppercase">{dateLabel}</p>
        <h2 className={`text-2xl font-extrabold text-white ${scheduled ? '' : 'line-through'}`}>{s.class_name}</h2>
        <p className="text-sm text-zinc-400">
          {fmtTime(s.starts_at!, tz)}–{fmtTime(s.ends_at!, tz)} · {s.instructor_name} · {s.room_name}
        </p>
        <p className="mt-2 text-sm text-zinc-300">
          <strong className="text-white">{active.length}</strong> de {s.capacity} lugares · {waiting.length} en espera
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
          {active.length || waiting.length || others.length ? (
            <div className="space-y-4">
              {active.length > 0 && <ul className="divide-y divide-zinc-900">{active.map((r) => <Row key={r.booking_id} r={r} />)}</ul>}
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
          {ctx.can('bookings.manage') && scheduled && future && (
            <Card title="Anotar a un socio">
              <BookForMemberForm action={bookForMember.bind(null, slug, sessionId)} orgId={ctx.org.id} />
            </Card>
          )}
          {ctx.can('schedule.manage') && scheduled && future && (
            <CancelSessionForm action={cancelSession.bind(null, slug, sessionId)} />
          )}
        </div>
      </div>
    </div>
  )
}
