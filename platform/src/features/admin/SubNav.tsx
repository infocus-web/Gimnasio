'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Route } from 'next'

export function SubNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname()
  const exact = items.map((i) => i.href).sort((a, b) => b.length - a.length)
  const active = exact.find((h) => pathname === h || pathname.startsWith(`${h}/`))
  return (
    <nav aria-label="Secciones" className="flex gap-1.5 overflow-x-auto pb-1">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href as Route}
          aria-current={active === i.href ? 'page' : undefined}
          className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            active === i.href ? 'bg-brand text-black' : 'bg-[#333] text-zinc-300 hover:bg-[#3a3a3a] hover:text-white'
          }`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  )
}
