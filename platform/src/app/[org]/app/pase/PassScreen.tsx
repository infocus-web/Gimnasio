'use client'

import { useCallback, useEffect, useState } from 'react'
import { MemberQrPass } from '@/components/pass/MemberQrPass'
import { MembershipBanner } from '@/components/membership/MembershipBanner'
import { useMember } from '@/features/member/MemberProvider'
import { useMembership, NO_MEMBERSHIP } from '@/features/member/useMembership'
import type { CheckinToken } from '@/types/platform'
import { AccessStatusCard } from './AccessStatusCard'

/**
 * QR de acceso: apagado mientras se entra solo con los lectores ZKTeco (cara/palma/huella).
 * Para volver a mostrarlo (por ejemplo, si un día hay recepción escaneando), cambiar a true.
 */
const SHOW_QR = false

export function PassScreen() {
  const { supabase, family, activeMemberId, setActiveMemberId } = useMember()
  const { membership } = useMembership()
  const [token, setToken] = useState<CheckinToken | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payNotice, setPayNotice] = useState(false)

  const refresh = useCallback(async () => {
    setError(null)
    const { data, error } = await supabase.rpc('get_checkin_token', { p_member_id: activeMemberId })
    setLoading(false)
    if (error || !data) {
      setToken(null)
      setError('No pudimos generar tu código. Revisá tu conexión.')
      return
    }
    const d = data as { token: string; expires_at: string; refresh_in_seconds: number }
    setToken({ token: d.token, expiresAt: d.expires_at, refreshInSeconds: d.refresh_in_seconds })
  }, [supabase, activeMemberId])

  useEffect(() => {
    if (!SHOW_QR) return
    setLoading(true)
    setToken(null)
    void refresh()
  }, [refresh])

  const onPay = () => setPayNotice(true)

  const payInfo = payNotice && (
    <p role="status" className="rounded-2xl border border-[#edcc36]/30 bg-[#edcc36]/10 p-4 text-sm text-zinc-200">
      El pago online con Mercado Pago se habilita en la próxima etapa. Por ahora podés abonar en el gimnasio
      (efectivo, transferencia o tarjeta).
    </p>
  )

  if (!SHOW_QR) {
    return (
      <div className="space-y-4">
        <AccessStatusCard
          membership={membership}
          member={family.find((m) => m.id === activeMemberId) ?? family[0]}
          family={family}
          activeMemberId={activeMemberId}
          onSelectMember={setActiveMemberId}
          onPay={onPay}
          loading={!membership}
        />
        {payInfo}
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
        onRefresh={refresh}
        onPay={onPay}
        isLoading={loading || !membership}
        error={error}
      />
      {membership && <MembershipBanner membership={membership} onPay={onPay} />}
      {payInfo}
    </div>
  )
}
