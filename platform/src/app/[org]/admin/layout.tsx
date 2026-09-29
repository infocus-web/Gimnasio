import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { Dumbbell, ExternalLink } from 'lucide-react'
import { getAdminContext, ROLE_LABELS } from '@/features/admin/context'
import { AdminNav, type NavItem } from '@/features/admin/AdminNav'
import { SignOutButton } from '@/features/member/SignOutButton'
import { getStaffContext } from '@/lib/member-context'
import { createClient } from '@/lib/supabase/server'

export default async function AdminLayout({ children, params }: LayoutProps<'/[org]/admin'>) {
  const { org: slug } = await params

  // Dueño y administradores: 2FA obligatorio (la base también lo exige: sin AAL2 no tienen permisos)
  const staffCtx = await getStaffContext(slug)
  if (staffCtx && (staffCtx.staff.role === 'owner' || staffCtx.staff.role === 'admin')) {
    const supabase = await createClient()
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.currentLevel !== 'aal2') {
      const path = (await headers()).get('x-pathname') ?? `/${slug}/admin`
      redirect(`/mfa?next=${encodeURIComponent(path)}` as Route)
    }
  }

  const ctx = await getAdminContext(slug)

  if (!ctx) {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="text-xl font-bold text-white">Acceso solo para el equipo del gimnasio</h1>
          <p className="text-sm text-zinc-400">Ingresá con una cuenta de recepción, profesor o administración.</p>
          <SignOutButton />
        </div>
      </main>
    )
  }

  const base = `/${slug}/admin`
  const items: NavItem[] = [
    { href: base, label: 'Inicio', icon: 'home' },
    ...(ctx.can('members.read') ? [{ href: `${base}/socios`, label: 'Socios', icon: 'users' } as const] : []),
    ...(ctx.can('checkins.manage') ? [{ href: `${base}/recepcion`, label: 'Recepción', icon: 'scan' } as const] : []),
    ...(ctx.can('staff.manage') ? [{ href: `${base}/equipo`, label: 'Equipo', icon: 'team' } as const] : []),
    ...(ctx.can('billing.read') ? [{ href: `${base}/pagos`, label: 'Pagos', icon: 'billing' } as const] : []),
    ...(ctx.can('schedule.manage') || ctx.can('bookings.manage') ? [{ href: `${base}/agenda`, label: 'Agenda', icon: 'calendar' } as const] : []),
    ...(ctx.staff.role === 'trainer' ? [{ href: `${base}/mis-clases`, label: 'Mis clases', icon: 'mine' } as const] : []),
    ...(ctx.staff.role === 'trainer' || ctx.can('training.manage_all')
      ? ([
          { href: `${base}/alumnos`, label: ctx.staff.role === 'trainer' ? 'Mis alumnos' : 'Alumnos', icon: 'list' },
          { href: `${base}/rutinas`, label: 'Rutinas', icon: 'dumbbell' },
        ] as const)
      : []),
    ...(ctx.can('reports.read') ? [{ href: `${base}/reportes`, label: 'Reportes', icon: 'chart' } as const] : []),
    ...(ctx.can('org.manage') ? [{ href: `${base}/web`, label: 'Web', icon: 'web' } as const] : []),
  ]

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="hidden border-r border-zinc-900 bg-black/60 lg:flex lg:min-h-dvh lg:flex-col lg:gap-6 lg:p-4">
        <Link href={base as Route} className="flex items-center gap-2 px-2 pt-1">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-[#edcc36]/40 bg-[#edcc36]/10">
            <Dumbbell className="h-5 w-5 text-[#edcc36]" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-extrabold text-white">{ctx.org.name}</span>
            <span className="block text-xs text-zinc-500">Panel de gestión</span>
          </span>
        </Link>
        <AdminNav items={items} variant="side" />
        <div className="mt-auto space-y-3 border-t border-zinc-900 pt-4">
          <Link
            href={`/${slug}` as Route}
            target="_blank"
            className="flex items-center gap-2 px-2 text-xs text-zinc-400 hover:text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Ver la web pública
          </Link>
          <div className="px-2">
            <p className="truncate text-sm font-semibold text-white">{ctx.staff.display_name}</p>
            <p className="text-xs text-zinc-500">{ROLE_LABELS[ctx.staff.role] ?? ctx.staff.role}</p>
          </div>
          <SignOutButton compact />
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-zinc-900 bg-black/85 backdrop-blur-md lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="truncate text-sm font-extrabold text-white">{ctx.org.name}</span>
          <SignOutButton compact />
        </div>
        <AdminNav items={items} variant="bar" />
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  )
}
