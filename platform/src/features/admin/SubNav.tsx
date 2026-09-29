'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Route } from 'next'

export function SubNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname()
  const exact = items.map((i) => i.href).sort((a, b) => b.length - a.length)
  const active = exact.find((h) => pathname === h || pathname.startsWith(`${h}/`))
  return (
    <nav aria-label="Secciones" className="flex gap-1 overflow-x-auto border-b border-zinc-900">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href as Route}
          aria-current={active === i.href ? 'page' : undefined}
          className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold ${
            active === i.href ? 'border-[#edcc36] text-white' : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  )
}
