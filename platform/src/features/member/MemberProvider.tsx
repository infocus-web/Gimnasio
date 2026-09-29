'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { FamilyMember } from '@/types/platform'

interface MemberState {
  org: { id: string; slug: string; name: string; locationId: string | null; openingHours: { weekday: number; open: string; close: string }[] }
  meId: string
  family: FamilyMember[]
  /** Socio "activo" en la app: yo o un familiar a cargo (pase, reservas, entrenamiento). */
  activeMemberId: string
  setActiveMemberId: (id: string) => void
  supabase: ReturnType<typeof createClient>
}

const Ctx = createContext<MemberState | null>(null)

export function MemberProvider({
  org,
  meId,
  family,
  children,
}: Omit<MemberState, 'activeMemberId' | 'setActiveMemberId' | 'supabase'> & { children: ReactNode }) {
  const [activeMemberId, setActiveMemberId] = useState(meId)
  const supabase = useMemo(() => createClient(), [])
  const value = useMemo(
    () => ({ org, meId, family, activeMemberId, setActiveMemberId, supabase }),
    [org, meId, family, activeMemberId, supabase],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useMember() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useMember fuera de MemberProvider')
  return ctx
}
