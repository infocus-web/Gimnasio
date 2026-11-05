import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { createClient } from '@/lib/supabase/server'
import { safeInternalPath } from '@/lib/safe-path'
import { MemberPasswordForm } from './MemberPasswordForm'

export const metadata: Metadata = { title: 'Elegir contraseña', robots: { index: false, follow: false } }

/** Destino del email "Elegir contraseña nueva" y de la invitación del gimnasio. */
export default async function MemberPasswordPage({ searchParams }: PageProps<'/cuenta/clave'>) {
  const sp = await searchParams
  const next = safeInternalPath(typeof sp.next === 'string' ? sp.next : null, '/evolution/app/pase')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?error=link&next=${encodeURIComponent(next)}` as Route)
  return <MemberPasswordForm next={next} email={user.email ?? ''} />
}
