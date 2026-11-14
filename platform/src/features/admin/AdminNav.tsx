'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Route } from 'next'
import { Home, Users, CreditCard, CalendarDays, Dumbbell, MessageCircle, BarChart3, Settings } from 'lucide-react'
import { findActiveTab, type AdminSection, type SectionIcon } from './sections'

const ICONS: Record<SectionIcon, typeof Home> = {
  home: Home,
  users: Users,
  billing: CreditCard,
  calendar: CalendarDays,
  dumbbell: Dumbbell,
  message: MessageCircle,
  chart: BarChart3,
  settings: Settings,
}

/** Menú principal: un botón por sección. Lleva a la primera pantalla de la sección. */
export function AdminNav({ sections, base, variant }: { sections: AdminSection[]; base: string; variant: 'side' | 'bar' }) {
  const pathname = usePathname()
  const activeId = findActiveTab(sections, pathname, base)?.section.id

  if (variant === 'bar') {
    return (
      <nav aria-label="Panel" className="flex gap-1.5 overflow-x-auto px-3 pb-3">
        {sections.map((s) => {
          const first = s.tabs[0]
          if (!first) return null
          const Icon = ICONS[s.icon]
          const active = s.id === activeId
          return (
            <Link
              key={s.id}
              href={first.href as Route}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors ${
                active ? 'bg-brand font-semibold text-black' : 'bg-[#2c2c2c] text-zinc-300 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {s.label}
            </Link>
          )
        })}
      </nav>
    )
  }

  // Barra lateral estilo W3Admin: cada sección es un círculo con el ícono + el nombre al lado
  return (
    <nav aria-label="Panel" className="space-y-1.5">
      {sections.map((s) => {
        const first = s.tabs[0]
        if (!first) return null
        const Icon = ICONS[s.icon]
        const active = s.id === activeId
        return (
          <Link
            key={s.id}
            href={first.href as Route}
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
            <span className="truncate">{s.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

/** Pestañas de la sección actual, arriba del contenido. Con una sola pantalla no se muestran. */
export function SectionTabs({ sections, base }: { sections: AdminSection[]; base: string }) {
  const pathname = usePathname()
  const active = findActiveTab(sections, pathname, base)
  if (!active || active.section.tabs.length < 2) return null
  const { section, tab } = active
  return (
    <div className="mb-5 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{section.label}</p>
      <nav aria-label={section.label} className="flex gap-1.5 overflow-x-auto pb-1">
        {section.tabs.map((t) => {
          const current = tab?.href === t.href
          return (
            <Link
              key={t.href}
              href={t.href as Route}
              aria-current={current ? 'page' : undefined}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                current ? 'bg-brand text-black' : 'bg-[#333] text-zinc-300 hover:bg-[#3a3a3a] hover:text-white'
              }`}
            >
              {t.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
