import Image from 'next/image'
import { Clock, ShoppingBag, UtensilsCrossed } from 'lucide-react'
import { TacticalButton } from '@/components/TacticalButton'
import { CATEGORIES, buffetImageUrl, menuDayTitle, money, type BuffetCartaItem, type BuffetDayItem, type BuffetPublic } from './types'

/** Tarjeta de un producto en la web pública (foto, nombre, precio). */
export function PublicItemCard({ item, currency, badge }: { item: BuffetDayItem | BuffetCartaItem; currency: string; badge?: string }) {
  const img = buffetImageUrl(item.image_path)
  return (
    <article className="group overflow-hidden rounded-lg border border-white/10 bg-[#141414]">
      <div className="relative aspect-[4/3] bg-black">
        {img ? (
          <Image src={img} alt={item.name} fill sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
        ) : (
          <UtensilsCrossed className="absolute inset-0 m-auto h-10 w-10 text-white/15" aria-hidden="true" />
        )}
        {badge && <span className="absolute left-3 top-3 rounded-md bg-brand px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-black">{badge}</span>}
      </div>
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-bold leading-tight text-white">{item.name}</h3>
          {item.description && <p className="mt-1 line-clamp-2 text-sm text-white/60">{item.description}</p>}
        </div>
        <p className="shrink-0 font-display text-lg font-bold tabular-nums text-brand">{money(item.price_cents, currency)}</p>
      </div>
    </article>
  )
}

/**
 * Bloque del buffet en la portada de la web (publicidad): portada, menú de hoy
 * (o del próximo día con menú) y lo más destacado de la carta, con el botón para pedir.
 */
export function BuffetSection({ data, slug, orderHref }: { data: BuffetPublic; slug: string; orderHref: string }) {
  const cover = buffetImageUrl(data.cover_path)
  const nextMenu = data.days.find((d) => d.items.some((i) => i.special))
  const specials = nextMenu?.items.filter((i) => i.special) ?? []
  const cartaShown = data.carta.filter((c) => c.always_available).slice(0, specials.length ? 4 : 8)
  const cats = CATEGORIES.filter((c) => data.carta.some((i) => i.category === c.value)).map((c) => c.label)
  return (
    <section id="buffet" aria-labelledby="buffet-title" className="scroll-mt-4 border-y border-white/10 bg-[#0e0e0e] py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        <div className="grid items-end gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-brand">{data.name}</p>
            <h2 id="buffet-title" className="font-display text-[clamp(2.1rem,4.6vw,3.75rem)] font-bold leading-[1.05] tracking-[-0.03em] text-white">
              {data.tagline ?? 'Comé rico después de entrenar'}
            </h2>
            {data.description && <p className="mt-5 max-w-xl whitespace-pre-line text-lg text-white/70">{data.description}</p>}
            {cats.length > 0 && <p className="mt-4 text-sm text-white/50">{cats.join(' · ')}</p>}
            <div className="mt-8 flex flex-wrap gap-3">
              <TacticalButton href={orderHref} variant="solid" icon={ShoppingBag}>Pedí tu vianda</TacticalButton>
              <TacticalButton href={`/${slug}/buffet`} icon={UtensilsCrossed}>Ver la carta</TacticalButton>
            </div>
            <p className="mt-4 flex items-center gap-2 text-sm text-white/55">
              <Clock className="h-4 w-4 text-brand" aria-hidden="true" />
              Pedís desde la app, pagás online o al retirar, y lo buscás cuando venís a entrenar.
            </p>
          </div>
          {cover && (
            <div className="relative aspect-[16/9] overflow-hidden rounded-lg">
              <Image src={cover} alt={`${data.name} de ${data.org_name}`} fill sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" />
            </div>
          )}
        </div>

        {specials.length > 0 && nextMenu && (
          <div className="mt-14">
            <h3 className="font-display text-2xl font-bold text-white">
              {menuDayTitle(nextMenu.date, data.today)}
            </h3>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {specials.map((i) => (
                <PublicItemCard key={i.item_id} item={i} currency={data.currency} badge="Del día" />
              ))}
            </div>
          </div>
        )}
        {cartaShown.length > 0 && (
          <div className="mt-14">
            <h3 className="font-display text-2xl font-bold text-white">Todos los días</h3>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {cartaShown.map((i) => (
                <PublicItemCard key={i.item_id} item={i} currency={data.currency} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

