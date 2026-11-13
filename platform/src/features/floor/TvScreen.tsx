'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Users, CalendarClock, Trophy, Cake, Megaphone, WifiOff } from 'lucide-react'
import type { TvFeed } from './types'
import { PromoSlide } from '@/features/screens/PromoSlide'
import { BoardScreen, type LiveBoard } from './BoardScreen'
import { fitsScreen, promoDurationMs, type PromoSlideData } from '@/features/screens/promo'

const TZ = 'America/Argentina/Buenos_Aires'
const ROTATE_MS = 15_000
const ADS_REFRESH_MS = 5 * 60_000
const REFRESH_MS = 60_000
const RETRY_MS = 15_000
const RELOAD_MS = 6 * 60 * 60_000 // cada 6 h recarga la página (toma cambios y libera memoria)

function load(key: string) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
function save(key: string, value: string | null) {
  try {
    if (value) window.localStorage.setItem(key, value)
    else window.localStorage.removeItem(key)
  } catch {
    /* sin almacenamiento: habrá que abrir el link otra vez después de un corte */
  }
}

const time = (iso: string | Date, tz: string) =>
  new Intl.DateTimeFormat('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))

/** 'ad:<n>' = publicidad n° n cargada en Panel → Pantallas */
type Slide = 'now' | 'classes' | 'ranking' | 'birthdays' | 'message' | `ad:${number}`

const LEVEL: Record<string, string> = {
  quiet: 'Tranquilo',
  normal: 'Movimiento normal',
  full: 'Muy lleno',
  closed: 'Cerrado',
}

export function TvScreen({ slug }: { slug: string }) {
  const storageKey = `tv:${slug}`
  const [token, setToken] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [feed, setFeed] = useState<TvFeed | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [offline, setOffline] = useState(false)
  const [now, setNow] = useState<Date | null>(null)
  const [index, setIndex] = useState(0)
  const [ads, setAds] = useState<PromoSlideData[]>([])
  const [live, setLive] = useState<LiveBoard | null>(null)
  const [offsetMs, setOffsetMs] = useState(0)

  // Clave: llega una vez en el link (#k=… o ?k=…) y queda guardada en el TV
  useEffect(() => {
    const url = new URL(window.location.href)
    const fromLink = new URLSearchParams(url.hash.slice(1)).get('k') ?? url.searchParams.get('k')
    if (fromLink) {
      save(storageKey, fromLink)
      window.history.replaceState(null, '', url.pathname)
    }
    setToken(fromLink ?? load(storageKey))
    setReady(true)
  }, [storageKey])

  // Reloj
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 5_000)
    return () => clearInterval(t)
  }, [])

  const fetchFeed = useCallback(async (): Promise<boolean> => {
    if (!token) return false
    try {
      const res = await fetch(`/${slug}/tv/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ k: token }),
        cache: 'no-store',
      })
      if (res.status === 401) {
        save(storageKey, null)
        setToken(null)
        setFeed(null)
        return true
      }
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as TvFeed
      setFeed(data)
      setUpdatedAt(new Date())
      setOffline(false)
      return true
    } catch {
      setOffline(true)
      return false
    }
  }, [token, slug, storageKey])

  // Datos: cada minuto; si se cortó internet, reintenta cada 15 s y sigue mostrando lo último
  useEffect(() => {
    if (!token) return
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    const run = async () => {
      const ok = await fetchFeed()
      if (!stop) timer = setTimeout(run, ok ? REFRESH_MS : RETRY_MS)
    }
    void run()
    const onOnline = () => {
      clearTimeout(timer)
      void run()
    }
    window.addEventListener('online', onOnline)
    return () => {
      stop = true
      clearTimeout(timer)
      window.removeEventListener('online', onOnline)
    }
  }, [token, fetchFeed])

  // Publicidad (la misma de la tablet del molinete): se lee al abrir y cada 5 minutos
  useEffect(() => {
    let stop = false
    const loadAds = async () => {
      try {
        const r = await fetch(`/api/access/turnstile/slides?org=${encodeURIComponent(slug)}`, { cache: 'no-store' })
        if (!r.ok) return
        const j = (await r.json()) as { slides?: PromoSlideData[] }
        if (stop || !Array.isArray(j.slides)) return
        // Los televisores pasan las horizontales (y las que son para las dos pantallas)
        const mine = j.slides.filter((x) => x && typeof x.url === 'string' && fitsScreen(x, 'horizontal'))
        for (const x of mine) new window.Image().src = x.url // precarga
        setAds((prev) => (JSON.stringify(prev) === JSON.stringify(mine) ? prev : mine))
      } catch {
        /* sin conexión: sigue con las que tenía */
      }
    }
    void loadAds()
    const t = setInterval(loadAds, ADS_REFRESH_MS)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [slug])

  // Pizarra del profe en vivo: se pregunta cada 3 segundos (el temporizador lo maneja desde su celular)
  useEffect(() => {
    if (!token) return
    let stop = false
    let last = ''
    const poll = async () => {
      try {
        const sent = Date.now()
        const r = await fetch(`/${slug}/tv/live`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ k: token }),
          cache: 'no-store',
        })
        if (!r.ok || stop) return
        const j = (await r.json()) as { server_now?: string; live?: LiveBoard | null }
        if (j.server_now) setOffsetMs(new Date(j.server_now).getTime() - (sent + Date.now()) / 2)
        const key = JSON.stringify(j.live ?? null)
        if (key !== last) {
          last = key
          setLive(j.live ?? null)
        }
      } catch {
        /* sin conexión: sigue mostrando lo último */
      }
    }
    void poll()
    const t = setInterval(poll, 3000)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [token, slug])

  // Recarga preventiva (solo si hay internet, para no quedar en una página de error del navegador)
  useEffect(() => {
    const t = setInterval(() => {
      if (navigator.onLine) window.location.reload()
    }, RELOAD_MS)
    return () => clearInterval(t)
  }, [])

  const tz = feed?.timezone || TZ
  const upcoming = useMemo(() => (feed?.classes ?? []).filter((c) => !now || new Date(c.ends_at) > now), [feed, now])

  const slides = useMemo<Slide[]>(() => {
    if (!feed) return []
    const list: Slide[] = ['now']
    if (upcoming.length) list.push('classes')
    if (feed.ranking_enabled && feed.ranking?.length) list.push('ranking')
    if (feed.birthdays?.length) list.push('birthdays')
    if (feed.message) list.push('message')
    // Publicidad intercalada: después de cada pantalla de información va una imagen
    if (!ads.length) return list
    const mixed: Slide[] = []
    let a = 0
    for (const s of list) {
      mixed.push(s)
      mixed.push(`ad:${a % ads.length}`)
      a++
    }
    // Si hay más imágenes que pantallas de información, las que sobran van juntas al final
    while (a < ads.length) mixed.push(`ad:${a++}`)
    return mixed
  }, [feed, upcoming.length, ads])

  const slide = slides[index % Math.max(slides.length, 1)]
  const ad = slide?.startsWith('ad:') ? (ads[Number(slide.slice(3))] ?? null) : null

  // Cada pantalla dura lo suyo: información 15 s, publicidad 8 s
  useEffect(() => {
    if (slides.length <= 1) return
    const t = setTimeout(() => setIndex((i) => (i + 1) % slides.length), ad ? promoDurationMs(ad) : ROTATE_MS)
    return () => clearTimeout(t)
  }, [index, slides.length, ad])

  if (!ready) return <main className="min-h-dvh bg-black" />

  if (!token) {
    return (
      <TvPairScreen
        slug={slug}
        onPaired={(k) => {
          save(storageKey, k)
          setToken(k)
        }}
      />
    )
  }

  return (
    <main className="flex h-dvh cursor-none flex-col overflow-hidden bg-black text-white select-none">
      <header className="flex items-center justify-between border-b border-zinc-900 px-[3vw] py-[2vh]">
        <p className="text-[2vw] font-black uppercase tracking-[0.2em] text-[#edcc36]">{feed?.gym ?? 'Evolution Fitness'}</p>
        <div className="text-right">
          <p className="text-[4.5vw] font-black leading-none tabular-nums">{now ? time(now, tz) : '--:--'}</p>
          <p className="text-[1.3vw] capitalize text-zinc-400">
            {now ? new Intl.DateTimeFormat('es-AR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(now) : ''}
          </p>
        </div>
      </header>

      <section className="relative flex-1 px-[4vw] py-[4vh]" aria-live="polite">
        {!feed ? (
          <div className="grid h-full place-items-center text-[2.5vw] text-zinc-500">{offline ? 'Sin conexión. Reintentando…' : 'Cargando…'}</div>
        ) : (
          <div key={slide} className="h-full animate-[tvfade_0.8s_ease-out]">
            {slide === 'now' && <NowSlide feed={feed} next={upcoming[0]} tz={tz} />}
            {slide === 'classes' && <ClassesSlide classes={upcoming} tz={tz} />}
            {slide === 'ranking' && <RankingSlide ranking={feed.ranking ?? []} />}
            {slide === 'birthdays' && <BirthdaysSlide names={feed.birthdays ?? []} />}
            {slide === 'message' && <MessageSlide text={feed.message ?? ''} />}
          </div>
        )}
      </section>

      {live && <BoardScreen board={live} offsetMs={offsetMs} />}

      {ad && !live && (
        // Publicidad a pantalla completa (tapa el encabezado y el pie)
        <div key={`${index}-${slide}`} className="fixed inset-0 z-10 bg-black">
          <PromoSlide slide={ad} />
        </div>
      )}

      <footer className="flex items-center justify-between px-[3vw] pb-[2.5vh]">
        <div className="flex gap-[0.8vw]" aria-hidden="true">
          {slides.length > 1 &&
            slides.map((s, i) => (
              <span key={`${s}-${i}`} className={`h-[0.8vh] w-[3vw] rounded-full ${i === index % slides.length ? 'bg-[#edcc36]' : 'bg-zinc-800'}`} />
            ))}
        </div>
        {offline && feed && (
          <p className="flex items-center gap-[0.6vw] text-[1.2vw] text-amber-300">
            <WifiOff className="h-[1.6vw] w-[1.6vw]" aria-hidden="true" /> Sin conexión · datos de las {updatedAt ? time(updatedAt, tz) : '--:--'}
          </p>
        )}
      </footer>
      <style>{`@keyframes tvfade { from { opacity: 0; transform: translateY(1.5vh) } to { opacity: 1; transform: none } }`}</style>
    </main>
  )
}

function SlideTitle({ icon: Icon, children }: { icon: typeof Users; children: React.ReactNode }) {
  return (
    <h2 className="mb-[4vh] flex items-center gap-[1.2vw] text-[3.2vw] font-black">
      <Icon className="h-[3.2vw] w-[3.2vw] text-[#edcc36]" aria-hidden="true" /> {children}
    </h2>
  )
}

function NowSlide({ feed, next, tz }: { feed: TvFeed; next?: NonNullable<TvFeed['classes']>[number]; tz: string }) {
  const n = feed.occupancy ?? 0
  return (
    <div className="grid h-full grid-cols-2 items-center gap-[4vw]">
      <div>
        <p className="flex items-center gap-[1vw] text-[2.4vw] font-bold text-zinc-300">
          <Users className="h-[2.6vw] w-[2.6vw] text-[#edcc36]" aria-hidden="true" /> Entrenando ahora
        </p>
        <p className="text-[16vw] font-black leading-none tabular-nums text-[#edcc36]">{n}</p>
        <p className="text-[2.2vw] text-zinc-400">
          {feed.occupancy_level ? LEVEL[feed.occupancy_level] ?? '' : n === 1 ? 'persona en el gimnasio' : 'personas en el gimnasio'}
        </p>
      </div>
      <div className="rounded-[2vw] border border-zinc-800 bg-zinc-950 p-[3vw]">
        {next ? (
          <>
            <p className="text-[1.8vw] font-bold uppercase tracking-widest text-zinc-500">Próxima clase</p>
            <p className="mt-[1vh] text-[6vw] font-black leading-none tabular-nums">{time(next.starts_at, tz)}</p>
            <p className="mt-[1.5vh] text-[3.2vw] font-black" style={{ color: next.color || '#edcc36' }}>
              {next.name}
            </p>
            <p className="text-[2vw] text-zinc-400">
              {next.instructor} · {next.room}
            </p>
          </>
        ) : (
          <p className="text-[2.6vw] font-bold text-zinc-400">No quedan clases por hoy. ¡A darle a la sala!</p>
        )}
      </div>
    </div>
  )
}

function ClassesSlide({ classes, tz }: { classes: NonNullable<TvFeed['classes']>; tz: string }) {
  return (
    <div>
      <SlideTitle icon={CalendarClock}>Clases de hoy</SlideTitle>
      <ul className="space-y-[2.2vh]">
        {classes.slice(0, 5).map((c) => {
          const free = Math.max(c.capacity - c.booked, 0)
          return (
            <li key={c.starts_at + c.name} className="flex items-center gap-[2.5vw] border-b border-zinc-900 pb-[2vh]">
              <span className="w-[11vw] text-[4vw] font-black tabular-nums">{time(c.starts_at, tz)}</span>
              <span className="h-[5vh] w-[0.6vw] rounded-full" style={{ backgroundColor: c.color || '#edcc36' }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[3vw] font-black">{c.name}</span>
                <span className="block truncate text-[1.8vw] text-zinc-400">
                  {c.instructor} · {c.room}
                </span>
              </span>
              <span className={`text-right text-[2vw] font-bold ${free === 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                {free === 0 ? 'Completa' : `${free} ${free === 1 ? 'lugar' : 'lugares'}`}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function RankingSlide({ ranking }: { ranking: { name: string; days: number }[] }) {
  const month = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, month: 'long' }).format(new Date())
  return (
    <div>
      <SlideTitle icon={Trophy}>Los más constantes de {month}</SlideTitle>
      <ol className="grid grid-flow-col grid-cols-2 grid-rows-5 gap-x-[5vw] gap-y-[2vh]">
        {ranking.slice(0, 10).map((r, i) => (
          <li key={`${r.name}-${i}`} className="flex items-center gap-[1.5vw] text-[2.6vw]">
            <span
              className={`grid h-[4.5vw] w-[4.5vw] shrink-0 place-items-center rounded-full font-black ${
                i === 0 ? 'bg-[#edcc36] text-black' : i < 3 ? 'bg-zinc-200 text-black' : 'bg-zinc-900 text-zinc-300'
              }`}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate font-bold">{r.name}</span>
            <span className="tabular-nums text-zinc-400">
              {r.days} {r.days === 1 ? 'día' : 'días'}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function BirthdaysSlide({ names }: { names: string[] }) {
  return (
    <div className="grid h-full place-items-center text-center">
      <div>
        <Cake className="mx-auto h-[8vw] w-[8vw] text-[#edcc36]" aria-hidden="true" />
        <p className="mt-[2vh] text-[5vw] font-black">¡Feliz cumpleaños!</p>
        <p className="mt-[2vh] text-[3.4vw] font-bold leading-snug text-[#f5e38a]">{names.slice(0, 8).join(' · ')}</p>
      </div>
    </div>
  )
}

function MessageSlide({ text }: { text: string }) {
  return (
    <div className="grid h-full place-items-center text-center">
      <div className="max-w-[80vw]">
        <Megaphone className="mx-auto h-[6vw] w-[6vw] text-[#edcc36]" aria-hidden="true" />
        <p className={`mt-[3vh] font-black leading-tight ${text.length > 120 ? 'text-[3.4vw]' : 'text-[4.6vw]'}`}>{text}</p>
      </div>
    </div>
  )
}

/**
 * TV sin vincular: muestra un código de 6 números grande. El administrador lo escribe en
 * Panel → Pantallas y la TV queda vinculada sola (pregunta cada 3 segundos).
 */
function TvPairScreen({ slug, onPaired }: { slug: string; onPaired: (token: string) => void }) {
  const [code, setCode] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  // La pantalla de arriba se redibuja seguido (reloj): el aviso de "vinculada" va por referencia
  // para no pedir un código nuevo en cada redibujo
  const paired = useRef(onPaired)
  paired.current = onPaired

  useEffect(() => {
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    let nonce: string | null = null
    const post = async (body: object) => {
      const r = await fetch(`/${slug}/tv/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      })
      return (await r.json()) as { status?: string; code?: string; nonce?: string; token?: string }
    }
    const tick = async () => {
      try {
        if (!nonce) {
          const r = await post({})
          if (stop) return
          if (r.status === 'ok' && r.code && r.nonce) {
            nonce = r.nonce
            setCode(r.code)
            setFailed(false)
          } else setFailed(true)
        } else {
          const r = await post({ nonce })
          if (stop) return
          if (r.status === 'ok' && r.token) return paired.current(r.token)
          if (r.status === 'expired') nonce = null // venció: pide otro código
        }
      } catch {
        if (!stop) setFailed(true)
      }
      if (!stop) timer = setTimeout(tick, 3000)
    }
    void tick()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [slug])

  return (
    <main className="grid min-h-dvh cursor-none place-items-center bg-black p-[4vw] text-center text-white">
      <div className="space-y-[4vh]">
        <p className="text-[2.6vw] font-black uppercase tracking-[0.2em] text-[#edcc36]">Vincular esta TV</p>
        <p className="font-mono text-[11vw] font-black leading-none tracking-[0.15em] tabular-nums" aria-live="polite">
          {code ? `${code.slice(0, 3)} ${code.slice(3)}` : '··· ···'}
        </p>
        <p className="mx-auto max-w-[70vw] text-[2vw] leading-snug text-zinc-300">
          En el panel entrá a <strong className="text-white">Pantallas</strong> y escribí este código en{' '}
          <strong className="text-white">“TV de la sala”</strong>.
        </p>
        {failed && <p className="text-[1.6vw] text-amber-300">Sin conexión. Reintentando…</p>}
      </div>
    </main>
  )
}
