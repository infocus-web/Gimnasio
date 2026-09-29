import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Next.js 16 "proxy" (ex middleware). Dos responsabilidades:
 *  1. Refrescar la sesión de Supabase en cada request (cookies).
 *  2. Resolver el gimnasio (tenant) por subdominio y reescribir la URL:
 *       evolution.midominio.com/admin  →  /evolution/admin
 *     En local / *.vercel.app se usa la ruta directa /evolution/...
 *
 * La autorización real NO vive acá: la hacen RLS y los layouts de cada panel.
 */
export async function proxy(request: NextRequest) {
  // Ruta actual para los layouts (ej. volver a la misma pantalla después del 2FA)
  request.headers.set('x-pathname', request.nextUrl.pathname + request.nextUrl.search)
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
        },
      },
    },
  )
  // No poner código entre createServerClient y getUser (recomendación de @supabase/ssr)
  await supabase.auth.getUser()

  const tenant = tenantFromHost(request.headers.get('host'))
  const { pathname } = request.nextUrl
  if (tenant && !pathname.startsWith('/api') && !pathname.startsWith(`/${tenant}`)) {
    const url = request.nextUrl.clone()
    url.pathname = `/${tenant}${pathname}`
    const rewrite = NextResponse.rewrite(url, { request })
    for (const cookie of response.cookies.getAll()) rewrite.cookies.set(cookie)
    return rewrite
  }
  return response
}

function tenantFromHost(host: string | null): string | null {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN
  if (!host || !root || host === root || !host.endsWith(`.${root}`)) return null
  const sub = host.slice(0, -(root.length + 1))
  return sub && sub !== 'www' && /^[a-z0-9-]+$/.test(sub) ? sub : null
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)'],
}
