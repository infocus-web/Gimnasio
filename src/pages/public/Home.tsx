import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AtSign, CheckCircle2, ChevronLeft, ChevronRight, Clock, Dumbbell, Mail, MapPin, Menu, MessageCircle, Phone, Smartphone, Users, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Activity, Plan, ScheduleSlot } from '../../lib/types'
import { fmtMoney, whatsappLink } from '../../lib/format'
import { useSettings } from '../../lib/auth'
import { WeekSchedule } from '../../components/WeekSchedule'
import { cx } from '../../components/ui'

// Estilo inspirado en la plantilla "Ales": negro #090909, amarillo #edcc36,
// títulos Heebo en mayúsculas, botones cuadrados y bordes finos amarillos.

const NAV = [
  ['#inicio', 'Inicio'],
  ['#nosotros', 'Nosotros'],
  ['#actividades', 'Actividades'],
  ['#horarios', 'Horarios'],
  ['#planes', 'Planes'],
  ['#contacto', 'Contacto'],
] as const

function Btn({ href, children, dark, className }: { href: string; children: React.ReactNode; dark?: boolean; className?: string }) {
  const external = href.startsWith('http')
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      className={cx(
        'inline-block px-7 py-3 font-display text-[13px] font-semibold uppercase tracking-[0.08em] transition',
        dark ? 'bg-[#090909] text-white hover:bg-zinc-800' : 'bg-brand-400 text-[#090909] hover:bg-white',
        className,
      )}
    >
      {children}
    </a>
  )
}

function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cx('font-display text-3xl font-bold uppercase leading-tight text-white sm:text-[42px] sm:leading-[55px]', className)}>{children}</h2>
}

export function Home() {
  const { settings } = useSettings()
  const [plans, setPlans] = useState<Plan[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [slots, setSlots] = useState<ScheduleSlot[]>([])
  const [scrolled, setScrolled] = useState(false)
  const [menu, setMenu] = useState(false)
  const [photo, setPhoto] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('plans').select('*').eq('active', true).eq('show_public', true).order('sort'),
      supabase.from('activities').select('*').eq('active', true).order('sort'),
      supabase.from('activity_schedule').select('*').order('start_time'),
    ]).then(([p, a, s]) => {
      setPlans((p.data as Plan[]) ?? [])
      setActivities((a.data as Activity[]) ?? [])
      setSlots((s.data as ScheduleSlot[]) ?? [])
    })
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const gallery = settings?.gallery ?? []
  useEffect(() => {
    if (photo === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPhoto(null)
      if (e.key === 'ArrowRight') setPhoto((i) => (i === null ? i : (i + 1) % gallery.length))
      if (e.key === 'ArrowLeft') setPhoto((i) => (i === null ? i : (i - 1 + gallery.length) % gallery.length))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [photo, gallery.length])

  const name = settings?.gym_name ?? 'Gimnasio'
  const wa = whatsappLink(settings?.whatsapp, `¡Hola! Quiero empezar a entrenar en ${name}`)
  const joinHref = wa ?? '#contacto'
  const hours = (settings?.opening_hours ?? '')
    .split(/·|\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  const mapSrc = settings?.address ? `https://maps.google.com/maps?q=${encodeURIComponent(settings.address)}&z=15&output=embed` : null

  const logo = settings?.logo_url ? (
    <img src={settings.logo_url} alt={name} className="h-11 w-auto" />
  ) : (
    <span className="font-display text-lg font-extrabold uppercase tracking-tight text-white sm:text-xl">
      {name.split(' ').slice(0, -1).join(' ') || name} <span className="text-brand-400">{name.split(' ').length > 1 ? name.split(' ').at(-1) : ''}</span>
    </span>
  )

  return (
    <div className="font-body min-h-screen bg-[#090909] text-[#dddddd]">
      {/* ---------- barra de navegación ---------- */}
      <header className={cx('fixed inset-x-0 top-0 z-40 transition-colors', (scrolled || menu) && 'bg-[#090909]')}>
        <div className={cx('mx-auto flex max-w-6xl items-center justify-between border-b border-brand-400 px-5 transition-all', scrolled ? 'py-4' : 'py-6')}>
          <a href="#inicio" className="shrink-0">
            {logo}
          </a>
          <nav className="hidden items-center gap-7 lg:flex">
            {NAV.map(([href, label]) => (
              <a key={href} href={href} className="font-display text-sm font-bold uppercase tracking-[0.06em] text-white transition hover:text-brand-400">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-4">
            <span className="hidden sm:block">
              <Btn href={joinHref}>Asociate</Btn>
            </span>
            <button className="text-white lg:hidden" onClick={() => setMenu((m) => !m)} aria-label="Menú">
              {menu ? <X className="size-8" /> : <Menu className="size-8" />}
            </button>
          </div>
        </div>
        {menu && (
          <nav className="mx-auto flex max-w-6xl flex-col px-5 pb-6 lg:hidden">
            {NAV.map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMenu(false)} className="border-b border-zinc-800 py-3 font-display text-sm font-bold uppercase tracking-[0.06em] text-white">
                {label}
              </a>
            ))}
            <Btn href={joinHref} className="mt-5 text-center">
              Asociate
            </Btn>
          </nav>
        )}
      </header>

      {/* ---------- portada ---------- */}
      <section id="inicio" className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-10 pt-36 md:grid-cols-2 md:pt-52">
        <div className="md:-mt-9">
          <span className="mb-5 block font-display text-lg font-bold uppercase tracking-[0.04em] text-brand-400 sm:text-xl">
            {settings?.hero_kicker || 'Gimnasio y centro de fitness'}
          </span>
          <h1 className="font-display text-4xl font-bold uppercase leading-[1.15] text-white sm:text-[56px] sm:leading-[65px]">{settings?.tagline || name}</h1>
          <div className="mt-5 sm:pl-24">
            {settings?.hero_text && <p className="leading-7 tracking-[0.03em]">{settings.hero_text}</p>}
            <Btn href={joinHref} className="mt-6">
              Empezá hoy
            </Btn>
          </div>
        </div>
        <div>
          {settings?.hero_url ? (
            <img src={settings.hero_url} alt="" className="aspect-[722/869] w-full object-cover" />
          ) : (
            <div className="relative flex aspect-[722/869] w-full items-center justify-center overflow-hidden bg-zinc-900">
              <div className="absolute inset-6 border-2 border-brand-400" />
              <Dumbbell className="size-32 text-brand-400" strokeWidth={1.25} />
            </div>
          )}
        </div>
      </section>

      {/* ---------- nosotros ---------- */}
      <section id="nosotros" className="mx-auto max-w-6xl scroll-mt-24 px-5 pt-20 sm:pt-28">
        <SectionTitle className="mb-8 md:px-24">{settings?.about_title || 'Estamos para que entrenes mejor'}</SectionTitle>
        {settings?.about_image_url || settings?.about_image2_url ? (
          <div className="grid gap-10 md:grid-cols-12">
            <div className="md:col-span-7">
              {settings.about_image_url && <img src={settings.about_image_url} alt="" className="aspect-[10/9] w-full object-cover md:mt-16" />}
            </div>
            <div className="md:col-span-5">
              {settings.about_image2_url && <img src={settings.about_image2_url} alt="" className="mb-5 aspect-[10/9] w-full object-cover" />}
              {settings.about_text && <p className="leading-7 tracking-[0.03em]">{settings.about_text}</p>}
              <Btn href="#contacto" className="mt-5">
                Contactanos
              </Btn>
            </div>
          </div>
        ) : (
          <div className="md:px-24">
            {settings?.about_text && <p className="max-w-3xl leading-7 tracking-[0.03em]">{settings.about_text}</p>}
            <div className="mt-10 grid gap-5 sm:grid-cols-3">
              {[
                [Dumbbell, 'Sala completa', 'Máquinas, pesos libres y zona funcional'],
                [Users, 'Clases grupales', `${activities.length || 'Varias'} actividades por semana`],
                [Smartphone, 'Tu rutina en el celu', 'Con video de cada ejercicio'],
              ].map(([Icon, t, d]) => {
                const I = Icon as typeof Dumbbell
                return (
                  <div key={t as string} className="border-2 border-brand-400 p-6">
                    <I className="size-8 text-brand-400" />
                    <h4 className="mt-4 font-display text-lg font-semibold uppercase text-white">{t as string}</h4>
                    <p className="mt-1 text-sm leading-6">{d as string}</p>
                  </div>
                )
              })}
            </div>
            <Btn href="#contacto" className="mt-8">
              Contactanos
            </Btn>
          </div>
        )}
      </section>

      {/* ---------- actividades ---------- */}
      {activities.length > 0 && (
        <section id="actividades" className="mx-auto max-w-6xl scroll-mt-24 px-5 pt-24 sm:pt-32">
          <DividerTitle>
            Nuestras <br /> actividades
          </DividerTitle>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {activities.map((a) => (
              <article key={a.id} className="group">
                <div className="relative aspect-[10/9] overflow-hidden bg-zinc-900">
                  {a.image_url ? (
                    <img src={a.image_url} alt="" className="size-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
                  ) : (
                    <div className="flex size-full items-center justify-center">
                      <Dumbbell className="size-16 text-zinc-700" strokeWidth={1.25} />
                    </div>
                  )}
                  <span className="absolute bottom-0 left-0 h-1.5 w-full" style={{ background: a.color ?? '#edcc36' }} />
                </div>
                <h4 className="mt-5 font-display text-[22px] font-semibold uppercase text-white">{a.name}</h4>
                {a.description && <p className="mt-1 leading-7">{a.description}</p>}
                {a.instructor && <p className="mt-1 text-sm font-semibold uppercase tracking-wider text-brand-400">{a.instructor}</p>}
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ---------- galería ---------- */}
      {gallery.length > 0 && (
        <section id="galeria" className="mx-auto max-w-6xl px-5 pt-24 sm:pt-32">
          <DividerTitle>
            Mirá nuestro <br /> gimnasio
          </DividerTitle>
          <div className="grid grid-cols-2 gap-4 sm:gap-8 md:grid-cols-3">
            {gallery.map((g, i) => (
              <button key={g + i} onClick={() => setPhoto(i)} className="group block overflow-hidden">
                <img src={g} alt="" className="aspect-[10/9] w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ---------- horarios ---------- */}
      {slots.length > 0 && (
        <section id="horarios" className="mx-auto max-w-6xl scroll-mt-24 px-5 pt-24 sm:pt-32">
          <SectionTitle className="mb-10">
            Horarios de <br className="sm:hidden" />
            clases
          </SectionTitle>
          <WeekSchedule activities={activities} slots={slots} dark />
        </section>
      )}

      {/* ---------- planes ---------- */}
      {plans.length > 0 && (
        <section id="planes" className="mx-auto grid max-w-6xl scroll-mt-24 gap-8 px-5 pt-24 sm:pt-36 md:grid-cols-3">
          <div>
            <SectionTitle>
              Elegí tu <br /> plan
            </SectionTitle>
            <p className="leading-7 tracking-[0.03em]">Sin matrícula ni permanencia. Pagás en el gimnasio o online con Mercado Pago desde tu link de socio.</p>
          </div>
          {plans.map((p) => {
            const lines = (p.description ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
            const [intro, ...bullets] = lines.length > 1 ? lines : [lines[0], 'Musculación', 'Clases grupales', 'Rutina con videos']
            return (
              <div key={p.id} className="flex flex-col border-2 border-brand-400 p-8 sm:p-10">
                <h4 className="font-display text-[22px] font-semibold uppercase text-white">{p.name}</h4>
                {intro && <p className="mt-1 leading-7">{intro}</p>}
                <ul className="mb-8 mt-4 flex-1">
                  {bullets.map((b) => (
                    <li key={b} className="flex items-center gap-4 py-2">
                      <CheckCircle2 className="size-4 shrink-0 text-brand-400" /> {b}
                    </li>
                  ))}
                </ul>
                <p className="font-display text-[42px] font-bold leading-none text-white">{fmtMoney(p.price)}</p>
                <p className="mb-6 mt-1 text-sm">
                  {p.duration_days === 30 ? 'por mes' : p.duration_days === 7 ? 'por semana' : `por ${p.duration_days} días`}
                </p>
                <Btn href={whatsappLink(settings?.whatsapp, `¡Hola! Me interesa el plan ${p.name}`) ?? '#contacto'} className="self-start">
                  Lo quiero
                </Btn>
              </div>
            )
          })}
        </section>
      )}

      {/* ---------- contacto ---------- */}
      <section id="contacto" className="mx-auto max-w-6xl scroll-mt-24 px-5 pt-24 sm:pt-32">
        {mapSrc && (
          <iframe
            src={mapSrc}
            title="Mapa"
            loading="lazy"
            className="mb-10 h-[360px] w-full border-0 grayscale invert-[.9] sm:h-[510px]"
            referrerPolicy="no-referrer-when-downgrade"
          />
        )}
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <SectionTitle>Contacto</SectionTitle>
            <p className="leading-7 tracking-[0.03em]">Escribinos, vení a conocer el gimnasio y coordinamos tu primera clase.</p>
            <ul className="mt-6 space-y-5">
              {settings?.whatsapp && (
                <ContactItem icon={MessageCircle} title="WhatsApp" href={wa ?? undefined}>
                  {settings.whatsapp}
                </ContactItem>
              )}
              {settings?.phone && (
                <ContactItem icon={Phone} title="Teléfono" href={`tel:${settings.phone.replace(/\s/g, '')}`}>
                  {settings.phone}
                </ContactItem>
              )}
              {settings?.email && (
                <ContactItem icon={Mail} title="Email" href={`mailto:${settings.email}`}>
                  {settings.email}
                </ContactItem>
              )}
              {settings?.address && (
                <ContactItem icon={MapPin} title="Dirección" href={`https://maps.google.com/?q=${encodeURIComponent(settings.address)}`}>
                  {settings.address}
                </ContactItem>
              )}
              {settings?.instagram && (
                <ContactItem icon={AtSign} title="Instagram" href={`https://instagram.com/${settings.instagram.replace('@', '')}`}>
                  @{settings.instagram.replace('@', '')}
                </ContactItem>
              )}
            </ul>
          </div>
          <div className="flex min-h-72 flex-col items-center justify-center bg-brand-400 p-10 text-center text-[#090909]" style={{ border: '25px double #090909', outline: '6px solid #edcc36' }}>
            <Clock className="mb-4 size-9" />
            {hours.length ? (
              hours.map((h, i) => {
                const [day, ...rest] = h.split(/\s(?=\d)/)
                return (
                  <div key={i} className="mb-5 last:mb-0">
                    <h3 className="font-display text-2xl font-bold uppercase sm:text-[28px]">{day}</h3>
                    {rest.length > 0 && <span className="text-xl">{rest.join(' ')}</span>}
                  </div>
                )
              })
            ) : (
              <h3 className="font-display text-2xl font-bold uppercase">Consultá horarios</h3>
            )}
          </div>
        </div>
      </section>

      {/* ---------- pie ---------- */}
      <footer className="mt-24 bg-brand-400 py-8 text-[#090909] sm:mt-36">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 text-sm font-medium sm:flex-row">
          <div className="flex items-center gap-4">
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp">
                <MessageCircle className="size-5" />
              </a>
            )}
            {settings?.instagram && (
              <a href={`https://instagram.com/${settings.instagram.replace('@', '')}`} target="_blank" rel="noreferrer" aria-label="Instagram">
                <AtSign className="size-5" />
              </a>
            )}
            {settings?.email && (
              <a href={`mailto:${settings.email}`} aria-label="Email">
                <Mail className="size-5" />
              </a>
            )}
          </div>
          <p>
            © {new Date().getFullYear()} {name} ·{' '}
            <Link to="/login" className="underline-offset-2 hover:underline">
              Acceso staff
            </Link>
          </p>
        </div>
      </footer>

      {/* ---------- visor de fotos ---------- */}
      {photo !== null && gallery[photo] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4" onClick={() => setPhoto(null)}>
          <img src={gallery[photo]} alt="" className="max-h-[88vh] max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
          <button className="absolute right-4 top-4 text-white" onClick={() => setPhoto(null)} aria-label="Cerrar">
            <X className="size-8" />
          </button>
          {gallery.length > 1 && (
            <>
              <button
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 text-brand-400"
                onClick={(e) => (e.stopPropagation(), setPhoto((photo - 1 + gallery.length) % gallery.length))}
                aria-label="Anterior"
              >
                <ChevronLeft className="size-10" />
              </button>
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-brand-400"
                onClick={(e) => (e.stopPropagation(), setPhoto((photo + 1) % gallery.length))}
                aria-label="Siguiente"
              >
                <ChevronRight className="size-10" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Título centrado con la línea amarilla detrás (como "See our gallery gym" de la plantilla). */
function DividerTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mb-12 text-center">
      <div className="absolute inset-x-0 top-1/2 h-[5px] -translate-y-1/2 bg-brand-400" />
      <h2 className="relative inline-block bg-[#090909] px-6 font-display text-3xl font-bold uppercase leading-tight text-white sm:text-[42px] sm:leading-[55px]">{children}</h2>
    </div>
  )
}

function ContactItem({ icon: Icon, title, href, children }: { icon: typeof Phone; title: string; href?: string; children: React.ReactNode }) {
  const body = (
    <>
      <span className="flex size-[60px] shrink-0 items-center justify-center bg-brand-400 text-[#090909]">
        <Icon className="size-6" />
      </span>
      <span>
        <span className="mt-2 block font-display text-xl font-semibold uppercase text-white">{title}</span>
        <span className="text-sm">{children}</span>
      </span>
    </>
  )
  return (
    <li>
      {href ? (
        <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="flex gap-5 transition hover:opacity-80">
          {body}
        </a>
      ) : (
        <div className="flex gap-5">{body}</div>
      )}
    </li>
  )
}
