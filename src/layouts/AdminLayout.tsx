import { Suspense, useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import {
  Activity,
  CalendarDays,
  CreditCard,
  Dumbbell,
  ExternalLink,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  ScanLine,
  Settings as SettingsIcon,
  Tags,
  Users,
  X,
} from 'lucide-react'
import { useAuth, useSettings } from '../lib/auth'
import { Button, Loading, cx } from '../components/ui'

const NAV = [
  { to: '/admin', label: 'Panel', icon: LayoutDashboard, end: true },
  { to: '/admin/recepcion', label: 'Recepción', icon: ScanLine },
  { to: '/admin/socios', label: 'Socios', icon: Users },
  { to: '/admin/pagos', label: 'Pagos', icon: CreditCard },
  { to: '/admin/planes', label: 'Planes', icon: Tags },
  { section: 'Entrenamiento' },
  { to: '/admin/ejercicios', label: 'Ejercicios y videos', icon: Dumbbell },
  { to: '/admin/rutinas', label: 'Rutinas', icon: ListChecks },
  { to: '/admin/actividades', label: 'Actividades', icon: CalendarDays },
  { section: 'Sistema' },
  { to: '/admin/configuracion', label: 'Configuración', icon: SettingsIcon },
] as const

export function AdminLayout() {
  const { session, profile, loading, isStaff, signOut } = useAuth()
  const { settings } = useSettings()
  const [open, setOpen] = useState(false)
  const location = useLocation()

  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (!profile) return <Loading />
  if (!isStaff) return <PendingAccess email={profile.email} onSignOut={signOut} />

  const sidebar = (
    <nav className="flex h-full flex-col bg-zinc-950 text-zinc-300">
      <div className="flex items-center gap-3 px-5 py-5">
        {settings?.logo_url ? (
          <img src={settings.logo_url} alt="" className="size-9 rounded-lg object-cover" />
        ) : (
          <div className="flex size-9 items-center justify-center rounded-lg bg-brand-400 text-zinc-950">
            <Activity className="size-5" />
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold uppercase leading-tight text-white">{settings?.gym_name ?? 'Gimnasio'}</p>
          <p className="text-xs text-zinc-500">Panel de gestión</p>
        </div>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {NAV.map((item, i) =>
          'section' in item ? (
            <p key={i} className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
              {item.section}
            </p>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : false}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                  isActive ? 'bg-brand-400 font-semibold text-zinc-950' : 'hover:bg-zinc-900 hover:text-white',
                )
              }
            >
              <item.icon className="size-4.5" />
              {item.label}
            </NavLink>
          ),
        )}
      </div>
      <div className="border-t border-zinc-900 p-3">
        <a href="/" target="_blank" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300">
          <ExternalLink className="size-3.5" /> Ver web pública
        </a>
        <div className="mt-1 flex items-center justify-between gap-2 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm text-white">{profile.full_name || profile.email}</p>
            <p className="text-xs capitalize text-zinc-500">{profile.role === 'admin' ? 'Administrador' : 'Staff'}</p>
          </div>
          <button onClick={signOut} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-900 hover:text-white" title="Cerrar sesión">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </nav>
  )

  return (
    <div className="flex min-h-screen">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <aside className="absolute inset-y-0 left-0 w-72" onClick={(e) => e.stopPropagation()}>
            <button className="absolute right-3 top-5 z-10 text-zinc-400" onClick={() => setOpen(false)} aria-label="Cerrar menú">
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="min-w-0 flex-1 lg:pl-64">
        <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-lg p-1.5 hover:bg-zinc-100" aria-label="Abrir menú">
            <Menu className="size-5" />
          </button>
          <span className="font-display text-lg font-bold uppercase">{settings?.gym_name ?? 'Gimnasio'}</span>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}

function PendingAccess({ email, onSignOut }: { email: string | null; onSignOut: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-6">
      <div className="max-w-md rounded-2xl bg-white p-8 text-center">
        <h1 className="font-display text-2xl font-bold uppercase">Cuenta pendiente</h1>
        <p className="mt-3 text-sm text-zinc-600">
          Tu usuario <b>{email}</b> ya está creado, pero un administrador tiene que habilitarlo desde
          <i> Configuración → Usuarios</i> para que puedas entrar al panel.
        </p>
        <Button variant="secondary" className="mt-6" onClick={onSignOut}>
          Cerrar sesión
        </Button>
      </div>
    </div>
  )
}
