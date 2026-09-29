import type { Metadata, Route } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowRight, CalendarCheck, Clock, Dumbbell, AtSign, Mail, MapPin, Menu, MessageCircle, Navigation, Phone, QrCode, Smartphone, Users,
} from 'lucide-react'
import { DAY_NAMES, formatPrice, getPublicGym, openStatus } from '@/features/public/profile'

export const revalidate = 300

export async function generateMetadata({ params }: PageProps<'/[org]'>): Promise<Metadata> {
  const { org } = await params
  const gym = await getPublicGym(org)
  if (!gym) return { title: 'Gimnasio' }
  return {
    title: { absolute: `${gym.name} · ${gym.profile.tagline ?? 'Gimnasio'}` },
    description: gym.profile.hero_text,
    openGraph: { title: gym.name, description: gym.profile.hero_text, images: gym.profile.hero_image ? [gym.profile.hero_image] : [] },
  }
}

const NAV = [
  ['#nosotros', 'Nosotros'],
  ['#actividades', 'Actividades'],
  ['#horarios', 'Horarios'],
  ['#planes', 'Planes'],
  ['#contacto', 'Contacto'],
] as const

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36] focus-visible:ring-offset-2 focus-visible:ring-offset-black'

function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#edcc36]">{children}</p>
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-2 text-3xl font-extrabold uppercase leading-tight text-white sm:text-4xl">{children}</h2>
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
  const mapQuery = gym.address ? `${gym.name}, ${gym.address}` : p.geo ? `${p.geo.lat},${p.geo.lng}` : null
  // Google Maps embebido sin API key (no requiere cuenta ni costo)
  const mapEmbed = mapQuery ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=16&hl=es&output=embed` : null
  const mapsHref = p.maps_url ?? (mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}` : null)
  const scheduleDays = [1, 2, 3, 4, 5, 6, 7].filter((d) => gym.schedule.some((s) => s.weekday === d))

  return (
    <div className="min-h-dvh bg-[#09090b] text-zinc-100">
      {/* ---------- Header ---------- */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-black/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <a href="#inicio" className={`flex min-w-0 items-center gap-2.5 rounded-lg ${focus}`}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#edcc36]/40 bg-[#edcc36]/10">
              <Dumbbell className="h-5 w-5 text-[#edcc36]" aria-hidden="true" />
            </span>
            <span className="truncate text-sm font-extrabold uppercase tracking-tight sm:text-base">
              {first} <span className="text-[#edcc36]">{rest.join(' ')}</span>
            </span>
          </a>
          <nav aria-label="Secciones" className="hidden items-center gap-6 md:flex">
            {NAV.map(([href, label]) => (
              <a key={href} href={href} className={`rounded text-sm font-semibold text-zinc-300 hover:text-[#edcc36] ${focus}`}>
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href={loginHref}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#edcc36] px-4 text-sm font-bold text-black shadow-[0_0_20px_-4px_rgba(237,204,54,0.5)] hover:bg-white ${focus}`}
            >
              <QrCode className="h-4 w-4" aria-hidden="true" /> Ingresar
            </Link>
            <details className="relative md:hidden">
              <summary
                aria-label="Abrir menú"
                className={`grid h-11 w-11 cursor-pointer list-none place-items-center rounded-xl border border-zinc-800 ${focus}`}
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </summary>
              <nav aria-label="Secciones" className="absolute right-0 mt-2 w-48 rounded-2xl border border-zinc-800 bg-black p-2 shadow-xl">
                {NAV.map(([href, label]) => (
                  <a key={href} href={href} className="block rounded-xl px-3 py-3 text-sm font-semibold text-zinc-200 hover:bg-zinc-900">
                    {label}
                  </a>
                ))}
              </nav>
            </details>
          </div>
        </div>
      </header>

      <main>
        {/* ---------- Hero ---------- */}
        <section id="inicio" className="relative isolate overflow-hidden">
          {p.hero_image && (
            <Image src={p.hero_image} alt="" fill priority sizes="100vw" className="-z-20 object-cover object-[70%_30%] opacity-75" />
          )}
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black via-black/80 to-black/20" aria-hidden="true" />
          <div className="cyber-grid absolute inset-0 -z-10" aria-hidden="true" />
          <div className="mx-auto flex min-h-[78svh] max-w-6xl flex-col justify-center px-4 py-20 sm:px-6">
            <div className="max-w-2xl space-y-6">
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  status.open ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300' : 'border-zinc-700 bg-black/60 text-zinc-300'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${status.open ? 'animate-pulse-subtle bg-emerald-400' : 'bg-zinc-500'}`} aria-hidden="true" />
                {status.label}
              </span>
              {p.hero_kicker && <Kicker>{p.hero_kicker}</Kicker>}
              <h1 className="text-4xl font-black uppercase leading-[0.95] tracking-tight text-white [overflow-wrap:anywhere] sm:text-6xl lg:text-7xl">
                {p.tagline ?? gym.name}
              </h1>
              {p.hero_text && <p className="max-w-xl text-lg leading-relaxed text-zinc-300">{p.hero_text}</p>}
              <div className="flex flex-col gap-3 sm:flex-row">
                <a
                  href="#planes"
                  className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-[#edcc36] px-6 font-bold text-black shadow-[0_0_25px_-3px_rgba(237,204,54,0.45)] hover:bg-white ${focus}`}
                >
                  Ver planes y precios <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
                <Link
                  href={loginHref}
                  className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-[#edcc36]/50 bg-black/50 px-6 font-bold text-[#edcc36] hover:bg-[#edcc36]/10 ${focus}`}
                >
                  <QrCode className="h-4 w-4" aria-hidden="true" /> Ya soy socio
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- App ---------- */}
        <section aria-labelledby="app-title" className="border-y border-white/5 bg-black">
          <h2 id="app-title" className="sr-only">Tu gimnasio en el celular</h2>
          <div className="mx-auto grid max-w-6xl gap-4 px-4 py-10 sm:grid-cols-3 sm:px-6">
            {[
              { Icon: QrCode, title: 'Entrás con tu celular', text: 'Mostrás tu pase QR en recepción. El código cambia cada 30 segundos.' },
              { Icon: CalendarCheck, title: 'Reservás clases en un toque', text: 'Elegís el horario y, en spinning, también tu bici.' },
              { Icon: Smartphone, title: 'Tu rutina con videos', text: 'Tu profe te la arma y vos anotás pesos y repeticiones.' },
            ].map(({ Icon, title, text }) => (
              <div key={title} className="glass-panel rounded-2xl p-5">
                <Icon className="h-6 w-6 text-[#edcc36]" aria-hidden="true" />
                <h3 className="mt-3 font-bold text-white">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- Nosotros ---------- */}
        <section id="nosotros" className="mx-auto grid max-w-6xl scroll-mt-20 items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div className="grid grid-cols-5 gap-3">
            {(p.about_images ?? []).slice(0, 2).map((src, i) => (
              <div
                key={src}
                className={`relative overflow-hidden rounded-2xl border border-[#edcc36]/20 ${i === 0 ? 'col-span-3 aspect-[3/4]' : 'col-span-2 mt-12 aspect-[3/5]'}`}
              >
                <Image src={src} alt="" fill sizes="(min-width: 1024px) 30vw, 60vw" className="object-cover" />
              </div>
            ))}
          </div>
          <div className="space-y-5">
            <Kicker>Nosotros</Kicker>
            <SectionTitle>{p.about_title ?? gym.name}</SectionTitle>
            {p.about_text && <p className="leading-relaxed text-zinc-300">{p.about_text}</p>}
            <ul className="space-y-2 text-sm text-zinc-300">
              {['Sala de musculación completa', 'Clases grupales toda la semana', 'Rutina personalizada con videos'].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#edcc36]" aria-hidden="true" /> {t}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------- Actividades ---------- */}
        {gym.activities.length > 0 && (
          <section id="actividades" className="scroll-mt-20 bg-black py-20">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <Kicker>Actividades</Kicker>
              <SectionTitle>Elegí cómo entrenar</SectionTitle>
              <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {gym.activities.map((a) => (
                  <article key={a.name} className="group relative isolate flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-3xl border border-white/10 p-6">
                    {a.image_url && (
                      <Image src={a.image_url} alt="" fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="-z-20 object-cover transition-transform duration-500 group-hover:scale-105" />
                    )}
                    <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black via-black/60 to-transparent" aria-hidden="true" />
                    <h3 className="text-2xl font-extrabold uppercase text-white">{a.name}</h3>
                    {a.description && <p className="mt-1 text-sm text-zinc-300">{a.description}</p>}
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ---------- Horarios ---------- */}
        <section id="horarios" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <Kicker>Horarios</Kicker>
          <SectionTitle>Grilla de clases</SectionTitle>
          <p className="mt-3 flex items-center gap-2 text-sm text-zinc-400">
            <Clock className="h-4 w-4 text-[#edcc36]" aria-hidden="true" />
            Gimnasio abierto: {p.hours_text ?? gym.opening_hours.map((h) => `${DAY_NAMES[h.weekday - 1]} ${h.open}–${h.close}`).join(' · ')}
          </p>
          {scheduleDays.length === 0 ? (
            <p className="mt-8 text-zinc-400">Pronto publicamos la grilla de clases.</p>
          ) : (
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {scheduleDays.map((d) => (
                <div key={d} className="glass-panel rounded-2xl p-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#edcc36]">{DAY_NAMES[d - 1]}</h3>
                  <ul className="mt-3 space-y-2">
                    {gym.schedule
                      .filter((s) => s.weekday === d)
                      .map((s) => (
                        <li key={`${s.start}-${s.activity}`} className="rounded-xl border border-zinc-800 bg-black/60 p-3">
                          <p className="text-xs font-semibold tabular-nums text-zinc-400">
                            {s.start} – {s.end}
                          </p>
                          <p className="mt-0.5 flex items-center gap-2 font-bold text-white">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
                            {s.activity}
                          </p>
                          <p className="text-xs text-zinc-500">{s.room}</p>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ---------- Planes ---------- */}
        <section id="planes" className="scroll-mt-20 bg-black py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Kicker>Planes</Kicker>
            <SectionTitle>Sin matrícula, pagás y entrenás</SectionTitle>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {gym.plans.map((plan, i) => {
                const price = formatPrice(plan)
                const featured = gym.plans.length >= 3 && i === 0
                return (
                  <article
                    key={plan.name}
                    className={`flex flex-col rounded-3xl p-6 ${featured ? 'glass-panel-yellow' : 'glass-panel'}`}
                  >
                    <h3 className="text-lg font-extrabold uppercase text-white">{plan.name}</h3>
                    {plan.description && <p className="mt-1 text-sm text-zinc-400">{plan.description}</p>}
                    <p className="mt-6">
                      <span className="text-4xl font-black tabular-nums text-white">{price.amount}</span>
                      <span className="ml-2 text-sm text-zinc-400">{price.period}</span>
                    </p>
                    {plan.max_members > 1 && (
                      <p className="mt-2 flex items-center gap-1.5 text-sm text-zinc-300">
                        <Users className="h-4 w-4 text-[#edcc36]" aria-hidden="true" /> Hasta {plan.max_members} personas
                      </p>
                    )}
                    <a
                      href="#contacto"
                      className={`mt-6 inline-flex min-h-[48px] items-center justify-center rounded-xl font-bold ${
                        featured ? 'bg-[#edcc36] text-black hover:bg-white' : 'border border-zinc-700 text-white hover:border-[#edcc36] hover:text-[#edcc36]'
                      } ${focus}`}
                    >
                      Quiero este plan
                    </a>
                  </article>
                )
              })}
            </div>
            <p className="mt-4 text-sm text-zinc-500">Te asociás en recepción: efectivo, transferencia o tarjeta.</p>
          </div>
        </section>

        {/* ---------- Galería ---------- */}
        {(p.gallery ?? []).length > 0 && (
          <section aria-labelledby="galeria-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <Kicker>Galería</Kicker>
            <h2 id="galeria-title" className="mt-2 text-3xl font-extrabold uppercase text-white sm:text-4xl">El gimnasio</h2>
            <div className="mt-10 columns-2 gap-3 md:columns-3 [&>*]:mb-3">
              {(p.gallery ?? []).map((src) => (
                <div key={src} className="relative overflow-hidden rounded-2xl border border-white/10">
                  <Image src={src} alt="" width={1200} height={900} sizes="(min-width: 768px) 33vw, 50vw" className="h-auto w-full object-cover" />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ---------- Contacto + mapa ---------- */}
        <section id="contacto" className="scroll-mt-20 border-t border-white/5 bg-black py-20">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-5">
            <div className="space-y-6 lg:col-span-2">
              <div className="space-y-3">
                <Kicker>Contacto</Kicker>
                <SectionTitle>Vení a conocernos</SectionTitle>
                <p className="text-zinc-300">Acercate a recepción y te armamos tu plan y tu rutina.</p>
              </div>
              <ul className="glass-panel space-y-4 rounded-3xl p-6 text-sm">
                {gym.address && (
                  <li className="flex gap-3">
                    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#edcc36]" aria-hidden="true" />
                    <span>{gym.address}</span>
                  </li>
                )}
                <li className="flex gap-3">
                  <Clock className="mt-0.5 h-5 w-5 shrink-0 text-[#edcc36]" aria-hidden="true" />
                  <span>{p.hours_text ?? 'Consultá horarios en recepción'}</span>
                </li>
                {p.phone && (
                  <li className="flex gap-3">
                    <Phone className="mt-0.5 h-5 w-5 shrink-0 text-[#edcc36]" aria-hidden="true" />
                    <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`} className="underline-offset-4 hover:underline">{p.phone}</a>
                  </li>
                )}
                {p.email && (
                  <li className="flex gap-3">
                    <Mail className="mt-0.5 h-5 w-5 shrink-0 text-[#edcc36]" aria-hidden="true" />
                    <a href={`mailto:${p.email}`} className="underline-offset-4 hover:underline">{p.email}</a>
                  </li>
                )}
                {p.instagram && (
                  <li className="flex gap-3">
                    <AtSign className="mt-0.5 h-5 w-5 shrink-0 text-[#edcc36]" aria-hidden="true" />
                    <a href={`https://instagram.com/${p.instagram.replace('@', '')}`} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                      Instagram {p.instagram}
                    </a>
                  </li>
                )}
                {p.facebook && (
                  <li className="flex gap-3">
                    <Users className="mt-0.5 h-5 w-5 shrink-0 text-[#edcc36]" aria-hidden="true" />
                    <a href={`https://www.facebook.com/${p.facebook}`} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                      Facebook
                    </a>
                  </li>
                )}
              </ul>
              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
                {mapsHref && (
                  <a
                    href={mapsHref}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#edcc36] px-6 font-bold text-black hover:bg-white ${focus}`}
                  >
                    <Navigation className="h-5 w-5" aria-hidden="true" /> Cómo llegar
                  </a>
                )}
                {whatsapp ? (
                  <a
                    href={whatsapp}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl border border-[#edcc36]/50 px-6 font-bold text-[#edcc36] hover:bg-[#edcc36]/10 ${focus}`}
                  >
                    <MessageCircle className="h-5 w-5" aria-hidden="true" /> WhatsApp
                  </a>
                ) : p.phone ? (
                  <a
                    href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}
                    className={`inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl border border-[#edcc36]/50 px-6 font-bold text-[#edcc36] hover:bg-[#edcc36]/10 ${focus}`}
                  >
                    <Phone className="h-5 w-5" aria-hidden="true" /> Llamar
                  </a>
                ) : null}
              </div>
            </div>

            {mapEmbed && (
              <div className="relative min-h-[320px] overflow-hidden rounded-3xl border border-[#edcc36]/25 shadow-[0_0_25px_-5px_rgba(237,204,54,0.2)] lg:col-span-3">
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

      <footer className="border-t border-white/5 px-4 py-8 text-xs text-zinc-500">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
          <span>© {new Date().getFullYear()} {gym.name}</span>
          <Link
            href={`/equipo?next=${encodeURIComponent(`/${gym.slug}/admin`)}` as Route}
            rel="nofollow"
            className="rounded-md px-2 py-1 text-zinc-600 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
          >
            Acceso equipo
          </Link>
        </div>
      </footer>
    </div>
  )
}
