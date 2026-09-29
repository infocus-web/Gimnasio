'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Route } from 'next'
import { QrCode, CalendarDays, Dumbbell, TrendingUp, Clock } from 'lucide-react'

const TABS = [
  { href: 'pase', label: 'Pase', Icon: QrCode },
  { href: 'clases', label: 'Clases', Icon: CalendarDays },
  { href: 'entrenar', label: 'Entrenar', Icon: Dumbbell },
  { href: 'progreso', label: 'Progreso', Icon: TrendingUp },
  { href: 'horarios', label: 'Horarios', Icon: Clock },
] as const

/** Barra inferior fija, pensada para el pulgar (mobile-first). */
export function MemberNav({ orgSlug }: { orgSlug: string }) {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-black/90 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {TABS.map(({ href, label, Icon }) => {
          const url = `/${orgSlug}/app/${href}`
          const active = pathname?.startsWith(url)
          return (
            <li key={href}>
              <Link
                href={url as Route}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36] ${
                  active ? 'text-[#edcc36]' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
