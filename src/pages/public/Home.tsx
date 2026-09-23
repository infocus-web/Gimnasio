import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity as ActivityIcon, ArrowRight, Clock, AtSign, MapPin, MessageCircle, Phone } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Activity, Plan, ScheduleSlot } from '../../lib/types'
import { fmtMoney, whatsappLink } from '../../lib/format'
import { useSettings } from '../../lib/auth'
import { WeekSchedule } from '../../components/WeekSchedule'

export function Home() {
  const { settings } = useSettings()
  const [plans, setPlans] = useState<Plan[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [slots, setSlots] = useState<ScheduleSlot[]>([])

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
  }, [])

  const name = settings?.gym_name ?? 'Gimnasio'
  const wa = whatsappLink(settings?.whatsapp, `Hola! Quiero info para empezar a entrenar en ${name}`)

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* barra superior */}
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <div className="flex items-center gap-2.5">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="" className="size-10 rounded-xl object-cover" />
            ) : (
              <div className="flex size-10 items-center justify-center rounded-xl bg-brand-400 text-zinc-950">
                <ActivityIcon className="size-5" />
              </div>
            )}
            <span className="font-display text-xl font-bold uppercase tracking-wide">{name}</span>
          </div>
          <nav className="hidden items-center gap-7 text-sm text-zinc-300 md:flex">
            <a href="#actividades" className="hover:text-white">Actividades</a>
            <a href="#horarios" className="hover:text-white">Horarios</a>
            <a href="#planes" className="hover:text-white">Planes</a>
            <a href="#contacto" className="hover:text-white">Contacto</a>
          </nav>
        </div>
      </header>

      {/* portada */}
      <section className="relative flex min-h-[88vh] items-end overflow-hidden">
        {settings?.hero_url ? (
          <img src={settings.hero_url} alt="" className="absolute inset-0 size-full object-cover opacity-50" />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(163,230,53,0.25),transparent_55%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
        <div className="relative mx-auto w-full max-w-6xl px-5 pb-20">
          <p className="mb-4 inline-block rounded-full border border-brand-400/40 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-brand-400">
            {settings?.opening_hours ?? 'Abierto todos los días'}
          </p>
          <h1 className="max-w-3xl font-display text-6xl font-bold uppercase leading-[0.9] sm:text-8xl">{settings?.tagline || name}</h1>
          <div className="mt-8 flex flex-wrap gap-3">
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-brand-400 px-6 py-3.5 font-semibold text-zinc-950 transition hover:bg-brand-300">
                <MessageCircle className="size-5" /> Quiero empezar
              </a>
            )}
            <a href="#planes" className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-6 py-3.5 font-semibold transition hover:border-zinc-500">
              Ver planes <ArrowRight className="size-4" />
            </a>
          </div>
        </div>
      </section>

      {/* actividades */}
      {activities.length > 0 && (
        <section id="actividades" className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="font-display text-5xl font-bold uppercase">Actividades</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activities.map((a) => (
              <article key={a.id} className="group overflow-hidden rounded-2xl bg-zinc-900">
                {a.image_url ? (
                  <img src={a.image_url} alt="" className="aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-105" />
                ) : (
                  <div className="aspect-[16/10] w-full" style={{ background: `linear-gradient(135deg, ${a.color ?? '#84cc16'}55, transparent)` }} />
                )}
                <div className="p-5">
                  <div className="mb-2 h-1 w-10 rounded" style={{ background: a.color ?? '#84cc16' }} />
                  <h3 className="font-display text-2xl font-bold uppercase">{a.name}</h3>
                  {a.description && <p className="mt-1 text-sm text-zinc-400">{a.description}</p>}
                  {a.instructor && <p className="mt-3 text-xs uppercase tracking-wider text-zinc-500">{a.instructor}</p>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* horarios */}
      {slots.length > 0 && (
        <section id="horarios" className="border-y border-zinc-900 bg-zinc-900/40">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <h2 className="font-display text-5xl font-bold uppercase">Horarios de clases</h2>
            <div className="mt-10">
              <WeekSchedule activities={activities} slots={slots} dark />
            </div>
          </div>
        </section>
      )}

      {/* planes */}
      {plans.length > 0 && (
        <section id="planes" className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="font-display text-5xl font-bold uppercase">Planes</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {plans.map((p, i) => (
              <div key={p.id} className={`flex flex-col rounded-2xl p-7 ${i === 0 ? 'bg-brand-400 text-zinc-950' : 'bg-zinc-900'}`}>
                <h3 className="font-display text-2xl font-bold uppercase">{p.name}</h3>
                <p className="mt-4 font-display text-5xl font-bold tabular-nums">{fmtMoney(p.price)}</p>
                <p className={`text-sm ${i === 0 ? 'text-zinc-800' : 'text-zinc-500'}`}>
                  {p.duration_days === 30 ? 'por mes' : p.duration_days === 7 ? 'por semana' : `por ${p.duration_days} días`}
                </p>
                {p.description && <p className={`mt-4 flex-1 text-sm ${i === 0 ? 'text-zinc-800' : 'text-zinc-400'}`}>{p.description}</p>}
                {wa && (
                  <a
                    href={whatsappLink(settings?.whatsapp, `Hola! Me interesa el plan ${p.name}`) ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className={`mt-6 rounded-xl py-3 text-center text-sm font-semibold ${i === 0 ? 'bg-zinc-950 text-white' : 'bg-white/10 hover:bg-white/15'}`}
                  >
                    Consultar
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* contacto */}
      <section id="contacto" className="border-t border-zinc-900">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-2">
          <div>
            <h2 className="font-display text-5xl font-bold uppercase">Vení a entrenar</h2>
            <p className="mt-3 max-w-md text-zinc-400">Escribinos y coordinamos tu primera clase.</p>
          </div>
          <ul className="space-y-4 text-zinc-300">
            {settings?.address && (
              <li className="flex gap-3">
                <MapPin className="size-5 shrink-0 text-brand-400" />
                <a href={`https://maps.google.com/?q=${encodeURIComponent(settings.address)}`} target="_blank" rel="noreferrer" className="hover:text-white">
                  {settings.address}
                </a>
              </li>
            )}
            {settings?.opening_hours && (
              <li className="flex gap-3">
                <Clock className="size-5 shrink-0 text-brand-400" /> {settings.opening_hours}
              </li>
            )}
            {settings?.whatsapp && wa && (
              <li className="flex gap-3">
                <MessageCircle className="size-5 shrink-0 text-brand-400" />
                <a href={wa} target="_blank" rel="noreferrer" className="hover:text-white">
                  {settings.whatsapp}
                </a>
              </li>
            )}
            {settings?.phone && (
              <li className="flex gap-3">
                <Phone className="size-5 shrink-0 text-brand-400" /> {settings.phone}
              </li>
            )}
            {settings?.instagram && (
              <li className="flex gap-3">
                <AtSign className="size-5 shrink-0 text-brand-400" />
                <a href={`https://instagram.com/${settings.instagram.replace('@', '')}`} target="_blank" rel="noreferrer" className="hover:text-white">
                  @{settings.instagram.replace('@', '')}
                </a>
              </li>
            )}
          </ul>
        </div>
      </section>

      <footer className="border-t border-zinc-900 py-8 text-center text-xs text-zinc-600">
        © {new Date().getFullYear()} {name} ·{' '}
        <Link to="/login" className="hover:text-zinc-400">
          Acceso staff
        </Link>
      </footer>
    </div>
  )
}
