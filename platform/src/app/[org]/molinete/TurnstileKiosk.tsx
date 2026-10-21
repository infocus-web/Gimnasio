'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { CheckCircle2, XCircle, AlertTriangle, QrCode, SwitchCamera, Wifi, WifiOff, Maximize } from 'lucide-react'
import { sound } from '@/utils/audio'

type Result = {
  allowed: boolean
  reason?: string | null
  first_name?: string
  duplicate?: boolean
  opener_online?: boolean
}

const REASONS: Record<string, string> = {
  QR_INVALID: 'Ese código no es el QR de la app.',
  QR_EXPIRED_OR_INVALID: 'QR vencido: abrí la app de nuevo y volvé a mostrarlo.',
  MEMBER_NOT_FOUND: 'No encontramos ese socio.',
  MEMBER_FROZEN: 'Tu plan está congelado. Pasá por recepción.',
  MEMBER_ARCHIVED: 'Tu cuenta está dada de baja. Pasá por recepción.',
  PAYMENT_PAST_DUE: 'Tenés un pago pendiente. Pasá por recepción.',
  MEMBERSHIP_EXPIRED: 'Tu plan está vencido. Pasá por recepción para renovarlo.',
  PLAN_WITHOUT_GYM: 'Tu plan no incluye musculación.',
  NO_ACTIVE_MEMBERSHIP: 'No tenés un plan activo. Pasá por recepción.',
  RECENT_ENTRY: 'Ya entraste hace un momento. Si es un error, pasá por recepción.',
}

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
    /* sin almacenamiento: la tablet tendrá que abrir el link otra vez */
  }
}

async function call(k: string, qr: string | null) {
  const res = await fetch('/api/access/turnstile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ k, qr }),
    cache: 'no-store',
  })
  if (res.status === 401) return { status: 'unauthorized' } as const
  if (!res.ok) throw new Error(String(res.status))
  return (await res.json()) as Result & { status: string; device?: string }
}

export function TurnstileKiosk({ gymName, storageKey }: { gymName: string; storageKey: string }) {
  const [token, setToken] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [started, setStarted] = useState(false)
  const [online, setOnline] = useState<boolean | null>(null)
  const [device, setDevice] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [now, setNow] = useState('')
  const scanner = useRef<Html5Qrcode | null>(null)
  const busy = useRef(false)
  const last = useRef<{ text: string; at: number }>({ text: '', at: 0 })
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clave de la tablet: llega en el link (#k=…) una vez y queda guardada
  useEffect(() => {
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('k')
    if (fromHash) {
      save(storageKey, fromHash)
      window.history.replaceState(null, '', window.location.pathname)
    }
    setToken(fromHash ?? load(storageKey))
    setReady(true)
  }, [storageKey])

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
    let lock: { release: () => Promise<void> } | null = null
    const ask = async () => {
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
        if (wl && document.visibilityState === 'visible') lock = await wl.request('screen')
      } catch {
        /* sin bloqueo de pantalla: configurar "no apagar pantalla" en la tablet */
      }
    }
    ask()
    document.addEventListener('visibilitychange', ask)
    return () => {
      document.removeEventListener('visibilitychange', ask)
      lock?.release().catch(() => {})
    }
  }, [started])

  const onDecoded = useCallback(
    async (text: string) => {
      if (!token || busy.current) return
      const t = Date.now()
      if (text === last.current.text && t - last.current.at < 5000) return
      last.current = { text, at: t }
      busy.current = true
      try {
        const r = await call(token, text)
        if (r.status === 'unauthorized') {
          save(storageKey, null)
          setToken(null)
          return
        }
        setResult(r)
        setOnline((prev) => r.opener_online ?? prev)
        if (r.allowed) sound.playAccessGranted()
        else sound.playAccessDenied()
        if (clearTimer.current) clearTimeout(clearTimer.current)
        clearTimer.current = setTimeout(() => setResult(null), r.allowed ? 3500 : 5000)
      } catch {
        setResult({ allowed: false, reason: 'NETWORK' })
        if (clearTimer.current) clearTimeout(clearTimer.current)
        clearTimer.current = setTimeout(() => setResult(null), 4000)
      } finally {
        busy.current = false
      }
    },
    [token, storageKey],
  )
  const decodedRef = useRef(onDecoded)
  useEffect(() => {
    decodedRef.current = onDecoded
  }, [onDecoded])

  // Cámara
  useEffect(() => {
    if (!started || !token) return
    const qr = new Html5Qrcode('turnstile-camera', { verbose: false })
    scanner.current = qr
    let alive = true
    qr.start({ facingMode: facing }, { fps: 8, qrbox: (w, h) => {
      const s = Math.floor(Math.min(w, h) * 0.7)
      return { width: s, height: s }
    } }, (text) => {
      if (alive) decodedRef.current(text)
    }, () => {})
      .then(() => setError(null))
      .catch(() => setError('No se pudo usar la cámara. Revisá que el navegador tenga permiso de cámara para este sitio.'))
    return () => {
      alive = false
      const s = scanner.current
      scanner.current = null
      if (s?.isScanning) s.stop().then(() => s.clear()).catch(() => {})
      else s?.clear()
    }
  }, [started, token, facing])

  if (!ready) return <main className="min-h-dvh bg-black" />

  if (!token) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-black p-6 text-center text-white">
        <QrCode className="h-16 w-16 text-[#edcc36]" aria-hidden="true" />
        <h1 className="text-2xl font-extrabold">Tablet sin vincular</h1>
        <p className="max-w-md text-zinc-400">
          En una computadora entrá a Panel → Accesos → ficha del lector → <strong className="text-white">Vincular tablet del molinete</strong> y
          abrí en esta tablet el link (o escaneá el código) que aparece.
        </p>
      </main>
    )
  }

  if (!started) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-black p-6 text-center text-white">
        <p className="text-sm uppercase tracking-widest text-zinc-500">{gymName}</p>
        <h1 className="text-3xl font-extrabold">Entrada a musculación</h1>
        <button
          type="button"
          onClick={() => {
            sound.playClick()
            document.documentElement.requestFullscreen?.().catch(() => {})
            setStarted(true)
          }}
          className="min-h-[64px] rounded-2xl bg-[#edcc36] px-10 text-xl font-extrabold text-black"
        >
          Iniciar
        </button>
        <p className="max-w-sm text-sm text-zinc-500">Tocá Iniciar y permití el uso de la cámara. La pantalla queda encendida.</p>
      </main>
    )
  }

  const tone = result
    ? result.allowed
      ? result.opener_online === false
        ? 'warn'
        : 'ok'
      : 'no'
    : null

  return (
    <main className="relative flex min-h-dvh flex-col bg-black text-white">
      <header className="flex items-center justify-between px-5 py-3 text-sm text-zinc-400">
        <span className="font-semibold text-white">{gymName}</span>
        <span className="flex items-center gap-4">
          <span className={`flex items-center gap-1.5 ${online ? 'text-emerald-300' : 'text-amber-300'}`}>
            {online ? <Wifi className="h-4 w-4" aria-hidden="true" /> : <WifiOff className="h-4 w-4" aria-hidden="true" />}
            {online === null ? 'Conectando…' : online ? device || 'Molinete conectado' : 'Molinete sin conexión'}
          </span>
          <span className="font-mono text-white">{now}</span>
        </span>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-5 px-4 pb-6">
        <h1 className="text-center text-3xl font-extrabold sm:text-4xl">Mostrá el QR de tu app</h1>
        <div className="relative w-full max-w-md overflow-hidden rounded-3xl border-4 border-[#edcc36]/60">
          <div id="turnstile-camera" className="aspect-square w-full bg-zinc-950 [&_video]:!h-full [&_video]:!w-full [&_video]:object-cover" />
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
            {result.allowed ? `¡Adelante${result.first_name ? `, ${result.first_name}` : ''}!` : 'No podés pasar'}
          </p>
          <p className="max-w-xl text-2xl">
            {tone === 'warn'
              ? 'Entrada registrada, pero el molinete no responde. Avisá en recepción.'
              : result.allowed
                ? 'Pasá por el molinete.'
                : result.reason === 'NETWORK'
                  ? 'Sin conexión a internet. Probá de nuevo o pasá por recepción.'
                  : REASONS[result.reason ?? ''] ?? 'Pasá por recepción.'}
          </p>
        </div>
      )}
    </main>
  )
}
