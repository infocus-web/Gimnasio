'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MemberQrPass } from '@/components/pass/MemberQrPass'
import { MembershipBanner } from '@/components/membership/MembershipBanner'
import { useMember } from '@/features/member/MemberProvider'
import { useMembership, NO_MEMBERSHIP } from '@/features/member/useMembership'
import { getPassStatus } from '@/components/membership/status'
import type { CheckinToken } from '@/types/platform'

/** Reintentos silenciosos de una renovación fallida antes de mostrar el error (la tablet del molinete no debe parpadear). */
const SILENT_RETRIES = 2
const RETRY_DELAY_MS = 2000

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * QR de acceso: se muestra en la tablet del molinete de musculación (y en recepción).
 * Se renueva solo unos segundos antes de vencer, sin dejar de mostrar el código vigente.
 */
export function PassScreen() {
  const { supabase, org, family, activeMemberId, setActiveMemberId } = useMember()
  const { membership, error: membershipError, reload: reloadMembership } = useMembership()
  const [token, setToken] = useState<CheckinToken | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const requestSeq = useRef(0)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    const seq = ++requestSeq.current
    try {
      for (let attempt = 0; attempt <= SILENT_RETRIES; attempt++) {
        try {
          // Con wifi inestable un pedido puede quedar colgado: se corta a los 8 s y se reintenta
          const { data, error } = await supabase
            .rpc('get_checkin_token', { p_member_id: activeMemberId })
            .abortSignal(AbortSignal.timeout(8000))
          if (seq !== requestSeq.current) return // cambió el socio mientras respondía
          if (!error && data) {
            const d = data as { token: string; expires_at: string; refresh_in_seconds: number }
            setToken({ token: d.token, expiresAt: d.expires_at, refreshInSeconds: Number(d.refresh_in_seconds) || 30 })
            setError(null)
            return
          }
        } catch {
          /* error de red: se reintenta */
        }
        if (attempt < SILENT_RETRIES) await wait(RETRY_DELAY_MS)
      }
      if (seq === requestSeq.current) setError('Revisá tu conexión a internet y probá de nuevo.')
    } finally {
      if (seq === requestSeq.current) setLoading(false)
      inFlight.current = false
    }
  }, [supabase, activeMemberId])

  useEffect(() => {
    // Cambio de socio: se descarta el token anterior
    requestSeq.current++
    inFlight.current = false
    setLoading(true)
    setToken(null)
    setError(null)
    void refresh()
  }, [refresh])

  // Sin conexión: se sigue intentando solo cada 10 s (la tablet se recupera sin que nadie toque nada)
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!error) return
    const id = setInterval(() => {
      setTick((t) => t + 1) // re-evalúa si el código anterior sigue sirviendo
      void refresh()
    }, 10_000)
    return () => clearInterval(id)
  }, [error, refresh])

  // Si falla la renovación pero el código anterior todavía es válido (el servidor acepta el paso anterior),
  // se sigue mostrando el QR: el error a pantalla completa solo cuando ya no hay código que sirva.
  const tokenStillValid = !!token && Date.parse(token.expiresAt) + token.refreshInSeconds * 1000 > Date.now()
  const shownError = error && !tokenStillValid ? error : null

  const canEnter = getPassStatus(membership).kind === 'valid'

  if (membershipError && !membership) {
    return (
      <div role="alert" className="space-y-3 rounded-3xl border border-red-500/40 bg-zinc-950 p-6 text-center">
        <p className="text-sm text-red-200">{membershipError}</p>
        <button
          type="button"
          onClick={() => void reloadMembership()}
          className="btn-tac btn-tac-ghost min-h-[44px] w-full rounded-xl border border-[#edcc36]/40 bg-zinc-900 px-4 text-sm font-semibold text-[#edcc36] hover:bg-[#edcc36] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <MemberQrPass
        token={token}
        membership={membership ?? NO_MEMBERSHIP}
        familyMembers={family.length > 1 ? family : undefined}
        member={family.find((m) => m.id === activeMemberId) ?? family[0]}
        selectedFamilyMemberId={activeMemberId}
        onSelectFamilyMember={setActiveMemberId}
        onRefresh={() => void refresh()}
        orgName={org.name}
        isLoading={!membership || (canEnter && loading && !token)}
        error={shownError}
      />
      {membership && <MembershipBanner membership={membership} />}
    </div>
  )
}
