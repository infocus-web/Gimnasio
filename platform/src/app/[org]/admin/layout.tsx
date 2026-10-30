import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { ExternalLink, KeyRound, Search, CalendarDays, ScanLine, UserPlus } from 'lucide-react'
import { Wordmark } from '@/components/Wordmark'
import { getAdminContext, ROLE_LABELS } from '@/features/admin/context'
import { AdminNav, type NavItem } from '@/features/admin/AdminNav'
import { SignOutButton } from '@/features/member/SignOutButton'
import { getStaffContext } from '@/lib/member-context'
import { createClient } from '@/lib/supabase/server'

export default async function AdminLayout({ children, params }: LayoutProps<'/[org]/admin'>) {
  const { org: slug } = await params

  const staffCtx = await getStaffContext(slug)

  // Dueño y administradores: 2FA obligatorio (la base también lo exige: sin AAL2 no tienen permisos)
  if (staffCtx && (staffCtx.staff.role === 'owner' || staffCtx.staff.role === 'admin')) {
    const supabase = await createClient()
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.currentLevel !== 'aal2') {
      const path = (await headers()).get('x-pathname') ?? `/${slug}/admin`
      redirect(`/mfa?next=${encodeURIComponent(path)}` as Route)
    }
  }

  // Contraseña temporal (va después del 2FA: con 2FA activo, Supabase pide AAL2 para cambiarla)
  // (cuenta creada o reseteada por el admin): la tiene que cambiar antes de seguir
  if (staffCtx) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user?.user_metadata?.must_change_password === true) {
      const path = (await headers()).get('x-pathname') ?? `/${slug}/admin`
      redirect(`/equipo/clave?next=${encodeURIComponent(path)}` as Route)
    }
  }

  const ctx = await getAdminContext(slug)

  if (!ctx) {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="text-xl font-bold text-white">Acceso solo para el equipo del gimnasio</h1>
          <p className="text-sm text-zinc-400">Ingresá con una cuenta de recepción, profesor o administración.</p>
          <SignOutButton to="/equipo" />
        </div>
      </main>
    )
  }

  const base = `/${slug}/admin`
  let pendingRequests = 0
  if (ctx.can('staff.manage')) {
    const supabase = await createClient()
    const { count } = await supabase
      .from('staff_requests')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', ctx.org.id)
      .eq('status', 'pending')
    pendingRequests = count ?? 0
  }
  const items: NavItem[] = [
    { href: base, label: 'Inicio', icon: 'home' },
    ...(ctx.can('members.read') ? [{ href: `${base}/socios`, label: 'Socios', icon: 'users' } as const] : []),
    ...(ctx.can('checkins.manage') ? [{ href: `${base}/recepcion`, label: 'Recepción', icon: 'scan' } as const] : []),
    ...(ctx.can('staff.manage') ? [{ href: `${base}/equipo`, label: pendingRequests ? `Equipo (${pendingRequests})` : 'Equipo', icon: 'team' } as const] : []),
    ...(ctx.can('billing.read') ? [{ href: `${base}/pagos`, label: 'Pagos', icon: 'billing' } as const] : []),
    ...(ctx.can('schedule.manage') || ctx.can('bookings.manage') ? [{ href: `${base}/agenda`, label: 'Agenda', icon: 'calendar' } as const] : []),
    ...(ctx.staff.role === 'trainer' ? [{ href: `${base}/mis-clases`, label: 'Mis clases', icon: 'mine' } as const] : []),
    ...(ctx.staff.role === 'trainer' || ctx.can('training.manage_all')
      ? ([
          { href: `${base}/alumnos`, label: ctx.staff.role === 'trainer' ? 'Mis alumnos' : 'Alumnos', icon: 'list' },
          { href: `${base}/rutinas`, label: 'Rutinas', icon: 'dumbbell' },
        ] as const)
      : []),
    ...(ctx.can('reports.read') ? [{ href: `${base}/negocio`, label: 'Negocio', icon: 'business' } as const] : []),
    ...(ctx.can('reports.read') ? [{ href: `${base}/reportes`, label: 'Reportes', icon: 'chart' } as const] : []),
    ...(ctx.can('members.write') ? [{ href: `${base}/comunicacion`, label: 'Comunicación', icon: 'message' } as const] : []),
    ...(ctx.can('checkins.manage') ? [{ href: `${base}/pases`, label: 'Pases e invitados', icon: 'ticket' } as const] : []),
    ...(ctx.staff.role === 'trainer' || ctx.can('training.manage_all') ? [{ href: `${base}/maquinas`, label: 'Máquinas', icon: 'qr' } as const] : []),
    ...(ctx.can('org.manage') ? [{ href: `${base}/accesos`, label: 'Accesos', icon: 'door' } as const] : []),
    ...(ctx.can('org.manage') ? [{ href: `${base}/web`, label: 'Web', icon: 'web' } as const] : []),
  ]

  const initials = ctx.staff.display_name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
  const roleLabel = ROLE_LABELS[ctx.staff.role] ?? ctx.staff.role
  const iconBtn =
    'grid h-11 w-11 place-items-center rounded-full text-zinc-300 transition-colors hover:bg-[#3a3a3a] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'

  return (
    <div className="w3-shell min-h-dvh lg:grid lg:grid-cols-[288px_1fr]">
      {/* Barra lateral (compu) */}
      <aside className="hidden bg-black lg:sticky lg:top-0 lg:flex lg:max-h-dvh lg:min-h-dvh lg:flex-col lg:overflow-y-auto">
        <Link href={base as Route} className="flex min-h-[88px] items-center border-b border-[#2c2c2c] px-5">
          <Wordmark name={ctx.org.name} sub="Panel de gestión" />
        </Link>
        <div className="flex-1 px-4 py-6">
          <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Menú</p>
          <AdminNav items={items} variant="side" />
        </div>
        <div className="space-y-3 border-t border-[#2c2c2c] px-5 py-5">
          <Link
            href={`/${slug}` as Route}
            target="_blank"
            className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Ver la web pública
          </Link>
          <Link
            href={`/equipo/clave?next=${encodeURIComponent(base)}` as Route}
            className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white"
          >
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" /> Cambiar mi contraseña
          </Link>
          <SignOutButton compact to="/equipo" />
        </div>
      </aside>

      {/* Encabezado (celular) */}
      <header className="sticky top-0 z-30 border-b border-[#2c2c2c] bg-black/90 backdrop-blur-md lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Link href={base as Route} className="min-w-0">
            <Wordmark name={ctx.org.name} size="sm" />
          </Link>
          {/* Menú de la cuenta en el celular (en la compu está en la barra lateral) */}
          <details className="relative">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 rounded-full bg-[#2c2c2c] py-1 pl-1 pr-3 text-xs text-zinc-300 [&::-webkit-details-marker]:hidden">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand text-xs font-bold text-black" aria-hidden="true">
                {initials}
              </span>
              <span className="max-w-[8rem] truncate font-semibold text-white">{ctx.staff.display_name}</span>
              <span className="text-zinc-500">▾</span>
            </summary>
            <div className="absolute right-0 top-full z-40 mt-2 w-60 space-y-1 rounded-2xl border border-[#444] bg-[#2c2c2c] p-2 shadow-xl">
              <p className="px-2 pb-1 pt-1 text-xs text-zinc-400">{roleLabel}</p>
              <Link
                href={`/${slug}` as Route}
                target="_blank"
                className="flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-sm text-zinc-200 hover:bg-[#3a3a3a]"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" /> Ver la web pública
              </Link>
              <Link
                href={`/equipo/clave?next=${encodeURIComponent(base)}` as Route}
                className="flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-sm text-zinc-200 hover:bg-[#3a3a3a]"
              >
                <KeyRound className="h-4 w-4" aria-hidden="true" /> Cambiar mi contraseña
              </Link>
              <div className="border-t border-[#444] pt-2">
                <SignOutButton compact to="/equipo" />
              </div>
            </div>
          </details>
        </div>
        <AdminNav items={items} variant="bar" />
      </header>

      {/* Panel de contenido: tarjeta gris redondeada sobre el fondo negro (compu) */}
      <div className="w3-panel min-w-0 lg:my-3 lg:mr-3 lg:flex lg:min-h-[calc(100dvh-1.5rem)] lg:flex-col lg:overflow-hidden lg:rounded-3xl lg:border lg:border-[#2c2c2c]">
        <div className="w3-header sticky top-0 z-20 hidden min-h-[88px] items-center gap-4 border-b border-[#3a3a3a] px-8 lg:flex">
          {ctx.can('members.read') ? (
            <form action={`${base}/socios`} method="get" role="search" className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
              <input
                type="search"
                name="q"
                placeholder="Buscar socio…"
                aria-label="Buscar socio"
                className="min-h-[44px] w-full rounded-xl border border-transparent bg-black pl-11 pr-4 text-sm text-white placeholder:text-zinc-500 focus-visible:border-brand focus-visible:outline-none"
              />
            </form>
          ) : (
            <span />
          )}
          <div className="ml-auto flex items-center gap-2">
            {(ctx.can('schedule.manage') || ctx.can('bookings.manage')) && (
              <Link href={`${base}/agenda` as Route} className={iconBtn} aria-label="Agenda" title="Agenda">
                <CalendarDays className="h-5 w-5" aria-hidden="true" />
              </Link>
            )}
            {ctx.can('checkins.manage') && (
              <Link href={`${base}/recepcion` as Route} className={iconBtn} aria-label="Recepción" title="Recepción">
                <ScanLine className="h-5 w-5" aria-hidden="true" />
              </Link>
            )}
            {ctx.can('members.write') && (
              <Link
                href={`${base}/socios/nuevo` as Route}
                className="btn-tac ml-2 inline-flex min-h-[46px] items-center gap-2 bg-brand px-5 text-sm text-black"
              >
                <UserPlus className="h-4 w-4" aria-hidden="true" /> Nuevo socio
              </Link>
            )}
            <div className="ml-4 flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#444] text-sm font-bold text-white" aria-hidden="true">
                {initials}
              </span>
              <div className="leading-tight">
                <p className="max-w-[12rem] truncate text-[15px] font-bold text-white">{ctx.staff.display_name}</p>
                <p className="text-xs text-zinc-400">{roleLabel}</p>
              </div>
            </div>
          </div>
        </div>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  )
}
