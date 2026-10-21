'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { CreditCard } from 'lucide-react'
import { useMember } from '@/features/member/MemberProvider'
import { onlinePaymentsEnabled } from './actions'

/** Botón "Pagar mi plan" de la app del socio. Solo aparece si el gimnasio conectó Mercado Pago. */
export function PayPlanButton({ label = 'Pagar mi plan' }: { label?: string }) {
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
  if (!enabled) return null
  return (
    <Link
      href={`/${org.slug}/app/pagar` as Route}
      className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#edcc36] px-4 text-sm font-bold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      <CreditCard className="h-4 w-4" aria-hidden="true" /> {label}
    </Link>
  )
}
