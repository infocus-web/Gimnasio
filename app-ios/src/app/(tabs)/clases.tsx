import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import * as Crypto from 'expo-crypto'
import * as Haptics from 'expo-haptics'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { bookingErrorMessage } from '@/features/classes/errors'
import { FamilyPicker } from '@/components/FamilyPicker'
import { Button, Card, Loading, Notice, Screen, Title, Txt } from '@/components/ui'
import { colors, radius } from '@/lib/theme'

type BookingStatus = 'booked' | 'waitlisted' | 'checked_in'

interface Session {
  id: string
  className: string
  color: string
  roomName: string
  instructorName: string
  startsAt: string
  endsAt: string
  spotsLeft: number
  waitlistLeft: number
  myBooking?: { id: string; status: BookingStatus; waitlistPosition: number | null }
}

/** Mismo valor por defecto que organizations.late_cancel_minutes en la base. */
const DEFAULT_LATE_CANCEL_MINUTES = 120
const TZ = 'America/Argentina/Buenos_Aires'

const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const dayLabel = (iso: string) => new Intl.DateTimeFormat('es-AR', { timeZone: TZ, weekday: 'short', day: 'numeric' }).format(new Date(iso))
const timeLabel = (iso: string) => new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))

export default function ClasesScreen() {
  const { org, activeMemberId } = useAuth()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [pulling, setPulling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [lateCancelMinutes, setLateCancelMinutes] = useState(DEFAULT_LATE_CANCEL_MINUTES)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const pendingRef = useRef(new Set<string>())

  useEffect(() => {
    if (!org) return
    void supabase
      .from('organizations')
      .select('late_cancel_minutes')
      .eq('id', org.id)
      .maybeSingle()
      .then(({ data }) => {
        const v = (data as { late_cancel_minutes?: number } | null)?.late_cancel_minutes
        if (typeof v === 'number' && v >= 0) setLateCancelMinutes(v)
      })
  }, [org])

  const load = useCallback(async () => {
    if (!org || !activeMemberId) return
    try {
      const from = new Date()
      from.setHours(0, 0, 0, 0)
      const to = new Date(from)
      to.setDate(to.getDate() + 7)
      const { data: rows, error: err } = await supabase
        .from('class_sessions_availability')
        .select('id, class_name, color, room_name, instructor_name, starts_at, ends_at, spots_left, waitlist_left')
        .eq('org_id', org.id)
        .eq('status', 'scheduled')
        .gte('starts_at', from.toISOString())
        .lt('starts_at', to.toISOString())
        .order('starts_at')
      if (err) throw err
      type Row = {
        id: string
        class_name: string | null
        color: string | null
        room_name: string | null
        instructor_name: string | null
        starts_at: string
        ends_at: string
        spots_left: number | null
        waitlist_left: number | null
      }
      const list = (rows ?? []) as Row[]
      const ids = list.map((r) => r.id)
      const mine = new Map<string, Session['myBooking']>()
      if (ids.length) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id, session_id, status, waitlist_position')
          .eq('member_id', activeMemberId)
          .in('session_id', ids)
          .in('status', ['booked', 'waitlisted', 'checked_in'])
        for (const b of (bookings ?? []) as { id: string; session_id: string; status: BookingStatus; waitlist_position: number | null }[]) {
          mine.set(b.session_id, { id: b.id, status: b.status, waitlistPosition: b.waitlist_position })
        }
      }
      // Las que ya terminaron no se muestran
      const now = Date.now()
      setSessions(
        list
          .filter((r) => new Date(r.ends_at).getTime() > now)
          .map((r) => ({
            id: r.id,
            className: r.class_name ?? 'Clase',
            color: r.color ?? colors.accent,
            roomName: r.room_name ?? '',
            instructorName: r.instructor_name ?? '',
            startsAt: r.starts_at,
            endsAt: r.ends_at,
            spotsLeft: Math.max(0, r.spots_left ?? 0),
            waitlistLeft: Math.max(0, r.waitlist_left ?? 0),
            myBooking: mine.get(r.id),
          })),
      )
      setError(null)
    } catch {
      setError('No pudimos cargar las clases. Revisá tu conexión.')
    } finally {
      setLoading(false)
    }
  }, [org, activeMemberId])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  // Al volver a esta pestaña, cupos actualizados
  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const days = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of sessions) if (!map.has(dayKey(s.startsAt))) map.set(dayKey(s.startsAt), dayLabel(s.startsAt))
    return [...map.entries()]
  }, [sessions])

  const day = selectedDay && days.some(([k]) => k === selectedDay) ? selectedDay : days[0]?.[0] ?? null
  const visible = sessions.filter((s) => dayKey(s.startsAt) === day)

  /** Corre una operación sobre una clase marcándola "en curso"; siempre la libera, aunque falle la red. */
  const withPending = async (sessionId: string, fn: () => Promise<void>) => {
    if (pendingRef.current.has(sessionId)) return
    pendingRef.current.add(sessionId)
    setPending(new Set(pendingRef.current))
    try {
      await fn()
    } catch {
      Alert.alert('Sin conexión', 'Probá de nuevo.')
    } finally {
      await load()
      pendingRef.current.delete(sessionId)
      setPending(new Set(pendingRef.current))
    }
  }

  // book_class valida todo en una sola transacción (membresía, cupo, ya anotado, equipo); igual que la web
  const book = (s: Session, allowWaitlist: boolean) =>
    withPending(s.id, async () => {
      const { data, error: err } = await supabase.rpc('book_class', {
        p_session_id: s.id,
        p_member_id: activeMemberId,
        p_equipment_id: null,
        p_idempotency_key: Crypto.randomUUID(),
        p_allow_waitlist: allowWaitlist,
      })
      if (err) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        Alert.alert('No se pudo reservar', bookingErrorMessage(err))
        return
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      const result = data as { status?: string; equipment_label?: string | null } | null
      if (result?.status === 'waitlisted') Alert.alert('En lista de espera', 'Si se libera un lugar, quedás anotado automáticamente.')
    })

  const cancel = (s: Session) => {
    const b = s.myBooking
    if (!b) return
    const minutesLeft = (new Date(s.startsAt).getTime() - Date.now()) / 60_000
    const late = b.status === 'booked' && minutesLeft > 0 && minutesLeft < lateCancelMinutes
    const msg =
      b.status === 'waitlisted'
        ? '¿Salir de la lista de espera?'
        : late
          ? `Faltan menos de ${formatWindow(lateCancelMinutes)} para la clase: cuenta como cancelación tardía y, si tenés un pack, podés perder la clase.`
          : '¿Cancelar la reserva?'
    Alert.alert(b.status === 'waitlisted' ? 'Lista de espera' : 'Cancelar reserva', msg, [
      { text: 'No', style: 'cancel' },
      {
        text: b.status === 'waitlisted' ? 'Salir' : 'Cancelar reserva',
        style: 'destructive',
        onPress: () =>
          void withPending(s.id, async () => {
            const { error: err } = await supabase.rpc('cancel_booking', { p_booking_id: b.id })
            if (err) Alert.alert('No se pudo cancelar', bookingErrorMessage(err))
          }),
      },
    ])
  }

  const onPull = async () => {
    setPulling(true)
    await load()
    setPulling(false)
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={pulling} onRefresh={() => void onPull()} tintColor={colors.accent} />}>
      <Title sub="Próximos 7 días">Clases</Title>
      <FamilyPicker />
      {error ? <Notice text={error} /> : null}

      {loading ? (
        <Loading />
      ) : sessions.length === 0 ? (
        <Card>
          <Txt muted center>
            No hay clases cargadas para los próximos días.
          </Txt>
        </Card>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {days.map(([k, label]) => {
              const on = k === day
              return (
                <Pressable
                  key={k}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    void Haptics.selectionAsync()
                    setSelectedDay(k)
                  }}
                  style={{
                    minHeight: 44,
                    minWidth: 64,
                    paddingHorizontal: 14,
                    borderRadius: radius.sm,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? colors.accent : colors.cardAlt,
                    borderWidth: 1,
                    borderColor: on ? colors.accent : colors.border,
                  }}
                >
                  <Txt bold size={14} color={on ? colors.onAccent : colors.text}>
                    {label.replace('.', '')}
                  </Txt>
                </Pressable>
              )
            })}
          </ScrollView>

          {visible.map((s) => (
            <ClassCard key={s.id} s={s} busy={pending.has(s.id)} onBook={(w) => void book(s, w)} onCancel={() => cancel(s)} />
          ))}
        </>
      )}
    </Screen>
  )
}

function ClassCard({ s, busy, onBook, onCancel }: { s: Session; busy: boolean; onBook: (waitlist: boolean) => void; onCancel: () => void }) {
  const b = s.myBooking
  const started = new Date(s.startsAt).getTime() <= Date.now()
  return (
    <Card style={{ borderLeftWidth: 4, borderLeftColor: s.color }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt bold size={17}>
            {s.className}
          </Txt>
          <Txt muted size={14}>
            {[s.instructorName, s.roomName].filter(Boolean).join(' · ')}
          </Txt>
        </View>
        <Txt bold size={17} color={colors.accent}>
          {timeLabel(s.startsAt)}
        </Txt>
      </View>

      {b ? (
        <Txt bold size={14} color={b.status === 'waitlisted' ? colors.warn : colors.ok}>
          {b.status === 'checked_in'
            ? '✓ Asististe'
            : b.status === 'waitlisted'
              ? `En lista de espera${b.waitlistPosition ? ` (puesto ${b.waitlistPosition})` : ''}`
              : '✓ Estás anotado'}
        </Txt>
      ) : (
        <Txt muted size={14}>
          {s.spotsLeft > 0 ? `${s.spotsLeft} ${s.spotsLeft === 1 ? 'lugar libre' : 'lugares libres'}` : s.waitlistLeft > 0 ? 'Completa · hay lista de espera' : 'Completa'}
        </Txt>
      )}

      {b?.status === 'checked_in' || started ? null : b ? (
        <Button small variant="ghost" label={b.status === 'waitlisted' ? 'Salir de la lista' : 'Cancelar reserva'} onPress={onCancel} busy={busy} />
      ) : s.spotsLeft > 0 ? (
        <Button small label="Reservar" onPress={() => onBook(false)} busy={busy} />
      ) : s.waitlistLeft > 0 ? (
        <Button small variant="ghost" label="Anotarme en lista de espera" onPress={() => onBook(true)} busy={busy} />
      ) : null}
    </Card>
  )
}

function formatWindow(min: number) {
  if (min % 60 === 0) {
    const h = min / 60
    return h === 1 ? '1 hora' : `${h} horas`
  }
  return `${min} minutos`
}

