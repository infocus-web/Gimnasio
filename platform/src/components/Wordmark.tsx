import Image from 'next/image'
import { BRAND } from '@/features/public/media'

/** Logotipo de la marca (imagen "EVOLUTION FITNESS GYM"). `name` se usa como texto alternativo. */
export function Wordmark({ name, size = 'md', sub }: { name: string; size?: 'sm' | 'md'; sub?: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <Image
        src={BRAND.logo}
        alt={name}
        width={BRAND.logoWidth}
        height={BRAND.logoHeight}
        priority
        sizes={size === 'md' ? '220px' : '170px'}
        className={`w-auto max-w-full object-contain object-left ${size === 'md' ? 'h-9' : 'h-7'}`}
      />
      {sub && <span className="mt-1.5 text-xs text-zinc-500">{sub}</span>}
    </span>
  )
}
