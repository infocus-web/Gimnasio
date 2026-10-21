'use client'

import { useCallback, useRef, useEffect, useState } from 'react'
import { ClassSchedule } from '@/components/classes/ClassSchedule'
import { formatLateCancelWindow } from '@/components/classes/lateCancel'
import { useMember } from '@/features/member/MemberProvider'
import type { BookingErrorCode, BookingStatus, ClassSession, EquipmentSpot } from '@/types/platform'

const KNOWN_ERRORS: BookingErrorCode[] = [
  'MEMBERSHIP_REQUIRED', 'PAYMENT_PAST_DUE', 'CLASS_FULL', 'ALREADY_BOOKED', 'EQUIPMENT_TAKEN',
  'PLAN_EXCLUDES_CLASS_TYPE', 'NO_CREDITS_LEFT', 'WEEKLY_LIMIT_REACHED', 'BOOKING_CLOSED', 'MEMBER_TIME_CONFLICT',
]

/** Mismo valor por defecto que organizations.late_cancel_minutes en la base. */
const DEFAULT_LATE_CANCEL_MINUTES = 120
const OFFLINE_MSG = 'Sin conexión. Probá de nuevo.'

export function ClassesScreen() {
  const { supabase, org, family, activeMemberId, setActiveMemberId } = useMember()
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [loading, setLoading] = useState(true)
  const [errorCode, setErrorCode] = useState<BookingErrorCode | null>(null)
  const [otherError, setOtherError] = useState<string | null>(null)
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set())
  const [lateCancelMinutes, setLateCancelMinutes] = useState(DEFAULT_LATE_CANCEL_MINUTES)
  const topRef = useRef<HTMLDivElement>(null)
  // Evita dobles toques sobre la misma clase mientras responde el servidor
  const pendingRef = useRef(new Set<string>())

  // Ventana de cancelación tardía configurada por el gimnasio (la misma que usa el servidor)
  useEffect(() => {
    let cancelled = false
    void supabase
      .from('organizations')
      .select('late_cancel_minutes')
      .eq('id', org.id)
      .maybeSingle()
      .then(({ data }) => {
        const v = data?.late_cancel_minutes
        if (!cancelled && typeof v === 'number' && v >= 0) setLateCancelMinutes(v)
      })
    return () => {
      cancelled = true
    }
  }, [supabase, org.id])

  const load = useCallback(async () => {
    try {
      const from = new Date()
      from.setHours(0, 0, 0, 0)
      const to = new Date(from)
      to.setDate(to.getDate() + 7)

      const { data: rows, error } = await supabase
        .from('class_sessions_availability')
        .select('*')
        .eq('org_id', org.id)
        .eq('status', 'scheduled')
        .gte('starts_at', from.toISOString())
        .lt('starts_at', to.toISOString())
        .order('starts_at')
      if (error) {
        setOtherError('No pudimos cargar la agenda. Probá de nuevo en un momento.')
        return
      }

      const ids = (rows ?? []).map((r) => r.id).filter((x): x is string => !!x)
      const mine = new Map<string, ClassSession['myBooking']>()
      if (ids.length) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id, session_id, status, waitlist_position, equipment:equipment(label)')
          .eq('member_id', activeMemberId)
          .in('session_id', ids)
          .in('status', ['booked', 'waitlisted', 'checked_in'])
        for (const b of bookings ?? []) {
          mine.set(b.session_id, {
            id: b.id,
            status: b.status as BookingStatus,
            waitlistPosition: b.waitlist_position,
            equipmentLabel: b.equipment?.label ?? null,
          })
        }
      }

      setSessions(
        (rows ?? []).map((r) => ({
          id: r.id!,
          className: r.class_name ?? 'Clase',
          color: r.color ?? '#edcc36',
          roomName: r.room_name ?? '',
          instructorName: r.instructor_name ?? '',
          instructorPhotoUrl: r.instructor_photo_url ?? undefined,
          startsAt: r.starts_at!,
          endsAt: r.ends_at!,
          capacity: r.capacity ?? 0,
          spotsLeft: Math.max(0, r.spots_left ?? 0),
          waitlistLeft: Math.max(0, r.waitlist_left ?? 0),
          usesEquipment: !!r.uses_equipment,
          myBooking: mine.get(r.id!),
        })),
      )
    } catch {
      setOtherError(OFFLINE_MSG)
    } finally {
      setLoading(false)
    }
  }, [supabase, org.id, activeMemberId])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  // Que el aviso de error se vea aunque el socio esté scrolleado más abajo
  useEffect(() => {
    if (errorCode || otherError) topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [errorCode, otherError])

  const handleApiError = async (res: Response) => {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
    const code = body?.error?.code as BookingErrorCode | undefined
    if (code && KNOWN_ERRORS.includes(code)) setErrorCode(code)
    else setOtherError(body?.error?.message ?? 'No se pudo completar la operación. Probá de nuevo.')
  }

  /** Corre una operación sobre una clase marcándola "en curso"; siempre la libera, aunque falle la red. */
  const withPending = async (sessionId: string, fn: () => Promise<void>) => {
    if (pendingRef.current.has(sessionId)) return
    pendingRef.current.add(sessionId)
    setPendingIds(new Set(pendingRef.current))
    setErrorCode(null)
    setOtherError(null)
    try {
      await fn()
    } catch {
      setOtherError(OFFLINE_MSG)
    } finally {
      try {
        await load()
      } finally {
        pendingRef.current.delete(sessionId)
        setPendingIds(new Set(pendingRef.current))
      }
    }
  }

  const book = (sessionId: string, equipmentId?: string, allowWaitlist = false) =>
    withPending(sessionId, async () => {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ sessionId, memberId: activeMemberId, equipmentId, allowWaitlist }),
      })
      if (!res.ok) await handleApiError(res)
    })

  const cancel = async (sessionId: string) => {
    const s = sessions.find((x) => x.id === sessionId)
    const bookingId = s?.myBooking?.id
    if (!s || !bookingId || pendingRef.current.has(sessionId)) return
    const minutesLeft = (new Date(s.startsAt).getTime() - Date.now()) / 60_000
    const late = s.myBooking?.status === 'booked' && minutesLeft > 0 && minutesLeft < lateCancelMinutes
    const msg = s.myBooking?.status === 'waitlisted'
      ? '¿Salir de la lista de espera?'
      : late
        ? `¿Cancelar la reserva? Faltan menos de ${formatLateCancelWindow(lateCancelMinutes)} para la clase: cuenta como cancelación tardía y, si tenés un pack, podés perder la clase.`
        : '¿Cancelar la reserva?'
    if (!window.confirm(msg)) return
    await withPending(sessionId, async () => {
      const res = await fetch(`/api/bookings/${bookingId}`, { method: 'DELETE' })
      if (!res.ok) await handleApiError(res)
    })
  }

  const loadEquipmentSpots = async (sessionId: string): Promise<EquipmentSpot[]> => {
    const { data, error } = await supabase.rpc('session_equipment_map', { p_session_id: sessionId })
    if (error) throw error
    return (data ?? []).map((e) => ({
      id: e.id,
      label: e.label,
      taken: e.taken,
      row: e.grid_row,
      col: e.grid_col,
    }))
  }

  return (
    <div ref={topRef} className="scroll-mt-20 space-y-3">
      {otherError && (
        <p role="alert" className="rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {otherError}
        </p>
      )}
      <ClassSchedule
        sessions={sessions}
        familyMembers={family.length > 1 ? family : undefined}
        selectedFamilyMemberId={activeMemberId}
        onSelectFamilyMember={setActiveMemberId}
        loadEquipmentSpots={loadEquipmentSpots}
        onBook={(id, equipmentId) => void book(id, equipmentId)}
        onWaitlist={(id) => void book(id, undefined, true)}
        onCancel={(id) => void cancel(id)}
        isLoading={loading}
        errorCode={errorCode}
        onDismissError={() => setErrorCode(null)}
        pendingSessionIds={pendingIds}
        lateCancelMinutes={lateCancelMinutes}
      />
    </div>
  )
}
