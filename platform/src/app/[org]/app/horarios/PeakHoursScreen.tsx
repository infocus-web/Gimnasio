'use client'

import { useCallback, useEffect, useState } from 'react'
import { PeakHours, type OccupancyLevel } from '@/components/classes/PeakHours'
import { useMember } from '@/features/member/MemberProvider'
import { LiveOccupancy } from '@/features/access-plus/LiveOccupancy'
import type { PeakHourSlot } from '@/types/platform'

export function PeakHoursScreen() {
  const { supabase, org } = useMember()
  const [slots, setSlots] = useState<PeakHourSlot[]>([])
  const [level, setLevel] = useState<OccupancyLevel | undefined>(undefined)
  const [liveError, setLiveError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => {
    setLoading(true)
    setError(null)
    setAttempt((a) => a + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [peak, now] = await Promise.all([
          supabase.rpc('peak_hours', { p_org_id: org.id, p_weeks: 6 }),
          supabase.rpc('current_occupancy', { p_org_id: org.id }),
        ])
        if (cancelled) return
        if (peak.error) {
          setError('No pudimos cargar la concurrencia del gimnasio.')
          return
        }
        setSlots((peak.data ?? []).map((r) => ({ weekday: r.weekday, hour: r.hour, avgCheckins: Number(r.avg_checkins) || 0 })))
        if (now.error) {
          setLevel(undefined)
          setLiveError('No pudimos obtener el dato en vivo.')
        } else {
          setLevel((now.data as { level?: OccupancyLevel } | null)?.level)
          setLiveError(null)
        }
      } catch {
        if (!cancelled) setError('Sin conexión. Revisá tu internet y probá de nuevo.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, org.id, attempt])

  if (error) {
    return (
      <>
      <LiveOccupancy />
      <div role="alert" className="space-y-3 rounded-3xl border border-red-500/40 bg-zinc-950 p-6 text-center">
        <p className="text-sm text-red-200">{error}</p>
        <button
          type="button"
          onClick={retry}
          className="btn-tac btn-tac-ghost min-h-[44px] w-full rounded-xl border border-[#edcc36]/40 bg-zinc-900 px-4 text-sm font-semibold text-[#edcc36] hover:bg-[#edcc36] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
        >
          Reintentar
        </button>
      </div>
      </>
    )
  }

  const d = new Date()
  return (
    <>
      <LiveOccupancy />
      <PeakHours
        data={slots}
        openingHours={org.openingHours}
        currentEstimate={level}
        currentHour={d.getHours()}
        currentWeekday={((d.getDay() + 6) % 7) + 1}
        isLoading={loading}
        liveError={liveError}
      />
    </>
  )
}
