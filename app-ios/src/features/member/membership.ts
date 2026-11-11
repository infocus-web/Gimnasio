import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type MembershipStatus = 'active' | 'trialing' | 'past_due' | 'paused' | 'expired' | 'canceled'

export interface Membership {
  planName: string
  status: MembershipStatus | 'none'
  currentPeriodEnd: string | null
  creditsRemaining: number | null
}

export const NO_MEMBERSHIP: Membership = { planName: '', status: 'none', currentPeriodEnd: null, creditsRemaining: null }

const PRIORITY: Record<MembershipStatus, number> = { active: 0, trialing: 1, past_due: 2, paused: 3, expired: 4, canceled: 5 }

export interface PassStatus {
  kind: 'valid' | 'blocked' | 'none'
  label: string
  message: string
}

/** Mismos textos que la web (components/membership/status.ts). */
export function getPassStatus(m: Membership | null): PassStatus {
  if (!m || m.status === 'none') {
    return { kind: 'none', label: 'SIN PLAN', message: 'No tenés un plan activo. Acercate a recepción para inscribirte.' }
  }
  switch (m.status) {
    case 'active':
      return { kind: 'valid', label: 'AL DÍA', message: '' }
    case 'trialing':
      return { kind: 'valid', label: 'PRUEBA', message: '' }
    case 'past_due':
      return { kind: 'blocked', label: 'PAGO PENDIENTE', message: 'Tenés una cuota pendiente. Regularizala en recepción para volver a ingresar y reservar clases.' }
    case 'paused':
      return { kind: 'blocked', label: 'PAUSADO', message: 'Tu plan está pausado. Consultá en recepción para reactivarlo.' }
    default:
      return { kind: 'blocked', label: 'VENCIDO', message: 'Tu plan venció. Renovalo en recepción para volver a ingresar.' }
  }
}

export const formatDate = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
    : ''

/** Membresía vigente (o la más relevante) del socio elegido. Misma lógica que useMembership() de la web. */
export function useMembership(memberId: string | null) {
  const [membership, setMembership] = useState<Membership | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!memberId) return
    setError(null)
    try {
      const { data, error } = await supabase
        .from('membership_members')
        .select('memberships(status, current_period_end, credits_remaining, membership_plans(name))')
        .eq('member_id', memberId)
      if (error) throw error
      type Row = {
        status: MembershipStatus
        current_period_end: string
        credits_remaining: number | null
        membership_plans: { name: string } | null
      }
      const rows = (data ?? [])
        .map((r) => (r as unknown as { memberships: Row | null }).memberships)
        .filter((m): m is Row => !!m)
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
      setError('No pudimos cargar tu plan. Revisá tu conexión.')
    }
  }, [memberId])

  useEffect(() => {
    setMembership(null)
    void load()
  }, [load])

  return { membership, error, reload: load }
}
