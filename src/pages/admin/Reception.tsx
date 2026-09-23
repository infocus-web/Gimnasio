import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import { Camera, CameraOff, CheckCircle2, Keyboard, Maximize2, Minimize2, Search, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { CheckInResult, MemberView } from '../../lib/types'
import { daysLeftText, fmtDate } from '../../lib/format'
import { Avatar, Button, StatusBadge, cx, errorText, useToast } from '../../components/ui'

interface TodayRow {
  id: number
  checked_at: string
  allowed: boolean
  reason: string | null
  members: { id: string; first_name: string; last_name: string; photo_url: string | null } | null
}

function beep(ok: boolean) {
  try {
    const ctx = new AudioContext()
    const play = (freq: number, start: number, dur: number) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = freq
      o.type = 'sine'
      g.gain.setValueAtTime(0.25, ctx.currentTime + start)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + start)
      o.stop(ctx.currentTime + start + dur)
    }
    if (ok) {
      play(880, 0, 0.12)
      play(1320, 0.12, 0.18)
    } else {
      play(220, 0, 0.35)
    }
    setTimeout(() => ctx.close(), 800)
  } catch {
    /* sin audio */
  }
}

export function Reception() {
  const toast = useToast()
  const [result, setResult] = useState<CheckInResult | null>(null)
  const [today, setToday] = useState<TodayRow[]>([])
  const [camOn, setCamOn] = useState(false)
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([])
  const [cameraId, setCameraId] = useState<string>('')
  const [code, setCode] = useState('')
  const [search, setSearch] = useState('')
  const [matches, setMatches] = useState<MemberView[]>([])
  const [full, setFull] = useState(false)
  const scanner = useRef<Html5Qrcode | null>(null)
  const lastScan = useRef<{ text: string; at: number }>({ text: '', at: 0 })
  const clearTimer = useRef<number | undefined>(undefined)
  const busy = useRef(false)
  const codeInput = useRef<HTMLInputElement>(null)

  const loadToday = useCallback(async () => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const { data } = await supabase
      .from('checkins')
      .select('id, checked_at, allowed, reason, members(id, first_name, last_name, photo_url)')
      .gte('checked_at', start.toISOString())
      .order('checked_at', { ascending: false })
      .limit(100)
    setToday((data as unknown as TodayRow[]) ?? [])
  }, [])

  useEffect(() => {
    loadToday()
  }, [loadToday])

  const process = useCallback(
    async (args: { token?: string; memberId?: string; method: 'qr' | 'manual' | 'dni' }) => {
      if (busy.current) return
      busy.current = true
      try {
        const { data, error } = await supabase.rpc('check_in', {
          p_token: args.token ?? null,
          p_member: args.memberId ?? null,
          p_method: args.method,
        })
        if (error) throw error
        const r = data as CheckInResult
        setResult(r)
        beep(Boolean(r.found && r.allowed))
        window.clearTimeout(clearTimer.current)
        clearTimer.current = window.setTimeout(() => setResult(null), 8000)
        if (r.found && !r.duplicate) loadToday()
      } catch (e) {
        toast(errorText(e), 'error')
      } finally {
        busy.current = false
      }
    },
    [loadToday, toast],
  )

  // ---------- cámara ----------
  const startCamera = useCallback(async () => {
    try {
      const list = await Html5Qrcode.getCameras()
      setCameras(list.map((c) => ({ id: c.id, label: c.label })))
      const back = list.find((c) => /back|trasera|rear|environment/i.test(c.label))
      const chosen = cameraId || back?.id || list[0]?.id
      if (!chosen) throw new Error('No se encontró ninguna cámara')
      setCameraId(chosen)
      const s = new Html5Qrcode('qr-reader', { verbose: false })
      scanner.current = s
      await s.start(
        chosen,
        { fps: 10, qrbox: (w, h) => ({ width: Math.min(w, h) * 0.7, height: Math.min(w, h) * 0.7 }) },
        (text) => {
          const now = Date.now()
          if (text === lastScan.current.text && now - lastScan.current.at < 5000) return
          lastScan.current = { text, at: now }
          process({ token: text, method: 'qr' })
        },
        undefined,
      )
      setCamOn(true)
    } catch (e) {
      toast(`No se pudo abrir la cámara: ${errorText(e)}`, 'error')
      setCamOn(false)
    }
  }, [cameraId, process, toast])

  const stopCamera = useCallback(async () => {
    const s = scanner.current
    scanner.current = null
    if (s) {
      try {
        if (s.isScanning) await s.stop()
        s.clear()
      } catch {
        /* ya estaba detenida */
      }
    }
    setCamOn(false)
  }, [])

  useEffect(() => () => void stopCamera(), [stopCamera])

  async function switchCamera(id: string) {
    setCameraId(id)
    if (camOn) {
      await stopCamera()
      setTimeout(() => startCamera(), 50)
    }
  }

  // ---------- lector USB / tipeo ----------
  function submitCode(e: FormEvent) {
    e.preventDefault()
    const v = code.trim()
    if (!v) return
    setCode('')
    process({ token: v, method: 'qr' })
  }

  // ---------- búsqueda manual ----------
  useEffect(() => {
    const term = search.trim()
    if (term.length < 2) {
      setMatches([])
      return
    }
    const t = setTimeout(async () => {
      const words = term.toLowerCase().replace(/[%_,()"]/g, ' ').split(/\s+/).filter(Boolean)
      const like = `"%${words[0]}%"`
      const { data } = await supabase
        .from('members_view')
        .select('*')
        .or(`first_name.ilike.${like},last_name.ilike.${like},dni.ilike.${like}`)
        .order('last_name')
        .limit(30)
      const list = ((data as MemberView[]) ?? []).filter((m) => {
        const hay = `${m.first_name} ${m.last_name} ${m.dni ?? ''}`.toLowerCase()
        return words.every((w) => hay.includes(w))
      })
      setMatches(list.slice(0, 8))
    }, 250)
    return () => clearTimeout(t)
  }, [search])

  const ok = result?.found && result.allowed

  return (
    <div className={cx(full && 'fixed inset-0 z-50 overflow-y-auto bg-zinc-950 p-4 sm:p-6')}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={cx('font-display text-3xl font-bold uppercase', full && 'text-white')}>Recepción</h1>
          <p className={cx('text-sm', full ? 'text-zinc-500' : 'text-zinc-500')}>
            {today.filter((t) => t.allowed).length} entradas hoy · escaneá el QR del socio o buscalo por nombre/DNI
          </p>
        </div>
        <Button variant={full ? 'secondary' : 'dark'} onClick={() => setFull((f) => !f)}>
          {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          {full ? 'Salir de pantalla completa' : 'Modo recepción'}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Escáner */}
        <div className="space-y-4 lg:col-span-2">
          <div className="overflow-hidden rounded-2xl bg-zinc-900 p-3">
            <div id="qr-reader" className={cx('aspect-square w-full overflow-hidden rounded-xl bg-black', !camOn && 'hidden')} />
            {!camOn && (
              <div className="flex aspect-square w-full flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-zinc-700 text-zinc-400">
                <Camera className="size-12" />
                <Button onClick={startCamera}>Activar cámara</Button>
                <p className="px-6 text-center text-xs text-zinc-500">Usá la cámara de la tablet, celular o notebook para leer los QR.</p>
              </div>
            )}
            <div className="mt-3 flex items-center gap-2">
              {cameras.length > 1 && (
                <select className="input flex-1 !bg-zinc-800 !text-white !border-zinc-700" value={cameraId} onChange={(e) => switchCamera(e.target.value)}>
                  {cameras.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label || 'Cámara'}
                    </option>
                  ))}
                </select>
              )}
              {camOn && (
                <Button variant="secondary" size="sm" onClick={stopCamera}>
                  <CameraOff className="size-4" /> Apagar
                </Button>
              )}
            </div>
          </div>

          <form onSubmit={submitCode} className="rounded-2xl border border-zinc-200 bg-white p-4">
            <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <Keyboard className="size-3.5" /> Lector USB de QR / código
            </label>
            <input
              ref={codeInput}
              className="input font-mono"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Hacé clic acá y pasá el QR por el lector"
              autoComplete="off"
            />
          </form>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <Search className="size-3.5" /> Buscar socio (ingreso manual)
            </label>
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre, apellido o DNI" />
            {matches.length > 0 && (
              <ul className="mt-2 divide-y divide-zinc-100">
                {matches.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-2">
                    <Avatar member={m} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {m.first_name} {m.last_name}
                      </p>
                      <p className="text-xs text-zinc-500">{m.dni ? `DNI ${m.dni}` : m.plan_name}</p>
                    </div>
                    <StatusBadge status={m.status} />
                    <Button
                      size="sm"
                      onClick={() => {
                        process({ memberId: m.id, method: 'manual' })
                        setSearch('')
                      }}
                    >
                      Ingresar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Resultado + lista del día */}
        <div className="space-y-4 lg:col-span-3">
          <div
            className={cx(
              'flex min-h-72 flex-col items-center justify-center rounded-2xl p-6 text-center transition-colors',
              !result && 'border border-dashed border-zinc-300 bg-white',
              result && !result.found && 'bg-zinc-800 text-white',
              result?.found && ok && 'bg-emerald-600 text-white',
              result?.found && !ok && 'bg-red-600 text-white',
            )}
          >
            {!result && (
              <>
                <div className="mb-3 rounded-full bg-zinc-100 p-4 text-zinc-400">
                  <Camera className="size-8" />
                </div>
                <p className="font-semibold text-zinc-600">Esperando un QR…</p>
                <p className="mt-1 text-sm text-zinc-400">El resultado aparece acá en grande, con sonido.</p>
              </>
            )}
            {result && !result.found && (
              <>
                <XCircle className="size-16" />
                <p className="mt-3 font-display text-3xl font-bold uppercase">QR no reconocido</p>
                <p className="mt-1 text-zinc-300">No corresponde a ningún socio.</p>
              </>
            )}
            {result?.found && result.member && (
              <>
                <div className="relative">
                  <Avatar member={result.member} size={120} className="ring-4 ring-white/40" />
                  <span className="absolute -bottom-2 -right-2 rounded-full bg-white p-1">
                    {ok ? <CheckCircle2 className="size-9 text-emerald-600" /> : <XCircle className="size-9 text-red-600" />}
                  </span>
                </div>
                <p className="mt-5 font-display text-5xl font-bold uppercase leading-none">{ok ? 'Adelante' : 'Acceso denegado'}</p>
                <p className="mt-2 text-2xl font-semibold">
                  {result.member.first_name} {result.member.last_name}
                </p>
                <p className="mt-1 text-white/85">
                  {result.reason ?? `${result.member.plan_name ?? 'Plan'} · ${daysLeftText(result.member.days_left)}`}
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
                  {result.member.paid_until && <span className="rounded-full bg-black/20 px-3 py-1">Vence {fmtDate(result.member.paid_until)}</span>}
                  <span className="rounded-full bg-black/20 px-3 py-1">{result.visits_this_month} visitas este mes</span>
                  {result.duplicate && <span className="rounded-full bg-black/20 px-3 py-1">Ya registrado recién</span>}
                </div>
                {result.member.medical_notes && <p className="mt-3 rounded-lg bg-black/25 px-3 py-1.5 text-sm">⚕ {result.member.medical_notes}</p>}
                {!ok && (
                  <Link to={`/admin/socios/${result.member.id}`} className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-red-700">
                    Ir a la ficha para cobrar
                  </Link>
                )}
              </>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white">
            <p className="border-b border-zinc-100 px-5 py-3 text-sm font-semibold">Entradas de hoy</p>
            {today.length === 0 ? (
              <p className="px-5 py-6 text-sm text-zinc-400">Todavía no entró nadie hoy.</p>
            ) : (
              <ul className="max-h-96 divide-y divide-zinc-100 overflow-y-auto">
                {today.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-5 py-2">
                    <span className="w-12 text-xs tabular-nums text-zinc-500">
                      {new Date(t.checked_at).toLocaleTimeString('es-AR', { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
                    </span>
                    {t.members && <Avatar member={t.members} size={28} />}
                    <Link to={`/admin/socios/${t.members?.id}`} className="flex-1 truncate text-sm hover:underline">
                      {t.members?.first_name} {t.members?.last_name}
                    </Link>
                    {t.allowed ? (
                      <CheckCircle2 className="size-4 text-emerald-600" />
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-red-600">
                        <XCircle className="size-4" /> {t.reason}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
