import Link from 'next/link'
import type { Route } from 'next'
import type { LucideIcon } from 'lucide-react'
import { Plus } from 'lucide-react'

type Variant = 'dark' | 'solid' | 'onBrand'

const STYLES: Record<Variant, { box: string; corner: string; label: string; chip: string }> = {
  // Fondo oscuro, borde que se enciende en amarillo
  dark: {
    box: 'bg-[#141414]/90 border-white/15 hover:border-brand',
    corner: 'border-brand',
    label: 'text-white',
    chip: 'bg-brand text-black',
  },
  // Botón principal: amarillo de la marca
  solid: {
    box: 'bg-brand border-brand hover:bg-white hover:border-white',
    corner: 'border-black',
    label: 'text-black',
    chip: 'bg-black text-brand',
  },
  // Para usar arriba de un fondo amarillo (plan destacado)
  onBrand: {
    box: 'bg-black border-black hover:bg-[#1c1c1c]',
    corner: 'border-brand',
    label: 'text-white',
    chip: 'bg-brand text-black',
  },
}

interface Props {
  href: string
  children: React.ReactNode
  variant?: Variant
  icon?: LucideIcon
  size?: 'md' | 'sm'
  newTab?: boolean
  className?: string
}

/** Botón "táctico": esquineros tipo mira y cuadrito con ícono que avanza al pasar el mouse. */
export function TacticalButton({ href, children, variant = 'dark', icon: Icon = Plus, size = 'md', newTab, className = '' }: Props) {
  const s = STYLES[variant]
  const cls = [
    'group relative inline-flex items-center justify-between border transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-black',
    size === 'md' ? 'min-h-[54px] gap-6 px-6 py-3.5' : 'min-h-[44px] gap-3 px-4 py-2',
    s.box,
    className,
  ].join(' ')

  const content = (
    <>
      <span className={`pointer-events-none absolute left-0 top-0 h-1.5 w-1.5 border-l-2 border-t-2 ${s.corner}`} aria-hidden="true" />
      <span className={`pointer-events-none absolute bottom-0 right-0 h-1.5 w-1.5 border-b-2 border-r-2 ${s.corner}`} aria-hidden="true" />
      <span className={`whitespace-nowrap font-bold uppercase ${size === 'md' ? 'text-xs tracking-[0.22em]' : 'text-[11px] tracking-[0.18em]'} ${s.label}`}>
        {children}
      </span>
      <span
        className={`grid shrink-0 place-items-center transition-transform duration-200 group-hover:translate-x-1 ${size === 'md' ? 'h-6 w-6' : 'h-5 w-5'} ${s.chip}`}
        aria-hidden="true"
      >
        <Icon className={size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3'} strokeWidth={3} />
      </span>
    </>
  )

  const isPlain = /^(https?:|tel:|mailto:|#)/.test(href)
  if (isPlain) {
    return (
      <a href={href} className={cls} target={newTab ? '_blank' : undefined} rel={newTab ? 'noreferrer' : undefined}>
        {content}
      </a>
    )
  }
  return (
    <Link href={href as Route} className={cls}>
      {content}
    </Link>
  )
}
