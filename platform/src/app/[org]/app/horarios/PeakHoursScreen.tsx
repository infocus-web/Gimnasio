'use client'

import { useEffect, useState } from 'react'
import { PeakHours } from '@/components/classes/PeakHours'
import { useMember } from '@/features/member/MemberProvider'
import type { PeakHourSlot } from '@/types/platform'

type Level = 'quiet' | 'moderate' | 'busy' | 'closed'

export function PeakHoursScreen() {
  const { supabase, org } = useMember()
  const [slots, setSlots] = useState<PeakHourSlot[]>([])
  const [level, setLevel] = useState<Level | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [peak, now] = await Promise.all([
        supabase.rpc('peak_hours', { p_org_id: org.id, p_weeks: 6 }),
        supabase.rpc('current_occupancy', { p_org_id: org.id }),
      ])
      if (cancelled) return
      setSlots((peak.data ?? []).map((r) => ({ weekday: r.weekday, hour: r.hour, avgCheckins: Number(r.avg_checkins) })))
      setLevel((now.data as { level?: Level } | null)?.level)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, org.id])

  const d = new Date()
  return (
    <PeakHours
      data={slots}
      openingHours={org.openingHours}
      currentEstimate={level}
      currentHour={d.getHours()}
      currentWeekday={((d.getDay() + 6) % 7) + 1}
      isLoading={loading}
    />
  )
}
