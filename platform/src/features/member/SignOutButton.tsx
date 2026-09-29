'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter()
  const signOut = async () => {
    await createClient().auth.signOut()
    router.replace('/login')
    router.refresh()
  }
  return (
    <button
      type="button"
      onClick={signOut}
      aria-label="Cerrar sesión"
      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-xl border border-zinc-800 px-3 text-sm text-zinc-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      {!compact && 'Cerrar sesión'}
    </button>
  )
}
