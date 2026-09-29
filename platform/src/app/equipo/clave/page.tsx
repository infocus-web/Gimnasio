import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { createClient } from '@/lib/supabase/server'
import { ChangePasswordForm } from './ChangePasswordForm'

export const metadata: Metadata = { title: 'Cambiar contraseña', robots: { index: false, follow: false } }

function safeNext(value: string | undefined) {
  return value && /^\/[a-z0-9-]+\/admin(\/|$|\?)/.test(value) ? value : '/evolution/admin'
}

export default async function ChangePasswordPage({ searchParams }: PageProps<'/equipo/clave'>) {
  const sp = await searchParams
  const next = safeNext(typeof sp.next === 'string' ? sp.next : undefined)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/equipo?next=${encodeURIComponent(next)}` as Route)
  const forced = user.user_metadata?.must_change_password === true
  return <ChangePasswordForm next={next} forced={forced} email={user.email ?? ''} />
}
