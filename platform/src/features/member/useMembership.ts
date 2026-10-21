'use client'

import { useCallback, useEffect, useState } from 'react'
import type { MembershipStatus, MembershipSummary } from '@/types/platform'
import { NO_MEMBERSHIP } from '@/components/membership/status'
import { useMember } from './MemberProvider'

export { NO_MEMBERSHIP }

const PRIORITY: Record<MembershipStatus, number> = {
  active: 0, trialing: 1, past_due: 2, paused: 3, expired: 4, canceled: 5,
}

/** Membresía vigente (o la más relevante) del socio activo. */
export function useMembership() {
  const { supabase, activeMemberId } = useMember()
  const [membership, setMembership] = useState<MembershipSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const { data, error } = await supabase
        .from('membership_members')
        .select('memberships(status, current_period_end, credits_remaining, membership_plans(name))')
        .eq('member_id', activeMemberId)
      if (error) throw error
      const rows = (data ?? [])
        .map((r) => r.memberships)
        .filter((m): m is NonNullable<typeof m> => !!m)
        .sort((a, b) => PRIORITY[a.status] - PRIORITY[b.status] || b.current_period_end.localeCompare(a.current_period_end))
      const best = rows[0]
      setMembership(
        best
          ? {
              planName: best.membership_plans?.name ?? 'Plan',
              // El estado guardado se actualiza de noche: si ya pasó la fecha, se muestra vencida igual
              status:
                (best.status === 'active' || best.status === 'trialing') && new Date(best.current_period_end).getTime() < Date.now()
                  ? 'expired'
                  : best.status,
              currentPeriodEnd: best.current_period_end,
              creditsRemaining: best.credits_remaining,
            }
          : NO_MEMBERSHIP,
      )
    } catch {
      setError('No pudimos cargar tu membresía. Revisá tu conexión.')
    }
  }, [supabase, activeMemberId])

  useEffect(() => {
    setMembership(null)
    void load()
  }, [load])

  return { membership, error, reload: load }
}
