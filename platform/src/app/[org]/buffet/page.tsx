import type { Metadata, Route } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Clock, MessageCircle, ShoppingBag } from 'lucide-react'
import { display, text } from '@/features/public/fonts'
import { TacticalButton } from '@/components/TacticalButton'
import { getBuffetPublic } from '@/features/buffet/data'
import { PublicItemCard } from '@/features/buffet/BuffetSection'
import { CATEGORIES, buffetImageUrl, menuDayTitle } from '@/features/buffet/types'

export const revalidate = 120

export async function generateMetadata({ params }: PageProps<'/[org]/buffet'>): Promise<Metadata> {
  const { org } = await params
  const data = await getBuffetPublic(org)
  if (!data) return { title: 'Buffet' }
  const cover = buffetImageUrl(data.cover_path)
  const title = `${data.name} · ${data.org_name}`
  const description = data.tagline ?? `Carta y menú del día del ${data.name}. Pedí tu vianda y retirala cuando venís a entrenar.`
  return { title: { absolute: title }, description, openGraph: { title, description, ...(cover ? { images: [cover] } : {}) } }
}

export default async function BuffetPublicPage({ params }: PageProps<'/[org]/buffet'>) {
  const { org: slug } = await params
  const data = await getBuffetPublic(slug)
  if (!data) notFound()
  const cover = buffetImageUrl(data.cover_path)
  const orderHref = `/login?next=${encodeURIComponent(`/${slug}/app/buffet`)}`
  const menuDays = data.days.filter((d) => d.items.some((i) => i.special))

  return (
    <div className={`${display.variable} ${text.variable} public-site min-h-dvh bg-black font-text text-[#e9e7e1]`}>
      <header className="relative isolate overflow-hidden">
        {cover && <Image src={cover} alt="" fill priority sizes="100vw" className="-z-20 object-cover" />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black via-black/70 to-black/30" aria-hidden="true" />
        <div className="mx-auto max-w-6xl px-4 pb-14 pt-8 sm:px-8 sm:pb-20">
          <Link href={`/${slug}` as Route} className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-white/80 hover:text-brand">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {data.org_name}
          </Link>
          <h1 className="mt-16 font-display text-[clamp(2.6rem,7vw,5rem)] font-bold leading-[1] tracking-[-0.035em] text-white">{data.name}</h1>
          {data.tagline && <p className="mt-4 max-w-xl text-xl text-white/80">{data.tagline}</p>}
          {data.description && <p className="mt-4 max-w-2xl whitespace-pre-line text-white/65">{data.description}</p>}
          <div className="mt-8 flex flex-wrap gap-3">
            <TacticalButton href={orderHref} variant="solid" icon={ShoppingBag}>Pedí desde la app</TacticalButton>
            {data.whatsapp && (
              <TacticalButton href={`https://wa.me/${data.whatsapp.replace(/\D/g, '')}`} icon={MessageCircle} newTab>Escribinos</TacticalButton>
            )}
          </div>
          <p className="mt-5 flex flex-wrap items-center gap-2 text-sm text-white/60">
            <Clock className="h-4 w-4 text-brand" aria-hidden="true" />
            {data.pickup_text ?? 'Retirás en el buffet del gimnasio.'} Pedidos para cada día hasta las {data.order_cutoff} h.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-16 px-4 py-14 sm:px-8 sm:py-20">
        {menuDays.map((d) => (
          <section key={d.date} aria-labelledby={`dia-${d.date}`}>
            <h2 id={`dia-${d.date}`} className="font-display text-3xl font-bold text-white">
              {menuDayTitle(d.date, data.today)}
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {d.items.filter((i) => i.special).map((i) => (
                <PublicItemCard key={i.item_id} item={i} currency={data.currency} badge={i.left === 0 ? 'Agotado' : 'Del día'} />
              ))}
            </div>
          </section>
        ))}

        {CATEGORIES.map((c) => {
          const list = data.carta.filter((i) => i.category === c.value && i.always_available)
          if (!list.length) return null
          return (
            <section key={c.value} aria-labelledby={`cat-${c.value}`}>
              <h2 id={`cat-${c.value}`} className="font-display text-3xl font-bold text-white">{c.label}</h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {list.map((i) => <PublicItemCard key={i.item_id} item={i} currency={data.currency} />)}
              </div>
            </section>
          )
        })}

        <section className="rounded-lg border border-white/10 bg-[#141414] p-8 text-center sm:p-12">
          <h2 className="font-display text-3xl font-bold text-white">¿Sos socio?</h2>
          <p className="mx-auto mt-3 max-w-md text-white/65">Entrá a la app, elegí el día, pagá online o al retirar, y lo buscás cuando venís a entrenar.</p>
          <div className="mt-6 flex justify-center">
            <TacticalButton href={orderHref} variant="solid" icon={ShoppingBag}>Pedir ahora</TacticalButton>
          </div>
        </section>
      </main>
    </div>
  )
}
