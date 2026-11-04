'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Megaphone, Users } from 'lucide-react'
import type { PublicToday, PublicTodayClass } from './today-types'

const REFRESH_MS = 60_000
const TZ = 'America/Argentina/Buenos_Aires'

const LEVEL: Record<string, { label: string; dot: string }> = {
  quiet: { label: 'Tranquilo', dot: 'bg-emerald-400' },
  normal: { label: 'Movimiento normal', dot: 'bg-brand' },
  full: { label: 'Muy lleno', dot: 'bg-orange-500' },
  closed: { label: 'Cerrado ahora', dot: 'bg-white/40' },
}

const hhmm = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))

function spotsLabel(c: PublicTodayClass) {
  if (c.spots <= 0) return { text: 'Completa', tone: 'text-white/45' }
  if (c.spots <= Math.max(2, Math.ceil(c.capacity * 0.2))) return { text: `¡Últimos ${c.spots} lugares!`, tone: 'text-orange-400' }
  return { text: `${c.spots} lugares libres`, tone: 'text-emerald-400' }
}

/**
 * Bloque "Hoy en <gimnasio>" de la web pública: mensaje, gente ahora y clases que siguen hoy.
 * Arranca con lo que trajo el servidor y se actualiza solo cada minuto.
 */
export function TodayLive({
  slug,
  title,
  initial,
  bookHref,
  signupHref,
}: {
  slug: string
  title: string
  initial: PublicToday | null
  bookHref: string
  signupHref: string
}) {
  const [data, setData] = useState<PublicToday | null>(initial)
  const [now, setNow] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/${slug}/hoy`, { cache: 'no-store' })
      if (!res.ok) return
      setData((await res.json()) as PublicToday)
    } catch {
      /* sin internet: queda lo último */
    }
    setNow(new Date())
  }, [slug])

  useEffect(() => {
    if (initial?.status === 'off') return
    setNow(new Date())
    void refresh()
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, REFRESH_MS)
    return () => clearInterval(t)
  }, [initial?.status, refresh])

  const tz = data?.timezone || TZ
  const classes = useMemo(
    () => (data?.classes ?? []).filter((c) => !now || new Date(c.ends_at) > now),
    [data, now],
  )

  if (!data || data.status !== 'ok') return null
  const level = data.level ? LEVEL[data.level] : null

  return (
    <section id="hoy" aria-labelledby="hoy-title" className="scroll-mt-4 border-b border-white/10 bg-[#0e0e0e] py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-brand">
              <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand" />
              </span>
              En vivo
            </p>
            <h2 id="hoy-title" className="mt-2 font-display text-[clamp(2.1rem,4.6vw,3.75rem)] font-bold leading-[1.05] tracking-[-0.03em] text-white">
              {title}
            </h2>
          </div>
          {level && (
            <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black px-4 py-3">
              <Users className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold text-white/50">Ahora en la sala</p>
                <p className="flex items-center gap-2 text-[15px] font-bold text-white">
                  <span className={`h-2 w-2 rounded-full ${level.dot}`} aria-hidden="true" />
                  {level.label}
                  {data.level !== 'closed' && typeof data.people === 'number' && (
                    <span className="font-semibold text-white/55">· {data.people} {data.people === 1 ? 'persona' : 'personas'}</span>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>

        {data.message && (
          <div className="mt-8 flex items-start gap-4 rounded-lg bg-brand p-5 text-black sm:p-6">
            <Megaphone className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
            <p className="whitespace-pre-line text-lg font-bold leading-snug sm:text-xl">{data.message}</p>
          </div>
        )}

        <h3 className="mt-10 text-sm font-semibold uppercase tracking-wider text-white/50">Clases que siguen hoy</h3>
        {classes.length === 0 ? (
          <p className="mt-4 text-white/65">
            Por hoy no quedan clases.{' '}
            <a href="#horarios" className="font-semibold text-brand underline-offset-4 hover:underline">
              Mirá la grilla de la semana
            </a>
            .
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {classes.map((c) => {
              const live = now && new Date(c.starts_at) <= now
              const s = spotsLabel(c)
              const full = c.spots <= 0
              return (
                <li
                  key={`${c.starts_at}-${c.name}-${c.room}`}
                  className="flex flex-col rounded-lg border border-white/10 bg-black p-5"
                  style={{ borderTopColor: c.color || undefined, borderTopWidth: 3 }}
                >
                  <p className="flex items-center gap-2 text-sm font-semibold tabular-nums text-white/60">
                    {hhmm(c.starts_at, tz)}–{hhmm(c.ends_at, tz)}
                    {live && <span className="rounded bg-brand px-1.5 py-0.5 text-[11px] font-bold uppercase text-black">En curso</span>}
                  </p>
                  <p className="mt-1 font-display text-2xl font-bold leading-tight tracking-[-0.02em] text-white">{c.name}</p>
                  <p className="mt-1 text-sm text-white/50">
                    {c.instructor} · {c.room}
                  </p>
                  {!live && <p className={`mt-4 text-sm font-bold ${s.tone}`}>{s.text}</p>}
                  {!full && !live && (
                    <a
                      href={bookHref}
                      className="mt-4 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-brand px-4 text-[15px] font-bold text-black transition-colors hover:bg-[#f5db5c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                    >
                      Anotarme <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <p className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-white/65">
          ¿Todavía no sos socio?
          <a href={signupHref} className="inline-flex items-center gap-1.5 font-semibold text-brand underline-offset-4 hover:underline">
            Inscribite online y empezá hoy <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </p>
      </div>
    </section>
  )
}
