import type { Metadata, Route } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowUpRight, AtSign, CalendarCheck, Clock, Mail, MapPin, Menu, MessageCircle, Navigation, Phone, QrCode, Smartphone, Users, X,
} from 'lucide-react'
import { DAY_NAMES, formatPrice, getPublicGym, openStatus } from '@/features/public/profile'
import { WEB_MEDIA, activityImage } from '@/features/public/media'
import { display, text } from '@/features/public/fonts'
import { TacticalButton } from '@/components/TacticalButton'
import { EXTRAS } from '@/features/public/content'

export const revalidate = 300

export async function generateMetadata({ params }: PageProps<'/[org]'>): Promise<Metadata> {
  const { org } = await params
  const gym = await getPublicGym(org)
  if (!gym) return { title: 'Gimnasio' }
  return {
    title: { absolute: `${gym.name} · ${gym.profile.tagline ?? 'Gimnasio'}` },
    description: gym.profile.hero_text,
    openGraph: { title: gym.name, description: gym.profile.hero_text, images: [WEB_MEDIA.heroPoster] },
  }
}

const NAV = [
  ['#actividades', 'Actividades'],
  ['#app', 'La app'],
  ['#horarios', 'Horarios'],
  ['#planes', 'Planes'],
  ['#contacto', 'Contacto'],
] as const

const focus =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-black'


function Heading({ id, children, className = '' }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <h2 id={id} className={`font-display text-[clamp(2.5rem,6vw,4.75rem)] font-black uppercase leading-[0.9] text-white ${className}`}>
      {children}
    </h2>
  )
}

export default async function GymHome({ params }: PageProps<'/[org]'>) {
  const { org } = await params
  const gym = await getPublicGym(org)
  if (!gym) notFound()

  const p = gym.profile
  const status = openStatus(gym.opening_hours)
  const loginHref = `/login?next=${encodeURIComponent(`/${gym.slug}/app/pase`)}` as Route
  const [first, ...rest] = gym.name.split(' ')
  const whatsapp = p.whatsapp ? `https://wa.me/${p.whatsapp.replace(/\D/g, '')}` : null
  const tel = p.phone ? `tel:${p.phone.replace(/[^\d+]/g, '')}` : null
  const mapQuery = gym.address ? `${gym.name}, ${gym.address}` : p.geo ? `${p.geo.lat},${p.geo.lng}` : null
  const mapEmbed = mapQuery ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=16&hl=es&output=embed` : null
  const mapsHref = p.maps_url ?? (mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}` : null)
  const scheduleDays = [1, 2, 3, 4, 5, 6, 7].filter((d) => gym.schedule.some((s) => s.weekday === d))
  const hoursText = p.hours_text ?? gym.opening_hours.map((h) => `${DAY_NAMES[h.weekday - 1]} ${h.open}–${h.close}`).join(', ')
  const shortAddress = gym.address?.split(',').slice(0, 2).join(',')
  const contactHref = whatsapp ?? tel ?? '#contacto'
  const gallery: readonly string[] = p.gallery?.length ? p.gallery : WEB_MEDIA.gallery
  const about: readonly string[] = p.about_images?.length === 2 ? p.about_images : WEB_MEDIA.about

  return (
    <div className={`${display.variable} ${text.variable} public-site min-h-dvh bg-black font-text text-[#e9e7e1]`}>
      {/* ---------- Header ---------- */}
      <header className="absolute inset-x-0 top-0 z-40">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <a href="#inicio" className={`flex min-w-0 items-baseline gap-1.5 rounded ${focus}`} aria-label={`${gym.name}, inicio`}>
            <span className="font-display text-2xl font-black uppercase leading-none tracking-tight text-white sm:text-3xl">{first}</span>
            <span className="hidden truncate font-display text-lg font-bold uppercase leading-none text-brand min-[420px]:inline sm:text-xl">{rest.join(' ')}</span>
          </a>
          <nav aria-label="Secciones" className="hidden items-center gap-7 lg:flex">
            {NAV.map(([href, label]) => (
              <a key={href} href={href} className={`rounded text-[15px] font-semibold text-white/80 transition-colors hover:text-brand ${focus}`}>
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <TacticalButton href={loginHref} variant="solid" size="sm" icon={QrCode}>
              Soy socio
            </TacticalButton>
            <details className="group relative lg:hidden">
              <summary
                aria-label="Abrir menú"
                className={`grid h-11 w-11 cursor-pointer list-none place-items-center rounded-md border border-white/20 bg-black/40 backdrop-blur-sm [&::-webkit-details-marker]:hidden ${focus}`}
              >
                <Menu className="h-5 w-5 group-open:hidden" aria-hidden="true" />
                <X className="hidden h-5 w-5 group-open:block" aria-hidden="true" />
              </summary>
              <nav aria-label="Secciones" className="absolute right-0 mt-2 w-56 rounded-lg border border-white/10 bg-[#141414] p-2 shadow-2xl">
                {NAV.map(([href, label]) => (
                  <a key={href} href={href} className="block rounded-md px-3 py-3 text-[15px] font-semibold text-white hover:bg-white/5 hover:text-brand">
                    {label}
                  </a>
                ))}
              </nav>
            </details>
          </div>
        </div>
      </header>

      <main>
        {/* ---------- Hero con video ---------- */}
        <section id="inicio" className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
          <video
            className="hero-video absolute inset-0 -z-20 h-full w-full object-cover object-[60%_center]"
            src={WEB_MEDIA.heroVideo}
            poster={p.hero_image ?? WEB_MEDIA.heroPoster}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
          />
          <Image src={p.hero_image ?? WEB_MEDIA.heroPoster} alt="" fill priority sizes="100vw" className="hero-poster -z-20 hidden object-cover object-[60%_center]" />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,#000_0%,rgba(0,0,0,0.5)_40%,rgba(0,0,0,0.1)_100%)]" aria-hidden="true" />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(0,0,0,0.6),transparent_65%)]" aria-hidden="true" />

          <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-end px-4 pb-10 pt-32 sm:px-8 sm:pb-14">
            <p className="flex items-center gap-2 text-sm font-semibold text-white/85">
              <span className={`h-2 w-2 rounded-full ${status.open ? 'animate-pulse-subtle bg-emerald-400' : 'bg-white/40'}`} aria-hidden="true" />
              {status.label}
            </p>
            <h1 className="hero-title mt-4 max-w-5xl font-display text-[clamp(2.6rem,10.4vw,10.5rem)] font-extrabold uppercase leading-[0.86] tracking-[-0.01em] text-white">
              {p.tagline ?? gym.name}
            </h1>
            <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              {p.hero_text && <p className="max-w-md text-lg leading-relaxed text-white/80">{p.hero_text}</p>}
              <div className="flex flex-col gap-3 sm:flex-row">
                <TacticalButton href="#planes" variant="solid">
                  Ver planes y precios
                </TacticalButton>
                <TacticalButton href={contactHref} newTab={!!whatsapp} icon={MessageCircle}>
                  Consultar
                </TacticalButton>
              </div>
            </div>
          </div>

          {/* Datos rápidos */}
          <div className="border-t border-white/10 bg-black/60 backdrop-blur-md">
            <dl className="mx-auto grid max-w-7xl grid-cols-1 divide-y divide-white/10 px-4 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-8">
              {[
                { Icon: MapPin, label: 'Dónde', value: shortAddress ?? 'Pilar' },
                { Icon: Clock, label: 'Horario', value: hoursText },
                { Icon: CalendarCheck, label: 'Ingreso', value: 'Sin matrícula: pagás el mes y entrenás' },
              ].map(({ Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3 py-4 sm:px-6 sm:first:pl-0">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                  <div>
                    <dt className="text-xs font-semibold text-white/50">{label}</dt>
                    <dd className="text-[15px] font-semibold text-white">{value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ---------- Actividades ---------- */}
        {gym.activities.length > 0 && (
          <section id="actividades" aria-labelledby="act-title" className="scroll-mt-4 py-24 sm:py-32">
            <div className="mx-auto max-w-7xl px-4 sm:px-8">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <Heading id="act-title">Elegí cómo<br />entrenar</Heading>
                <p className="max-w-sm text-white/65">Sala completa, clases grupales todos los días y profes que corrigen tu técnica.</p>
              </div>
              <div className="mt-12 flex flex-col gap-3 md:h-[560px] md:flex-row">
                {gym.activities.map((a) => {
                  const img = a.image_url ?? activityImage(a.name, null)
                  return (
                    <article
                      key={a.name}
                      className="activity-panel group relative isolate flex min-h-[380px] flex-1 flex-col justify-end overflow-hidden rounded-lg p-6 sm:p-8 md:min-h-0"
                    >
                      {img && (
                        <Image
                          src={img}
                          alt=""
                          fill
                          sizes="(min-width: 768px) 50vw, 100vw"
                          className="-z-20 object-cover grayscale-[35%] transition-[filter,transform] duration-700 group-hover:scale-[1.03] group-hover:grayscale-0"
                        />
                      )}
                      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black via-black/40 to-transparent" aria-hidden="true" />
                      <span className="mb-4 h-1 w-10 bg-brand" style={{ backgroundColor: a.color || undefined }} aria-hidden="true" />
                      <h3 className="font-display text-5xl font-black uppercase leading-none text-white sm:text-6xl">{a.name}</h3>
                      {a.description && <p className="mt-3 max-w-xs text-[15px] text-white/75">{a.description}</p>}
                    </article>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {/* ---------- Más propuestas ---------- */}
        {(EXTRAS[gym.slug] ?? []).length > 0 && (
          <section aria-labelledby="extras-title" className="pb-24 sm:pb-32">
            <div className="mx-auto max-w-7xl px-4 sm:px-8">
              <Heading id="extras-title" className="text-[clamp(2.25rem,5vw,3.75rem)]">Mucho más que un gimnasio</Heading>
              <ul className="mt-10 grid gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
                {(EXTRAS[gym.slug] ?? []).map((x, i) => (
                  <li key={x.name} className={`bg-black p-6 sm:p-8 ${i === 0 ? 'sm:col-span-2 lg:col-span-1 lg:row-span-2 lg:bg-[#141414]' : ''}`}>
                    <h3 className="font-display text-3xl font-extrabold uppercase leading-none text-white">{x.name}</h3>
                    <p className="mt-3 text-[15px] text-white/65">{x.text}</p>
                    {x.detail && (
                      <div className="mt-5 flex items-start gap-2 text-sm font-semibold text-brand">
                        <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <div>
                          {x.detail.split(' · ').map((line) => (
                            <p key={line}>{line}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ---------- La app ---------- */}
        <section id="app" aria-labelledby="app-title" className="scroll-mt-4 bg-[#141414] py-24 sm:py-32">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-8 lg:grid-cols-2 lg:gap-20">
            <div className="relative aspect-[4/5] overflow-hidden rounded-lg lg:order-2">
              <Image src={WEB_MEDIA.app} alt="Socia mirando su rutina en el celular en la sala" fill sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" />
            </div>
            <div>
              <Heading id="app-title">Tu gimnasio<br />en el celular</Heading>
              <p className="mt-5 max-w-md text-lg text-white/70">Cada socio tiene su cuenta: rutina, clases y pagos en un solo lugar.</p>
              <ul className="mt-10 space-y-7">
                {[
                  { Icon: Smartphone, title: 'Tu rutina con videos', text: 'Tu profe te la arma y vos anotás pesos y repeticiones serie por serie.' },
                  { Icon: CalendarCheck, title: 'Reservás clases en un toque', text: 'Elegís el horario y, en spinning, también tu bici.' },
                  { Icon: QrCode, title: 'Pagás y ves tu plan', text: 'Cuándo vence, qué incluye y tus pagos, sin preguntar en recepción.' },
                ].map(({ Icon, title, text: t }) => (
                  <li key={title} className="flex gap-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-brand text-black">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="text-lg font-bold text-white">{title}</h3>
                      <p className="mt-1 text-white/65">{t}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <TacticalButton href={loginHref} variant="solid" icon={ArrowUpRight} className="mt-10">
                Entrar a la app
              </TacticalButton>
            </div>
          </div>
        </section>

        {/* ---------- Nosotros ---------- */}
        <section id="nosotros" aria-labelledby="about-title" className="scroll-mt-4 py-24 sm:py-32">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-8 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Heading id="about-title" className="text-[clamp(2.25rem,4.6vw,3.75rem)]">
                {p.about_title ?? gym.name}
              </Heading>
              {p.about_text && <p className="mt-6 text-lg leading-relaxed text-white/70">{p.about_text}</p>}
              <ul className="mt-8 grid gap-3 text-[15px] font-semibold text-white">
                {['Sala de musculación completa', 'Clases grupales toda la semana', 'Rutina personalizada con seguimiento'].map((t) => (
                  <li key={t} className="flex items-center gap-3 border-b border-white/10 pb-3">
                    <span className="h-2 w-2 rotate-45 bg-brand" aria-hidden="true" /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-12 gap-3 lg:col-span-7">
              <div className="relative col-span-7 aspect-[3/4] overflow-hidden rounded-lg">
                <Image src={about[0]!} alt="Profe preparando a una alumna antes de entrenar" fill sizes="(min-width: 1024px) 32vw, 58vw" className="object-cover" />
              </div>
              <div className="relative col-span-5 mt-16 aspect-[3/5] overflow-hidden rounded-lg">
                <Image src={about[1]!} alt="Banco y barra en la sala de musculación" fill sizes="(min-width: 1024px) 24vw, 42vw" className="object-cover" />
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Horarios ---------- */}
        <section id="horarios" aria-labelledby="sched-title" className="scroll-mt-4 border-y border-white/10 bg-[#0e0e0e] py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <Heading id="sched-title">Grilla<br />de clases</Heading>
              <p className="flex items-center gap-2 text-white/65">
                <Clock className="h-4 w-4 text-brand" aria-hidden="true" /> Gimnasio abierto: {hoursText}
              </p>
            </div>
            {scheduleDays.length === 0 ? (
              <p className="mt-10 text-white/60">Pronto publicamos la grilla de clases. Consultanos por los horarios.</p>
            ) : (
              <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {scheduleDays.map((d) => (
                  <div key={d} className="bg-[#0e0e0e] p-4">
                    <h3 className="font-display text-2xl font-extrabold uppercase text-white">{DAY_NAMES[d - 1]}</h3>
                    <ul className="mt-4 space-y-2">
                      {gym.schedule
                        .filter((s) => s.weekday === d)
                        .map((s) => (
                          <li key={`${s.start}-${s.activity}`} className="border-l-2 py-1 pl-3" style={{ borderColor: s.color }}>
                            <p className="text-sm font-semibold tabular-nums text-white/55">
                              {s.start}–{s.end}
                            </p>
                            <p className="font-bold text-white">{s.activity}</p>
                            <p className="text-xs text-white/45">{s.room}</p>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ---------- Planes ---------- */}
        <section id="planes" aria-labelledby="plans-title" className="scroll-mt-4 py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <Heading id="plans-title">Planes</Heading>
              <p className="max-w-sm text-white/65">Sin matrícula. Te asociás en recepción con efectivo, transferencia o tarjeta, o pagás desde la app.</p>
            </div>
            {gym.plans.length === 0 ? (
              <p className="mt-10 text-white/60">Consultá los planes vigentes en recepción.</p>
            ) : (
              <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {gym.plans.map((plan, i) => {
                  const price = formatPrice(plan)
                  const featured = gym.plans.length >= 3 && i === 0
                  return (
                    <article
                      key={plan.name}
                      className={`relative flex flex-col rounded-lg border p-7 ${
                        featured ? 'border-brand bg-brand text-black' : 'border-white/12 bg-[#141414] text-white'
                      }`}
                    >
                      <h3 className="font-display text-3xl font-extrabold uppercase leading-none">{plan.name}</h3>
                      {plan.description && <p className={`mt-2 text-[15px] ${featured ? 'text-black/70' : 'text-white/60'}`}>{plan.description}</p>}
                      <p className="mb-8 mt-8 flex items-baseline gap-2">
                        <span className="font-display text-6xl font-black tabular-nums leading-none">{price.amount}</span>
                        <span className={`text-sm font-semibold ${featured ? 'text-black/70' : 'text-white/55'}`}>{price.period}</span>
                      </p>
                      {plan.max_members > 1 && (
                        <p className={`-mt-5 mb-8 flex items-center gap-1.5 text-sm font-semibold ${featured ? 'text-black/80' : 'text-white/75'}`}>
                          <Users className="h-4 w-4" aria-hidden="true" /> Hasta {plan.max_members} personas
                        </p>
                      )}
                      <TacticalButton href={contactHref} newTab={!!whatsapp} variant={featured ? 'onBrand' : 'dark'} className="mt-auto w-full">
                        Quiero este plan
                      </TacticalButton>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        {/* ---------- Galería ---------- */}
        <section aria-labelledby="gal-title" className="pb-24 sm:pb-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-8">
            <Heading id="gal-title" className="sr-only">Galería</Heading>
            <div className="grid auto-rows-[160px] grid-cols-2 gap-3 sm:auto-rows-[220px] md:grid-cols-4">
              {gallery.map((src, i) => (
                <div
                  key={src}
                  className={`relative overflow-hidden rounded-lg ${i === 0 ? 'col-span-2 row-span-2' : ''} ${i === 3 ? 'col-span-2' : ''}`}
                >
                  <Image src={src} alt="" fill sizes={i === 0 ? '(min-width: 768px) 50vw, 100vw' : '(min-width: 768px) 25vw, 50vw'} className="object-cover" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Llamado ---------- */}
        <section aria-labelledby="cta-title" className="relative isolate overflow-hidden">
          <Image src={WEB_MEDIA.cta} alt="" fill sizes="100vw" className="-z-20 object-cover" />
          <div className="absolute inset-0 -z-10 bg-black/65" aria-hidden="true" />
          <div className="mx-auto flex max-w-7xl flex-col items-start gap-8 px-4 py-24 sm:px-8 sm:py-32 lg:flex-row lg:items-end lg:justify-between">
            <h2 id="cta-title" className="max-w-3xl font-display text-[clamp(3rem,8vw,7rem)] font-black uppercase leading-[0.85] text-white">
              Vení a entrenar con nosotros
            </h2>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              {whatsapp && (
                <TacticalButton href={whatsapp} newTab variant="solid" icon={MessageCircle}>
                  Escribinos
                </TacticalButton>
              )}
              {!whatsapp && tel && (
                <TacticalButton href={tel} variant="solid" icon={Phone}>
                  Llamanos
                </TacticalButton>
              )}
              {mapsHref && (
                <TacticalButton href={mapsHref} newTab icon={Navigation}>
                  Cómo llegar
                </TacticalButton>
              )}
            </div>
          </div>
        </section>

        {/* ---------- Contacto + mapa ---------- */}
        <section id="contacto" aria-labelledby="contact-title" className="scroll-mt-4 py-24 sm:py-32">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-8 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <Heading id="contact-title">Contacto</Heading>
              <ul className="mt-10 divide-y divide-white/10 border-y border-white/10 text-[15px]">
                {gym.address && (
                  <li className="flex gap-4 py-4">
                    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                    <span>{gym.address}</span>
                  </li>
                )}
                <li className="flex gap-4 py-4">
                  <Clock className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                  <span>{hoursText}</span>
                </li>
                {p.phone && tel && (
                  <li className="flex gap-4 py-4">
                    <Phone className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                    <a href={tel} className="underline-offset-4 hover:text-brand hover:underline">{p.phone}</a>
                  </li>
                )}
                {p.email && (
                  <li className="flex gap-4 py-4">
                    <Mail className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                    <a href={`mailto:${p.email}`} className="underline-offset-4 hover:text-brand hover:underline">{p.email}</a>
                  </li>
                )}
                {p.instagram && (
                  <li className="flex gap-4 py-4">
                    <AtSign className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                    <a href={`https://instagram.com/${p.instagram.replace('@', '')}`} target="_blank" rel="noreferrer" className="underline-offset-4 hover:text-brand hover:underline">
                      Instagram {p.instagram}
                    </a>
                  </li>
                )}
                {p.facebook && (
                  <li className="flex gap-4 py-4">
                    <Users className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                    <a href={`https://www.facebook.com/${p.facebook}`} target="_blank" rel="noreferrer" className="underline-offset-4 hover:text-brand hover:underline">
                      Facebook
                    </a>
                  </li>
                )}
              </ul>
            </div>
            {mapEmbed && (
              <div className="relative min-h-[360px] overflow-hidden rounded-lg border border-white/10 lg:col-span-3">
                <iframe
                  title={`Mapa: ${gym.name}${gym.address ? `, ${gym.address}` : ''}`}
                  src={mapEmbed}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="absolute inset-0 h-full w-full [filter:grayscale(1)_invert(0.92)_contrast(0.9)]"
                />
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <p className="font-display text-2xl font-black uppercase leading-none text-white">
              {first} <span className="text-brand">{rest.join(' ')}</span>
            </p>
            <p className="mt-2 text-sm text-white/45">© {new Date().getFullYear()} {gym.name}{shortAddress ? `, ${shortAddress}` : ''}</p>
          </div>
          <Link
            href={`/equipo?next=${encodeURIComponent(`/${gym.slug}/admin`)}` as Route}
            rel="nofollow"
            className={`self-start rounded-md px-2 py-1 text-sm text-white/35 transition-colors hover:text-white/80 sm:self-auto ${focus}`}
          >
            Acceso equipo
          </Link>
        </div>
      </footer>
    </div>
  )
}
