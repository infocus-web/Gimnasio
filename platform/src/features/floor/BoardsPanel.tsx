'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Image as ImageIcon, Loader2, Pause, Pencil, Play, Plus, RotateCcw, Trash2, Tv, TvMinimal, Video } from 'lucide-react'
import type { ActionState } from '@/features/admin/errors'
import { timerElapsed, timerSummary, timerView, type BoardMedia, type BoardTimer, type TimerState } from '@/features/screens/board'
import { BoardEditor } from './BoardEditor'
import type { BoardInput } from './board-actions'

export interface BoardItem {
  id: string
  mine: boolean
  author: string
  title: string
  body: string
  media: (BoardMedia & { url: string })[]
  timer: BoardTimer | null
}

export interface LiveInfo {
  server_now: string
  tv_linked: boolean
  live: { board_id: string; until: string; timer_state: TimerState; staff_id: string | null } | null
}

const MINUTES: [number, string][] = [
  [30, '30 min'],
  [45, '45 min'],
  [60, '1 hora'],
  [90, '1 hora y media'],
  [120, '2 horas'],
]

export function BoardsPanel({
  orgId,
  staffId,
  isAdmin,
  boards,
  live,
  save,
  remove,
  show,
  hide,
  timer,
}: {
  orgId: string
  staffId: string
  isAdmin: boolean
  boards: BoardItem[]
  live: LiveInfo | null
  save: (id: string | null, v: BoardInput) => Promise<ActionState & { id?: string }>
  remove: (id: string) => Promise<ActionState>
  show: (id: string, minutes: number) => Promise<ActionState>
  hide: () => Promise<ActionState>
  timer: (action: 'start' | 'pause' | 'reset') => Promise<ActionState & { state?: unknown }>
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [editing, setEditing] = useState<BoardItem | 'new' | null>(null)
  const [minutes, setMinutes] = useState(60)

  // Mientras hay una pizarra en vivo se refresca seguido (el temporizador lo puede tocar otro celular)
  useEffect(() => {
    if (!live?.live) return
    const t = setInterval(() => router.refresh(), 15_000)
    return () => clearInterval(t)
  }, [live?.live, router])

  const run = (fn: () => Promise<ActionState>) =>
    start(async () => {
      const r = await fn()
      if (r.message) setMsg({ ok: !!r.ok, text: r.message })
      router.refresh()
    })

  const liveBoard = live?.live ? boards.find((b) => b.id === live.live!.board_id) ?? null : null
  const liveIsMine = !!live?.live && live.live.staff_id === staffId
  const canControl = !!live?.live && (liveIsMine || isAdmin)

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-400">
        Prepará antes tus pizarras: la rutina del día, imágenes, videos y el temporizador. Al entrar a la clase tocá{' '}
        <strong className="text-zinc-200">Mostrar en la TV</strong>. Cuando termina el tiempo elegido (o la sacás), la TV vuelve sola a la pantalla general.
      </p>

      {live && !live.tv_linked && (
        <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
          Todavía no hay una TV vinculada. Pedile a administración que la vincule en Pantallas.
        </p>
      )}

      {/* En vivo */}
      {live?.live && (
        <section aria-label="En la TV ahora" className="space-y-4 rounded-2xl border-2 border-[#edcc36] bg-[#edcc36]/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#edcc36]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden="true" /> En la TV ahora
              </p>
              <p className="text-lg font-bold text-white">{liveBoard?.title ?? 'Pizarra de otro profe'}</p>
              <p className="text-xs text-zinc-400">
                Hasta las {new Date(live.live.until).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            {canControl && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(hide)}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-zinc-600 bg-black px-4 text-sm font-semibold text-white hover:border-red-400"
              >
                <TvMinimal className="h-4 w-4" aria-hidden="true" /> Sacar de la TV
              </button>
            )}
          </div>
          {canControl && liveBoard?.timer && (
            <LiveTimer
              config={liveBoard.timer}
              state={live.live.timer_state}
              serverNow={live.server_now}
              busy={pending}
              onAction={(a) =>
                start(async () => {
                  const r = await timer(a)
                  if (!r.ok && r.message) setMsg({ ok: false, text: r.message })
                  router.refresh()
                })
              }
            />
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-[#edcc36] px-5 text-sm font-bold text-black"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Nueva pizarra
        </button>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          En la TV durante
          <select
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="min-h-[44px] rounded-xl border border-zinc-700 bg-black px-3 text-sm text-white"
          >
            {MINUTES.map(([m, label]) => (
              <option key={m} value={m}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p aria-live="polite" className={`text-sm ${msg ? (msg.ok ? 'text-emerald-300' : 'text-amber-300') : 'sr-only'}`}>
        {msg?.text ?? ''}
      </p>

      {boards.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {boards.map((b) => {
            const isLive = live?.live?.board_id === b.id
            const imgs = b.media.filter((m) => m.type === 'image').length
            const vids = b.media.length - imgs
            const thumb = b.media.find((m) => m.type === 'image')
            return (
              <li key={b.id} className={`flex flex-col gap-3 rounded-2xl border p-4 ${isLive ? 'border-[#edcc36]' : 'border-zinc-800'} bg-zinc-950`}>
                <div className="flex gap-3">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb.url} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-zinc-900 text-zinc-600">
                      <Tv className="h-6 w-6" aria-hidden="true" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-bold text-white">{b.title}</p>
                    {isAdmin && !b.mine && <p className="text-xs text-zinc-500">De {b.author}</p>}
                    <p className="line-clamp-2 text-sm text-zinc-400">{b.body || 'Sin texto'}</p>
                    <p className="mt-1 flex flex-wrap gap-3 text-xs text-zinc-500">
                      {imgs > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" /> {imgs}
                        </span>
                      )}
                      {vids > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Video className="h-3.5 w-3.5" aria-hidden="true" /> {vids}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {timerSummary(b.timer)}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending || isLive}
                    onClick={() => run(() => show(b.id, minutes))}
                    className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-black disabled:opacity-50"
                  >
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Tv className="h-4 w-4" aria-hidden="true" />}
                    {isLive ? 'En la TV' : 'Mostrar en la TV'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(b)}
                    aria-label={`Editar ${b.title}`}
                    className="grid h-12 w-12 place-items-center rounded-xl border border-zinc-700 text-zinc-200 hover:border-[#edcc36]"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm(`¿Borrar la pizarra "${b.title}"?`)) run(() => remove(b.id))
                    }}
                    aria-label={`Borrar ${b.title}`}
                    className="grid h-12 w-12 place-items-center rounded-xl border border-zinc-700 text-red-300 hover:border-red-400"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          Todavía no tenés pizarras. Creá la primera con «Nueva pizarra».
        </p>
      )}

      {editing && (
        <BoardEditor
          key={editing === 'new' ? 'new' : editing.id}
          orgId={orgId}
          staffId={staffId}
          board={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (v) => {
            const r = await save(editing === 'new' ? null : editing.id, v)
            if (r.ok) {
              setEditing(null)
              setMsg({ ok: true, text: r.message ?? 'Guardado.' })
              router.refresh()
            }
            return r
          }}
        />
      )}
    </div>
  )
}

/** Control del temporizador desde el celular del profe (la TV muestra lo mismo) */
function LiveTimer({
  config,
  state,
  serverNow,
  busy,
  onAction,
}: {
  config: BoardTimer
  state: TimerState
  serverNow: string
  busy: boolean
  onAction: (a: 'start' | 'pause' | 'reset') => void
}) {
  const offset = useMemo(() => new Date(serverNow).getTime() - Date.now(), [serverNow])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [])
  const view = timerView(config, timerElapsed(state, offset, now), state.running)
  const color = view.tone === 'rest' ? 'text-red-400' : view.tone === 'done' ? 'text-[#edcc36]' : view.tone === 'work' ? 'text-emerald-400' : 'text-white'
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-black p-4">
      <div>
        <p className={`font-mono text-5xl font-black tabular-nums ${color}`}>{view.clock}</p>
        <p className="text-sm text-zinc-400">{[view.label, view.round].filter(Boolean).join(' · ') || timerSummary(config)}</p>
      </div>
      <div className="flex gap-2">
        {state.running ? (
          <button type="button" disabled={busy} onClick={() => onAction('pause')} className="inline-flex min-h-[56px] items-center gap-2 rounded-xl bg-white px-5 font-bold text-black">
            <Pause className="h-5 w-5" aria-hidden="true" /> Pausar
          </button>
        ) : (
          <button type="button" disabled={busy || view.tone === 'done'} onClick={() => onAction('start')} className="inline-flex min-h-[56px] items-center gap-2 rounded-xl bg-emerald-500 px-5 font-bold text-black disabled:opacity-50">
            <Play className="h-5 w-5" aria-hidden="true" /> {state.elapsed_ms ? 'Seguir' : 'Iniciar'}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction('reset')}
          aria-label="Reiniciar temporizador"
          className="grid h-14 w-14 place-items-center rounded-xl border border-zinc-600 text-white"
        >
          <RotateCcw className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
