'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { CheckCircle2, XCircle, AlertTriangle, QrCode, SwitchCamera, Wifi, WifiOff, Maximize, Users } from 'lucide-react'
import { sound } from '@/utils/audio'
import { OCCUPANCY, PASS_DENIED, type Occupancy } from '@/features/access-plus/labels'
import { formatWindowsShort } from '@/features/access-plus/windows'
import { BRAND, WEB_MEDIA } from '@/features/public/media'

type Result = {
  allowed: boolean
  reason?: string | null
  first_name?: string
  duplicate?: boolean
  opener_online?: boolean
  unlock_id?: number | null
  /** pase de un día / invitado */
  guest?: boolean
  entries_left?: number
  /** 'male' | 'female' | 'other' | null: para el saludo por voz */
  gender?: string | null
  /** franjas del plan cuando el motivo es OUTSIDE_PLAN_HOURS */
  access_windows?: unknown
}
type Unlock = 'waiting' | 'opened' | 'failed'

const REASONS: Record<string, string> = {
  QR_INVALID: 'Ese código no es el QR de la app ni de un pase.',
  QR_EXPIRED_OR_INVALID: 'QR vencido: abrí la app de nuevo y volvé a mostrarlo.',
  MEMBER_NOT_FOUND: 'No encontramos ese socio.',
  MEMBER_FROZEN: 'Tu plan está congelado. Pasá por recepción.',
  MEMBER_ARCHIVED: 'Tu cuenta está dada de baja. Pasá por recepción.',
  PAYMENT_PAST_DUE: 'Tenés un pago pendiente. Pasá por recepción.',
  MEMBERSHIP_EXPIRED: 'Tu plan está vencido. Pasá por recepción para renovarlo.',
  PLAN_WITHOUT_GYM: 'Tu plan no incluye musculación.',
  NO_ACTIVE_MEMBERSHIP: 'No tenés un plan activo. Pasá por recepción.',
  RECENT_ENTRY: 'Ya entraste hace un momento. Si es un error, pasá por recepción.',
  TURNSTILE_OFFLINE: 'El molinete está sin conexión. Pasá por recepción.',
  ...PASS_DENIED,
}

function deniedText(r: Result) {
  if (r.reason === 'OUTSIDE_PLAN_HOURS') {
    const w = formatWindowsShort(r.access_windows)
    return w ? `Tu plan permite entrar ${w}.` : REASONS.OUTSIDE_PLAN_HOURS!
  }
  if (r.reason === 'RECENT_ENTRY' && r.guest) return 'Ya entraste hace un momento con este pase.'
  return REASONS[r.reason ?? ''] ?? 'Pasá por recepción.'
}
const SAME_QR_IGNORE_MS = 60_000

// Modo espera: sin movimiento frente a la cámara durante este tiempo se muestra la publicidad
const IDLE_MS = 10_000
// Sensibilidad del detector de movimiento (la cámara hace de sensor: compara imágenes chiquitas)
const MOTION_W = 40
const MOTION_H = 30
const MOTION_PIXEL_DIFF = 28 // cuánto tiene que cambiar un punto para contar como movimiento (0-255)
const MOTION_SHARE = 0.05 // qué parte de la imagen tiene que cambiar (5 %)
const AD_SLIDES = [WEB_MEDIA.app, ...WEB_MEDIA.gallery, WEB_MEDIA.cta]
const AD_SLIDE_MS = 7000

// La clave de la tablet se guarda en DOS lugares (almacenamiento del navegador + cookie de 1 año):
// si Chrome limpia uno de los dos (ahorro de espacio, actualización), la tablet sigue vinculada.
const cookieName = (key: string) => `k_${key.replace(/[^a-z0-9]/gi, '_')}`
function readCookie(key: string) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${cookieName(key)}=([^;]*)`))
  return m?.[1] ? decodeURIComponent(m[1]) : null
}
function writeCookie(key: string, value: string | null) {
  const base = `${cookieName(key)}=${value ? encodeURIComponent(value) : ''}; path=/; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}`
  document.cookie = value ? `${base}; max-age=31536000` : `${base}; max-age=0`
}
function load(key: string) {
  let v: string | null = null
  try {
    v = window.localStorage.getItem(key)
  } catch {
    /* sin almacenamiento */
  }
  if (!v) {
    try {
      v = readCookie(key)
      if (v) window.localStorage.setItem(key, v) // se recupera del respaldo
    } catch {
      /* nada */
    }
  }
  return v
}
function save(key: string, value: string | null) {
  try {
    if (value) window.localStorage.setItem(key, value)
    else window.localStorage.removeItem(key)
  } catch {
    /* sin almacenamiento: queda la cookie */
  }
  try {
    writeCookie(key, value)
  } catch {
    /* sin cookies */
  }
}

// Voz de la tablet: saluda al socio por su nombre (voz del navegador, en castellano)
let voice: SpeechSynthesisVoice | null = null
function pickVoice() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  const all = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('es'))
  const pref = ['es-ar', 'es-us', 'es-mx', 'es-419', 'es-es']
  voice = pref.map((l) => all.find((v) => v.lang.toLowerCase() === l)).find(Boolean) ?? all[0] ?? null
}
function say(text: string) {
  // App del molinete (Android): usa la voz del sistema, porque su navegador interno no habla
  const native = (window as Window & { MolineteVoz?: { speak: (t: string) => void } }).MolineteVoz
  if (native) {
    try {
      native.speak(text)
      return
    } catch {
      /* sigue con la voz del navegador */
    }
  }
  try {
    const synth = window.speechSynthesis
    if (!synth) return
    if (!voice) pickVoice()
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = voice?.lang ?? 'es-AR'
    if (voice) u.voice = voice
    u.rate = 1
    synth.speak(u)
  } catch {
    /* sin voz: queda el sonido */
  }
}
function welcomeText(r: Result) {
  const name = r.first_name?.trim().split(/\s+/)[0]
  const word = r.gender === 'male' ? 'Bienvenido' : r.gender === 'female' ? 'Bienvenida' : null
  if (word) return name ? `¡${word}, ${name}!` : `¡${word}!`
  return name ? `¡Hola, ${name}! Te damos la bienvenida.` : '¡Te damos la bienvenida!'
}

type Resp = Partial<Result> & { status: string; device?: string; unlock?: Unlock | 'unknown'; occupancy?: Occupancy | null }

async function call(k: string, qr: string | null, unlock?: number): Promise<Resp> {
  const res = await fetch('/api/access/turnstile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(unlock ? { k, unlock } : { k, qr }),
    cache: 'no-store',
  })
  if (res.status === 401) return { status: 'unauthorized' }
  if (!res.ok) throw new Error(String(res.status))
  return (await res.json()) as Resp
}

export function TurnstileKiosk({ gymName, storageKey }: { gymName: string; storageKey: string }) {
  const [token, setToken] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [started, setStarted] = useState(false)
  const [online, setOnline] = useState<boolean | null>(null)
  const [device, setDevice] = useState('')
  const [occupancy, setOccupancy] = useState<Occupancy | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [unlock, setUnlock] = useState<Unlock | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [now, setNow] = useState('')
  const scanner = useRef<Html5Qrcode | null>(null)
  const busy = useRef(false)
  const last = useRef<{ text: string; at: number }>({ text: '', at: 0 })
  const shownAt = useRef(0)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const camera = useRef<Promise<unknown>>(Promise.resolve())
  const scanSeq = useRef(0)
  const [idle, setIdle] = useState(false)
  const lastActivity = useRef(Date.now())
  const wake = useCallback(() => {
    lastActivity.current = Date.now()
    setIdle(false)
  }, [])

  // Clave de la tablet: llega en el link (#k=…) una vez y queda guardada
  useEffect(() => {
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('k')
    if (fromHash) {
      save(storageKey, fromHash)
      window.history.replaceState(null, '', window.location.pathname)
    }
    const k = fromHash ?? load(storageKey)
    if (k) save(storageKey, k) // deja también el respaldo en cookie
    if (load(`${storageKey}:started`)) save(`${storageKey}:started`, '1')
    setToken(k)
    // Tablet fija: si ya se inició alguna vez, después de un corte de luz o reinicio arranca sola
    if (load(`${storageKey}:started`)) setStarted(true)
    setReady(true)
  }, [storageKey])

  // Voces del navegador (cargan un instante después de abrir la página)
  useEffect(() => {
    if (!window.speechSynthesis) return
    pickVoice()
    window.speechSynthesis.addEventListener('voiceschanged', pickVoice)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', pickVoice)
  }, [])

  // Reloj
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }))
    tick()
    const t = setInterval(tick, 10_000)
    return () => clearInterval(t)
  }, [])

  // Latido: ¿está conectado el molinete?
  useEffect(() => {
    if (!token) return
    let stop = false
    const beat = async () => {
      try {
        const r = await call(token, null)
        if (stop) return
        if (r.status === 'unauthorized') {
          save(storageKey, null)
          setToken(null)
          return
        }
        setOnline(!!r.opener_online)
        if (r.device) setDevice(r.device)
        setOccupancy(r.occupancy ?? null)
      } catch {
        if (!stop) setOnline(false)
      }
    }
    beat()
    const t = setInterval(beat, 15_000)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [token, storageKey])

  // Pantalla siempre encendida
  useEffect(() => {
    if (!started) return
    type Lock = { released: boolean; release: () => Promise<void> }
    let lock: Lock | null = null
    let done = false
    const ask = async () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Lock> } }).wakeLock
        if (!wl) return
        const l = await wl.request('screen')
        if (done) l.release().catch(() => {})
        else lock = l
      } catch {
        /* sin bloqueo de pantalla: configurar "no apagar pantalla" en la tablet */
      }
    }
    ask()
    document.addEventListener('visibilitychange', ask)
    return () => {
      done = true
      document.removeEventListener('visibilitychange', ask)
      lock?.release().catch(() => {})
    }
  }, [started])

  const show = useCallback((r: Result | ((prev: Result | null) => Result), ms: number) => {
    setResult(r)
    shownAt.current = Date.now()
    lastActivity.current = Date.now()
    setIdle(false)
    if (clearTimer.current) clearTimeout(clearTimer.current)
    clearTimer.current = setTimeout(() => {
      setResult(null)
      setUnlock(null)
    }, ms)
  }, [])

  // ¿Abrió el molinete? Se pregunta hasta que el intermediario confirma (máx. ~8 s)
  const watchUnlock = useCallback(
    async (k: string, id: number, seq: number) => {
      setUnlock('waiting')
      const until = Date.now() + 8000
      while (Date.now() < until) {
        await new Promise((ok) => setTimeout(ok, 700))
        if (scanSeq.current !== seq) return
        try {
          const r = await call(k, null, id)
          if (scanSeq.current !== seq) return
          if (r.unlock === 'opened') return setUnlock('opened')
          if (r.unlock === 'failed' || r.unlock === 'unknown') break
        } catch {
          /* reintenta */
        }
      }
      if (scanSeq.current !== seq) return
      setUnlock('failed')
      sound.playAccessDenied()
      show((prev) => prev ?? { allowed: true }, 6000)  // mantiene el nombre del socio en pantalla
    },
    [show],
  )

  const onDecoded = useCallback(
    async (text: string) => {
      if (!token || busy.current) return
      const t = Date.now()
      // el mismo QR sigue frente a la cámara: no se vuelve a consultar
      if (text === last.current.text && t - last.current.at < SAME_QR_IGNORE_MS) return
      last.current = { text, at: t }
      busy.current = true
      try {
        const r = await call(token, text)
        if (r.status === 'unauthorized') {
          save(storageKey, null)
          setToken(null)
          return
        }
        setOnline((prev) => r.opener_online ?? prev)
        // QR nuevo (rota cada 30 s) del socio que acaba de pasar: silencio
        if (r.duplicate && Date.now() - shownAt.current < SAME_QR_IGNORE_MS) return
        const seq = ++scanSeq.current
        setUnlock(null)
        show({ ...r, allowed: !!r.allowed }, r.allowed ? 4000 : 5000)
        if (r.allowed) {
          sound.playAccessGranted()
          if (!r.duplicate) setTimeout(() => say(welcomeText({ ...r, allowed: true })), 350)
        } else sound.playAccessDenied()
        if (r.allowed && !r.duplicate && typeof r.unlock_id === 'number') void watchUnlock(token, r.unlock_id, seq)
      } catch {
        ++scanSeq.current
        setUnlock(null)
        show({ allowed: false, reason: 'NETWORK' }, 4000)
      } finally {
        busy.current = false
      }
    },
    [token, storageKey, show, watchUnlock],
  )
  const decodedRef = useRef(onDecoded)
  useEffect(() => {
    decodedRef.current = onDecoded
  }, [onDecoded])

  // Cámara: arrancar y apagar en orden (cambiar de cámara rápido no deja dos abiertas)
  useEffect(() => {
    if (!started || !token) return
    let alive = true
    let qr: Html5Qrcode | null = null
    camera.current = camera.current
      .catch(() => {})
      .then(async () => {
        if (!alive) return
        qr = new Html5Qrcode('turnstile-camera', { verbose: false })
        scanner.current = qr
        await qr.start(
          { facingMode: facing },
          {
            fps: 8,
            qrbox: (w, h) => {
              const s = Math.floor(Math.min(w, h) * 0.7)
              return { width: s, height: s }
            },
          },
          (text) => {
            if (alive) decodedRef.current(text)
          },
          () => {},
        )
        if (alive) setError(null)
      })
      .catch(() => {
        if (alive) setError('No se pudo usar la cámara. Revisá que el navegador tenga permiso de cámara para este sitio.')
      })
    return () => {
      alive = false
      camera.current = camera.current
        .catch(() => {})
        .then(async () => {
          const s = qr
          if (scanner.current === s) scanner.current = null
          if (!s) return
          try {
            if (s.isScanning) await s.stop()
            s.clear()
          } catch {
            /* ya estaba apagada */
          }
        })
    }
  }, [started, token, facing])

  // Sensor de movimiento con la cámara: si algo se acerca (una mano, un celular, una persona) se despierta
  useEffect(() => {
    if (!started || !token) return
    const canvas = document.createElement('canvas')
    canvas.width = MOTION_W
    canvas.height = MOTION_H
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    let prev: Uint8ClampedArray | null = null
    const t = setInterval(() => {
      const video = document.querySelector<HTMLVideoElement>('#turnstile-camera video')
      if (!video || video.readyState < 2) return
      try {
        ctx.drawImage(video, 0, 0, MOTION_W, MOTION_H)
      } catch {
        return
      }
      const px = ctx.getImageData(0, 0, MOTION_W, MOTION_H).data
      const gray = new Uint8ClampedArray(MOTION_W * MOTION_H)
      for (let i = 0; i < gray.length; i++) gray[i] = (px[i * 4]! * 3 + px[i * 4 + 1]! * 6 + px[i * 4 + 2]!) / 10
      if (prev) {
        let changed = 0
        for (let i = 0; i < gray.length; i++) if (Math.abs(gray[i]! - prev[i]!) > MOTION_PIXEL_DIFF) changed++
        if (changed / gray.length > MOTION_SHARE) wake()
      }
      prev = gray
    }, 300)
    return () => clearInterval(t)
  }, [started, token, wake])

  // Sin movimiento ni uso durante un rato: vuelve la publicidad
  useEffect(() => {
    if (!started || !token) return
    const t = setInterval(() => {
      if (Date.now() - lastActivity.current > IDLE_MS) setIdle(true)
    }, 1000)
    return () => clearInterval(t)
  }, [started, token])

  if (!ready) return <main className="min-h-dvh bg-black" />

  if (!token) {
    return (
      <PairScreen
        slug={storageKey.replace(/^molinete:/, '')}
        onPaired={(k) => {
          save(storageKey, k)
          setToken(k)
        }}
      />
    )
  }

  if (!started) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-black p-6 text-center text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BRAND.logo} alt={gymName} width={BRAND.logoWidth} height={BRAND.logoHeight} className="h-auto w-72 max-w-[80vw]" />
        <h1 className="text-3xl font-extrabold">Entrada a musculación</h1>
        <button
          type="button"
          onClick={() => {
            sound.playClick()
            document.documentElement.requestFullscreen?.().catch(() => {})
            save(`${storageKey}:started`, '1')
            setStarted(true)
          }}
          className="btn-tac min-h-[64px] rounded-2xl bg-[#edcc36] px-10 text-xl font-extrabold text-black"
        >
          Iniciar
        </button>
        <p className="max-w-sm text-sm text-zinc-500">Tocá Iniciar y permití el uso de la cámara. La pantalla queda encendida.</p>
      </main>
    )
  }

  const tone = result ? (result.allowed ? (unlock === 'failed' ? 'warn' : 'ok') : 'no') : null

  return (
    <main className="relative flex min-h-dvh flex-col bg-black text-white" onPointerDown={wake}>
      <header className="flex items-center justify-between px-5 py-3 text-sm text-zinc-400">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BRAND.logo} alt={gymName} width={BRAND.logoWidth} height={BRAND.logoHeight} className="h-9 w-auto" />
        <span className="flex items-center gap-4">
          {occupancy && occupancy.level !== 'closed' && (
            <span className="hidden items-center gap-1.5 sm:flex" aria-label="Personas en el gimnasio ahora">
              <Users className="h-4 w-4" aria-hidden="true" />
              {occupancy.people} · <span className={OCCUPANCY[occupancy.level].className}>{OCCUPANCY[occupancy.level].label}</span>
            </span>
          )}
          <span className={`flex items-center gap-1.5 ${online ? 'text-emerald-300' : 'text-amber-300'}`}>
            {online ? <Wifi className="h-4 w-4" aria-hidden="true" /> : <WifiOff className="h-4 w-4" aria-hidden="true" />}
            {online === null ? 'Conectando…' : online ? device || 'Molinete conectado' : 'Molinete sin conexión'}
          </span>
          <span className="font-mono text-white">{now}</span>
        </span>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-5 px-4 pb-6">
        <h1 className="text-center text-3xl font-extrabold sm:text-4xl">Mostrá el QR de tu app o de tu pase</h1>
        <div className="relative w-full max-w-md overflow-hidden rounded-3xl border-4 border-[#edcc36]/60">
          <div
            id="turnstile-camera"
            className={`aspect-square w-full bg-zinc-950 [&_video]:!h-full [&_video]:!w-full [&_video]:object-cover ${
              facing === 'user' ? '[&_video]:-scale-x-100' : ''
            }`}
          />
        </div>
        {error && <p role="alert" className="max-w-md text-center text-amber-200">{error}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm text-zinc-300"
          >
            <SwitchCamera className="h-4 w-4" aria-hidden="true" /> Cambiar cámara
          </button>
          <button
            type="button"
            onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm text-zinc-300"
          >
            <Maximize className="h-4 w-4" aria-hidden="true" /> Pantalla completa
          </button>
        </div>
      </section>

      {idle && !result && <IdleScreen gymName={gymName} />}

      {result && (
        <div
          role="status"
          aria-live="assertive"
          className={`absolute inset-0 flex flex-col items-center justify-center gap-5 p-8 text-center ${
            tone === 'ok' ? 'bg-emerald-600' : tone === 'warn' ? 'bg-amber-500 text-black' : 'bg-red-700'
          }`}
        >
          {tone === 'ok' ? (
            <CheckCircle2 className="h-28 w-28" aria-hidden="true" />
          ) : tone === 'warn' ? (
            <AlertTriangle className="h-28 w-28" aria-hidden="true" />
          ) : (
            <XCircle className="h-28 w-28" aria-hidden="true" />
          )}
          <p className="text-5xl font-extrabold">
            {tone === 'warn' ? 'No se abrió' : result.allowed ? `¡Adelante${result.first_name ? `, ${result.first_name}` : ''}!` : 'No podés pasar'}
          </p>
          <p className="max-w-xl text-2xl">
            {tone === 'warn'
              ? 'El molinete no abrió. Mostrá el QR de nuevo o avisá en recepción.'
              : result.allowed
                ? unlock === 'waiting'
                  ? 'Abriendo el molinete…'
                  : result.guest
                    ? `Pasá por el molinete. ¡Que disfrutes el entrenamiento!${typeof result.entries_left === 'number' && result.entries_left > 0 ? ` Te ${result.entries_left === 1 ? 'queda 1 entrada' : `quedan ${result.entries_left} entradas`}.` : ''}`
                    : 'Pasá por el molinete.'
                : result.reason === 'NETWORK'
                  ? 'Sin conexión a internet. Probá de nuevo o pasá por recepción.'
                  : deniedText(result)}
          </p>
        </div>
      )}
    </main>
  )
}

/**
 * Pantalla de espera: publicidad del gimnasio mientras nadie usa el molinete.
 * La cámara sigue prendida detrás: detecta movimiento y también lee un QR directo.
 */
function IdleScreen({ gymName }: { gymName: string }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % AD_SLIDES.length), AD_SLIDE_MS)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="absolute inset-0 z-10 overflow-hidden bg-black">
      {AD_SLIDES.map((src, n) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${n === i ? 'opacity-100' : 'opacity-0'}`}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/30" />
      <div className="relative flex h-full flex-col items-center justify-between p-10 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BRAND.logo} alt={gymName} width={BRAND.logoWidth} height={BRAND.logoHeight} className="h-auto w-80 max-w-[80vw]" />
        <div className="flex flex-col items-center gap-3">
          <QrCode className="h-14 w-14 animate-pulse text-[#edcc36]" aria-hidden="true" />
          <p className="text-3xl font-extrabold sm:text-4xl">Acercate y mostrá tu QR</p>
          <p className="text-lg text-zinc-300">o tocá la pantalla</p>
        </div>
      </div>
    </div>
  )
}

/** Tablet sin vincular: se vincula escribiendo el código de 6 números que muestra el panel (Accesos). */
function PairScreen({ slug, onPaired }: { slug: string; onPaired: (token: string) => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const submit = async () => {
    if (code.length !== 6 || busy) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/access/turnstile/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, code }),
        cache: 'no-store',
      })
      const r = (await res.json()) as { status?: string; token?: string }
      if (r.status === 'ok' && r.token) return onPaired(r.token)
      setMsg('Ese código no sirve o ya venció. Generá uno nuevo en el panel.')
      setCode('')
    } catch {
      setMsg('Sin conexión a internet. Revisá el wifi de la tablet y probá de nuevo.')
    } finally {
      setBusy(false)
    }
  }
  const press = (d: string) => setCode((c) => (d === '<' ? c.slice(0, -1) : c.length < 6 ? c + d : c))
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-black p-6 text-center text-white">
      <QrCode className="h-14 w-14 text-[#edcc36]" aria-hidden="true" />
      <h1 className="text-2xl font-extrabold">Vincular la tablet del molinete</h1>
      <p className="max-w-md text-zinc-400">
        En una computadora entrá a Panel → Accesos → ficha del lector → <strong className="text-white">Vincular tablet del molinete</strong> y
        escribí acá el código de 6 números.
      </p>
      <p aria-live="polite" className="flex gap-2 font-mono text-4xl font-extrabold">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={`grid h-14 w-11 place-items-center rounded-lg border ${code[i] ? 'border-[#edcc36] text-white' : 'border-zinc-700 text-zinc-700'}`}>
            {code[i] ?? '·'}
          </span>
        ))}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '<', '0', 'ok'].map((d) =>
          d === 'ok' ? (
            <button
              key={d}
              type="button"
              disabled={code.length !== 6 || busy}
              onClick={submit}
              className="btn-tac h-16 w-20 rounded-xl bg-[#edcc36] text-lg font-extrabold text-black disabled:opacity-40"
            >
              {busy ? '…' : 'Listo'}
            </button>
          ) : (
            <button
              key={d}
              type="button"
              onClick={() => press(d)}
              aria-label={d === '<' ? 'Borrar' : d}
              className="btn-tac h-16 w-20 rounded-xl border border-zinc-700 text-2xl font-bold text-white active:bg-zinc-800"
            >
              {d === '<' ? '⌫' : d}
            </button>
          ),
        )}
      </div>
      {msg && (
        <p role="alert" className="max-w-sm text-amber-300">
          {msg}
        </p>
      )}
      <p className="max-w-sm text-sm text-zinc-500">También podés abrir en esta tablet el link o escanear el QR que aparece en el panel.</p>
    </main>
  )
}
