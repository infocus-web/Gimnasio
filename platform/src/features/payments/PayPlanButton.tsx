'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { CreditCard } from 'lucide-react'
import { useMember } from '@/features/member/MemberProvider'
import { onlinePaymentsEnabled } from './actions'

/**
 * Opciones de pago de la app del socio:
 *  1. Principal: pagar online con Mercado Pago (solo si el gimnasio lo conectó).
 *  2. Alternativa: pagar en recepción (efectivo, transferencia o tarjeta).
 * Sin Mercado Pago conectado queda solo la opción de recepción.
 */
export function PayPlanButton({ label = 'Pagar con Mercado Pago', reception = true }: { label?: string; reception?: boolean }) {
  const { org } = useMember()
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    let alive = true
    onlinePaymentsEnabled()
      .then((v) => alive && setEnabled(v))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  // Si el socio no es el titular del grupo, la pantalla de pago se lo explica
  const receptionText = enabled
    ? '¿No podés o preferís no pagar online? Acercate a recepción: efectivo, transferencia o tarjeta.'
    : 'Pagalo en recepción: efectivo, transferencia o tarjeta.'
  if (!enabled) return reception ? <p className="mt-2 text-xs text-zinc-400 leading-snug">{receptionText}</p> : null
  return (
    <div className="mt-2 space-y-2">
    <Link
      href={`/${org.slug}/app/pagar` as Route}
      className="btn-tac inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#edcc36] px-4 text-sm font-bold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      <CreditCard className="h-4 w-4" aria-hidden="true" /> {label}
    </Link>
    {reception && <p className="text-xs text-zinc-400 leading-snug">{receptionText}</p>}
    </div>
  )
}
