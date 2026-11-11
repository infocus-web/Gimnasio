import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { ORG_SLUG } from '@/lib/config'

export interface FamilyMember {
  id: string
  firstName: string
  lastName: string
  isMe: boolean
}

export interface Org {
  id: string
  name: string
}

/**
 * ready: sesión leída del Llavero · member: ficha del socio en el gimnasio.
 * memberState 'none' = tiene cuenta pero todavía no es socio (no se inscribió o lo dieron de baja).
 */
type MemberState = 'idle' | 'loading' | 'ok' | 'none' | 'error'

interface AuthState {
  ready: boolean
  session: Session | null
  memberState: MemberState
  org: Org | null
  meId: string | null
  family: FamilyMember[]
  activeMemberId: string | null
  setActiveMemberId: (id: string) => void
  reloadMember: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [memberState, setMemberState] = useState<MemberState>('idle')
  const [org, setOrg] = useState<Org | null>(null)
  const [meId, setMeId] = useState<string | null>(null)
  const [family, setFamily] = useState<FamilyMember[]>([])
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setReady(true))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? null

  /** Igual que getMemberContext() de la web: ficha propia + grupo familiar si es el pagador. */
  const reloadMember = useCallback(async () => {
    if (!userId) return
    setMemberState('loading')
    try {
      const { data: o, error: oErr } = await supabase.from('organizations').select('id, name').eq('slug', ORG_SLUG).maybeSingle()
      if (oErr) throw oErr
      if (!o) {
        // RLS: el gimnasio solo lo ve quien es socio o personal
        setMemberState('none')
        return
      }
      const { data: me, error: meErr } = await supabase
        .from('members')
        .select('id, first_name, last_name, billing_account_id')
        .eq('org_id', o.id)
        .eq('user_id', userId)
        .neq('status', 'archived')
        .maybeSingle()
      if (meErr) throw meErr
      if (!me) {
        setOrg(o)
        setMemberState('none')
        return
      }
      const fam: FamilyMember[] = [{ id: me.id, firstName: me.first_name, lastName: me.last_name, isMe: true }]
      if (me.billing_account_id) {
        const { data: account } = await supabase
          .from('billing_accounts')
          .select('id')
          .eq('id', me.billing_account_id)
          .eq('payer_member_id', me.id)
          .maybeSingle()
        if (account) {
          const { data: deps } = await supabase
            .from('members')
            .select('id, first_name, last_name')
            .eq('billing_account_id', account.id)
            .neq('id', me.id)
            .neq('status', 'archived')
            .order('first_name')
          for (const d of deps ?? []) fam.push({ id: d.id, firstName: d.first_name, lastName: d.last_name, isMe: false })
        }
      }
      setOrg(o)
      setMeId(me.id)
      setFamily(fam)
      setActiveMemberId((prev) => (prev && fam.some((f) => f.id === prev) ? prev : me.id))
      setMemberState('ok')
    } catch {
      setMemberState('error')
    }
  }, [userId])

  useEffect(() => {
    if (userId) {
      void reloadMember()
    } else {
      setMemberState('idle')
      setOrg(null)
      setMeId(null)
      setFamily([])
      setActiveMemberId(null)
    }
  }, [userId, reloadMember])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      ready,
      session,
      memberState,
      org,
      meId,
      family,
      activeMemberId,
      setActiveMemberId,
      reloadMember,
      signOut,
    }),
    [ready, session, memberState, org, meId, family, activeMemberId, reloadMember, signOut],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth fuera de AuthProvider')
  return ctx
}
