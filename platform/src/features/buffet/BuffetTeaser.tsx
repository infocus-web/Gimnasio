import Link from 'next/link'
import Image from 'next/image'
import type { Route } from 'next'
import { ChevronRight, UtensilsCrossed } from 'lucide-react'
import { getBuffetPublic } from './data'
import { buffetImageUrl, money } from './types'

/** Aviso del buffet en la app del socio (debajo del QR): el menú de hoy y el botón para pedir. */
export async function BuffetTeaser({ slug }: { slug: string }) {
  const data = await getBuffetPublic(slug)
  if (!data) return null
  const today = data.days.find((d) => d.date === data.today)
  const specials = (today?.items ?? []).filter((i) => i.special)
  const featured = specials[0] ?? today?.items[0] ?? null
  const img = buffetImageUrl(featured?.image_path ?? data.cover_path)
  return (
    <Link
      href={`/${slug}/app/buffet` as Route}
      className="flex items-center gap-3 rounded-2xl border border-[#edcc36]/30 bg-zinc-950 p-3 hover:border-[#edcc36]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
    >
      <span className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-zinc-900">
        {img ? <Image src={img} alt="" fill sizes="56px" className="object-cover" /> : <UtensilsCrossed className="h-6 w-6 text-[#edcc36]" aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold uppercase tracking-wide text-[#edcc36]">{data.name}{specials.length ? ' · Menú de hoy' : ''}</span>
        <span className="block truncate font-semibold text-white">
          {specials.length ? specials.map((s) => s.name).join(' · ') : data.tagline ?? 'Pedí tu vianda y retirala cuando venís'}
        </span>
        <span className="block text-xs text-zinc-400">
          {featured && specials.length ? `Desde ${money(Math.min(...specials.map((s) => s.price_cents)), data.currency)} · ` : ''}Pedí y retiralo al entrenar
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-zinc-500" aria-hidden="true" />
    </Link>
  )
}
