import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { createClient } from '@/lib/supabase/server'
import { safeInternalPath } from '@/lib/safe-path'
import { MfaScreen } from './MfaScreen'

export const metadata: Metadata = { title: 'Verificación en dos pasos' }

function safeNext(value: string | undefined) {
  return safeInternalPath(value, '/evolution/admin')
}

export default async function MfaPage({ searchParams }: PageProps<'/mfa'>) {
  const sp = await searchParams
  const next = safeNext(typeof sp.next === 'string' ? sp.next : undefined)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/equipo?next=${encodeURIComponent(next)}` as Route)

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.currentLevel === 'aal2') redirect(next as Route)

  const { data: factors } = await supabase.auth.mfa.listFactors()
  const verified = (factors?.totp ?? []).find((f) => f.status === 'verified')

  return <MfaScreen next={next} mode={verified ? 'verify' : 'enroll'} factorId={verified?.id ?? null} email={user.email ?? ''} />
}
