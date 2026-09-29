'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Route } from 'next'
import { Home, Users, UserCog, ScanLine, CreditCard, CalendarDays, Globe, BarChart3, Dumbbell, ClipboardList, CalendarCheck, DoorOpen } from 'lucide-react'

const ICONS = { home: Home, users: Users, team: UserCog, scan: ScanLine, billing: CreditCard, calendar: CalendarDays, web: Globe, chart: BarChart3, dumbbell: Dumbbell, list: ClipboardList, mine: CalendarCheck, door: DoorOpen }

export interface NavItem {
  href: string
  label: string
  icon: keyof typeof ICONS
  soon?: boolean
}

export function AdminNav({ items, variant }: { items: NavItem[]; variant: 'side' | 'bar' }) {
  const pathname = usePathname()
  const isActive = (href: string) => {
    const depth = href.split('/').filter(Boolean).length
    return depth <= 2 ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
  }

  if (variant === 'bar') {
    return (
      <nav aria-label="Panel" className="flex gap-1 overflow-x-auto px-3 pb-2">
        {items
          .filter((i) => !i.soon)
          .map((item) => {
            const Icon = ICONS[item.icon]
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href as Route}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium ${
                  active ? 'bg-[#edcc36] text-black' : 'text-zinc-300 hover:bg-zinc-900'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            )
          })}
      </nav>
    )
  }

  return (
    <nav aria-label="Panel" className="space-y-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon]
        if (item.soon) {
          return (
            <span key={item.href} className="flex min-h-[42px] items-center gap-3 rounded-xl px-3 text-sm text-zinc-600">
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
              <span className="ml-auto rounded-md border border-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                Pronto
              </span>
            </span>
          )
        }
        const active = isActive(item.href)
        return (
          <Link
            key={item.href}
            href={item.href as Route}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-[42px] items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36] ${
              active ? 'bg-[#edcc36]/10 text-[#edcc36]' : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
