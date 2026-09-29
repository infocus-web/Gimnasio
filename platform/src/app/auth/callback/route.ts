import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeInternalPath } from '@/lib/safe-path'

/** Vuelta del link mágico de Supabase (flujo PKCE): canjea el código por una sesión. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const nextParam = searchParams.get('next')
  const next = safeInternalPath(nextParam, '/evolution/app/pase')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(next, origin))
  }
  return NextResponse.redirect(new URL('/login?error=link', origin))
}
