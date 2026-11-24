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
export function PayPlanButton({
  label = 'Pagar con Mercado Pago',
  reception = true,
  neon = false,
}: {
  label?: string
  reception?: boolean
  /** Estilo cartel de neón (resplandor amarillo que late) para que el socio no lo pase por alto */
  neon?: boolean
}) {
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
  if (neon) {
    return (
      <div className="mt-3 space-y-2">
        <Link
          href={`/${org.slug}/app/pagar` as Route}
          className="group relative inline-flex w-full items-center justify-center focus-visible:outline-none"
        >
          {/* Resplandor que late detrás del botón */}
          <span aria-hidden="true" className="absolute -inset-1.5 rounded-2xl bg-[#edcc36] opacity-70 blur-lg animate-pulse" />
          <span className="relative inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border-2 border-[#fff3a8] bg-[#edcc36] px-4 text-base font-black uppercase tracking-wide text-black shadow-[0_0_8px_#edcc36,0_0_24px_#edcc36,inset_0_0_8px_rgba(255,255,255,0.6)] transition-transform group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-white">
            <CreditCard className="h-5 w-5" aria-hidden="true" /> {label}
          </span>
        </Link>
        {reception && <p className="text-xs text-zinc-400 leading-snug">{receptionText}</p>}
      </div>
    )
  }
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
