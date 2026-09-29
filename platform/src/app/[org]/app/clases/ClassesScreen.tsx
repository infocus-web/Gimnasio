'use client'

import { useCallback, useEffect, useState } from 'react'
import { ClassSchedule } from '@/components/classes/ClassSchedule'
import { useMember } from '@/features/member/MemberProvider'
import type { BookingErrorCode, BookingStatus, ClassSession, EquipmentSpot } from '@/types/platform'

const KNOWN_ERRORS: BookingErrorCode[] = [
  'MEMBERSHIP_REQUIRED', 'PAYMENT_PAST_DUE', 'CLASS_FULL', 'ALREADY_BOOKED', 'EQUIPMENT_TAKEN',
  'PLAN_EXCLUDES_CLASS_TYPE', 'NO_CREDITS_LEFT', 'WEEKLY_LIMIT_REACHED', 'BOOKING_CLOSED', 'MEMBER_TIME_CONFLICT',
]

export function ClassesScreen() {
  const { supabase, org, family, activeMemberId, setActiveMemberId } = useMember()
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [loading, setLoading] = useState(true)
  const [errorCode, setErrorCode] = useState<BookingErrorCode | null>(null)
  const [otherError, setOtherError] = useState<string | null>(null)

  const load = useCallback(async () => {
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
      setOtherError('No pudimos cargar la agenda.')
      setLoading(false)
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
    setLoading(false)
  }, [supabase, org.id, activeMemberId])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  const handleApiError = async (res: Response) => {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
    const code = body?.error?.code as BookingErrorCode | undefined
    if (code && KNOWN_ERRORS.includes(code)) setErrorCode(code)
    else setOtherError(body?.error?.message ?? 'No se pudo completar la operación.')
  }

  const book = async (sessionId: string, equipmentId?: string, allowWaitlist = false) => {
    setErrorCode(null)
    setOtherError(null)
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ sessionId, memberId: activeMemberId, equipmentId, allowWaitlist }),
    })
    if (!res.ok) await handleApiError(res)
    await load()
  }

  const cancel = async (sessionId: string) => {
    const bookingId = sessions.find((s) => s.id === sessionId)?.myBooking?.id
    if (!bookingId) return
    setErrorCode(null)
    setOtherError(null)
    const res = await fetch(`/api/bookings/${bookingId}`, { method: 'DELETE' })
    if (!res.ok) await handleApiError(res)
    await load()
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
    <div className="space-y-3">
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
        onBook={(id, equipmentId) => book(id, equipmentId)}
        onWaitlist={(id) => book(id, undefined, true)}
        onCancel={cancel}
        isLoading={loading}
        errorCode={errorCode}
        onDismissError={() => setErrorCode(null)}
      />
    </div>
  )
}
