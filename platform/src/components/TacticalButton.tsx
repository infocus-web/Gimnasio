import Link from 'next/link'
import type { Route } from 'next'
import type { LucideIcon } from 'lucide-react'
import { Plus } from 'lucide-react'

type Variant = 'dark' | 'solid' | 'onBrand'

const STYLES: Record<Variant, { box: string; label: string; chip: string }> = {
  // Fondo oscuro, borde que se enciende en amarillo
  dark: {
    box: 'bg-[#2c2c2c]/90 border-[#444] hover:border-brand',
    label: 'text-white',
    chip: 'bg-brand text-black',
  },
  // Botón principal: amarillo de la marca
  solid: {
    box: 'bg-brand border-brand hover:bg-[#f5db5c] hover:border-[#f5db5c]',
    label: 'text-black',
    chip: 'bg-black text-brand',
  },
  // Para usar arriba de un fondo amarillo (plan destacado)
  onBrand: {
    box: 'bg-black border-black hover:bg-[#2c2c2c]',
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

/** Botón de la web (estilo W3Admin): redondeado, con un círculo con ícono que avanza al pasar el mouse. */
export function TacticalButton({ href, children, variant = 'dark', icon: Icon = Plus, size = 'md', newTab, className = '' }: Props) {
  const s = STYLES[variant]
  const cls = [
    'group relative inline-flex items-center justify-between rounded-xl border transition-colors duration-200 active:scale-[0.98]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-black',
    size === 'md' ? 'min-h-[54px] gap-5 py-3 pl-6 pr-3' : 'min-h-[44px] gap-3 py-2 pl-4 pr-2',
    s.box,
    className,
  ].join(' ')

  const content = (
    <>
      <span className={`whitespace-nowrap font-semibold ${size === 'md' ? 'text-[15px]' : 'text-sm'} ${s.label}`}>
        {children}
      </span>
      <span
        className={`grid shrink-0 place-items-center rounded-full transition-transform duration-200 group-hover:translate-x-0.5 ${size === 'md' ? 'h-8 w-8' : 'h-7 w-7'} ${s.chip}`}
        aria-hidden="true"
      >
        <Icon className={size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'} strokeWidth={2.5} />
      </span>
    </>
  )

  const isFile = /\.[a-z0-9]{2,4}$/i.test(href)
  const isPlain = isFile || /^(https?:|tel:|mailto:|#)/.test(href)
  if (isPlain) {
    return (
      <a href={href} className={cls} download={isFile || undefined} target={newTab ? '_blank' : undefined} rel={newTab ? 'noreferrer' : undefined}>
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
