'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Route } from 'next'
import { Home, Users, UserCog, ScanLine, CreditCard, CalendarDays, Globe, BarChart3, Dumbbell, ClipboardList, CalendarCheck, DoorOpen, MessageCircle, Ticket, TrendingUp, QrCode } from 'lucide-react'

const ICONS = { home: Home, users: Users, team: UserCog, scan: ScanLine, billing: CreditCard, calendar: CalendarDays, web: Globe, chart: BarChart3, dumbbell: Dumbbell, list: ClipboardList, mine: CalendarCheck, door: DoorOpen, message: MessageCircle, ticket: Ticket, business: TrendingUp, qr: QrCode }

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
      <nav aria-label="Panel" className="flex gap-1.5 overflow-x-auto px-3 pb-3">
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
                className={`flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors ${
                  active ? 'bg-brand font-semibold text-black' : 'bg-[#2c2c2c] text-zinc-300 hover:text-white'
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

  // Barra lateral estilo W3Admin: cada ítem es un círculo con el ícono + el nombre al lado
  return (
    <nav aria-label="Panel" className="space-y-1.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon]
        if (item.soon) {
          return (
            <span key={item.href} className="flex min-h-[48px] items-center gap-3 px-1 text-sm text-zinc-600">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#1a1a1a]">
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              {item.label}
              <span className="ml-auto rounded-full border border-zinc-800 px-2 py-0.5 text-[10px]">Pronto</span>
            </span>
          )
        }
        const active = isActive(item.href)
        return (
          <Link
            key={item.href}
            href={item.href as Route}
            aria-current={active ? 'page' : undefined}
            className={`group flex min-h-[48px] items-center gap-3 rounded-full px-1 text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              active ? 'font-semibold text-white' : 'font-medium text-zinc-300 hover:text-white'
            }`}
          >
            <span
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors ${
                active ? 'bg-brand text-black' : 'bg-[#2c2c2c] text-zinc-300 group-hover:bg-[#3a3a3a] group-hover:text-white'
              }`}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <span className="truncate">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
