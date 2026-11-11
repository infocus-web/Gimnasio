'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { CirclePlay, RotateCcw, X } from 'lucide-react'
import { HELP_VIDEOS, helpVideoFor, helpVideoPoster, helpVideoSrc, type HelpVideo } from './help-videos'

/**
 * Botón flotante "¿Cómo se usa?": abre el video explicativo de la pantalla actual,
 * desde la parte que explica esa sección. Solo aparece donde hay video.
 */
export function HelpVideoButton() {
  const pathname = usePathname()
  const match = helpVideoFor(pathname)
  const dialog = useRef<HTMLDialogElement>(null)
  const player = useRef<HTMLVideoElement>(null)
  const [current, setCurrent] = useState<{ video: HelpVideo; start: number } | null>(null)

  // Al cambiar de pantalla con el video abierto, se cierra.
  useEffect(() => {
    dialog.current?.close()
  }, [pathname])

  if (!match) return null

  const open = () => {
    setCurrent(match)
    dialog.current?.showModal()
  }
  const play = (video: HelpVideo, start: number) => setCurrent({ video, start })

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="fixed bottom-5 right-5 z-30 inline-flex min-h-[48px] items-center gap-2 rounded-full bg-brand px-5 text-sm font-bold text-black shadow-[0_8px_30px_rgba(0,0,0,0.5)] transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white active:scale-[0.97] motion-reduce:transition-none"
      >
        <CirclePlay className="h-5 w-5" aria-hidden="true" />
        ¿Cómo se usa?
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="help-video-title"
        onClose={() => player.current?.pause()}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close() // clic afuera
        }}
        className="m-auto w-[min(60rem,calc(100vw-1.5rem))] rounded-2xl border border-zinc-800 bg-zinc-950 p-0 text-zinc-100 backdrop:bg-black/80"
      >
        {current && (
          <div>
            <div className="flex items-center justify-between gap-3 border-b border-zinc-900 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">Video · {current.video.audience}</p>
                <h2 id="help-video-title" className="truncate text-base font-bold text-white">
                  {current.video.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                aria-label="Cerrar"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-zinc-400 hover:bg-zinc-900 hover:text-white"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <video
              key={`${current.video.n}-${current.start}`}
              ref={player}
              src={helpVideoSrc(current.video.n)}
              poster={current.start === 0 ? helpVideoPoster(current.video.n) : undefined}
              controls
              autoPlay
              playsInline
              preload="metadata"
              onLoadedMetadata={(e) => {
                if (current.start > 0) e.currentTarget.currentTime = current.start
              }}
              className="aspect-video w-full bg-black"
            />

            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              {current.start > 0 && (
                <button
                  type="button"
                  onClick={() => play(current.video, 0)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-zinc-900 px-3 text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" /> Ver desde el principio
                </button>
              )}
              <details className="group ml-auto">
                <summary className="flex min-h-[40px] cursor-pointer list-none items-center rounded-lg px-3 text-sm text-zinc-400 hover:text-white">
                  Ver todos los videos
                </summary>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                  {Object.values(HELP_VIDEOS).map((v) => (
                    <li key={v.n}>
                      <button
                        type="button"
                        onClick={() => play(v, 0)}
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-900 ${
                          v.n === current.video.n ? 'text-brand' : 'text-zinc-300'
                        }`}
                      >
                        {v.n}. {v.title} <span className="text-zinc-500">· {v.audience}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          </div>
        )}
      </dialog>
    </>
  )
}
