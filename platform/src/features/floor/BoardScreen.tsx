'use client'

import { useEffect, useMemo, useState } from 'react'
import { timerElapsed, timerView, type BoardTimer, type TimerState } from '@/features/screens/board'

export interface LiveBoard {
  id: string
  title: string
  body: string | null
  trainer: string | null
  media: { type: 'image' | 'video'; url: string }[]
  timer: BoardTimer | null
  timer_state: TimerState
}

const IMAGE_MS = 10_000

/**
 * La pizarra del profe en la TV, a pantalla completa:
 * título y profe arriba, texto de la clase, imágenes/videos que van pasando y el temporizador grande.
 */
export function BoardScreen({ board, offsetMs }: { board: LiveBoard; offsetMs: number }) {
  const hasText = !!board.body?.trim()
  const hasMedia = board.media.length > 0
  const [i, setI] = useState(0)
  const current = hasMedia ? board.media[i % board.media.length] : null

  // Imágenes: 10 s cada una. Videos: hasta que terminan (onEnded)
  useEffect(() => {
    if (!current || current.type !== 'image' || board.media.length < 2) return
    const t = setTimeout(() => setI((n) => (n + 1) % board.media.length), IMAGE_MS)
    return () => clearTimeout(t)
    // (por texto: la TV vuelve a pedir la pizarra cada 3 s y los objetos cambian aunque sea la misma imagen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, current?.url, current?.type, board.media.length])
  useEffect(() => setI(0), [board.id])

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!board.timer) return
    const t = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(t)
  }, [board.timer])
  const view = useMemo(
    () => (board.timer ? timerView(board.timer, timerElapsed(board.timer_state, offsetMs, now), board.timer_state.running) : null),
    [board.timer, board.timer_state, offsetMs, now],
  )
  const timerOnly = !!view && !hasText && !hasMedia
  const tone =
    view?.tone === 'rest' ? 'text-red-500' : view?.tone === 'done' ? 'text-[#edcc36]' : view?.tone === 'work' ? 'text-emerald-400' : 'text-white'
  const bar = view?.tone === 'rest' ? 'bg-red-500' : view?.tone === 'done' ? 'bg-[#edcc36]' : 'bg-emerald-400'

  const lines = (board.body ?? '').split('\n')
  const longText = lines.length > 10 || (board.body ?? '').length > 350

  return (
    <div className="fixed inset-0 z-20 flex cursor-none flex-col bg-black text-white select-none">
      {/* Encabezado: título, profe y temporizador */}
      <header className="flex items-center justify-between gap-[3vw] border-b-[0.5vh] border-[#edcc36] px-[3vw] py-[2vh]">
        <div className="min-w-0">
          <p className="truncate text-[3.6vw] font-black uppercase leading-none tracking-tight">{board.title}</p>
          {board.trainer && <p className="mt-[0.8vh] text-[1.6vw] text-zinc-400">con {board.trainer}</p>}
        </div>
        {view && !timerOnly && (
          <div className="shrink-0 text-right">
            <p className={`font-mono text-[6vw] font-black leading-none tabular-nums ${tone}`}>{view.clock}</p>
            <p className="text-[1.5vw] font-bold uppercase tracking-widest text-zinc-300">{[view.label, view.round].filter(Boolean).join(' · ')}</p>
          </div>
        )}
      </header>

      {view && (
        <div className="h-[0.8vh] bg-zinc-900" aria-hidden="true">
          <div className={`h-full ${bar} transition-[width] duration-200`} style={{ width: `${Math.round(view.progress * 100)}%` }} />
        </div>
      )}

      {timerOnly && view ? (
        // Solo temporizador: gigante en el medio
        <div className="flex flex-1 flex-col items-center justify-center gap-[3vh]">
          {view.label && <p className={`text-[6vw] font-black uppercase tracking-widest ${tone}`}>{view.label}</p>}
          <p className={`font-mono text-[24vw] font-black leading-none tabular-nums ${tone}`}>{view.clock}</p>
          {view.round && <p className="text-[3.5vw] font-bold text-zinc-300">{view.round}</p>}
        </div>
      ) : (
        <div className={`grid min-h-0 flex-1 gap-[2vw] p-[3vw] ${hasText && hasMedia ? 'grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]' : 'grid-cols-1'}`}>
          {hasText && (
            <div className="min-h-0 overflow-hidden">
              <p
                className={`whitespace-pre-line font-bold leading-[1.3] ${
                  hasMedia ? (longText ? 'text-[1.9vw]' : 'text-[2.6vw]') : longText ? 'text-[2.4vw]' : 'text-[3.4vw]'
                }`}
              >
                {board.body}
              </p>
            </div>
          )}
          {current && (
            <div className="relative min-h-0 overflow-hidden rounded-[1vw] bg-zinc-950">
              {current.type === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={`${i}-${current.url}`} src={current.url} alt="" className="h-full w-full animate-[boardfade_0.8s_ease-out] object-contain" />
              ) : (
                <video
                  key={`${i}-${current.url}`}
                  src={current.url}
                  autoPlay
                  muted
                  playsInline
                  loop={board.media.length === 1}
                  onEnded={() => setI((n) => (n + 1) % board.media.length)}
                  onError={() => setI((n) => (n + 1) % board.media.length)}
                  className="h-full w-full object-contain"
                />
              )}
              {board.media.length > 1 && (
                <div className="absolute bottom-[1.5vh] left-1/2 flex -translate-x-1/2 gap-[0.6vw]" aria-hidden="true">
                  {board.media.map((_, n) => (
                    <span key={n} className={`h-[0.7vh] w-[2vw] rounded-full ${n === i % board.media.length ? 'bg-[#edcc36]' : 'bg-white/30'}`} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes boardfade { from { opacity: 0 } to { opacity: 1 } }`}</style>
    </div>
  )
}
