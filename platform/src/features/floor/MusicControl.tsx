'use client'

import { useEffect, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ListMusic, Loader2, Music, Pause, Play, Shuffle, SkipBack, SkipForward, Upload, Volume1, Volume2 } from 'lucide-react'
import type { ActionState } from '@/features/admin/errors'
import { fmtDuration, type MusicState, type MusicTrack } from '@/features/screens/music'

type Action = 'play' | 'pause' | 'next' | 'prev' | 'track' | 'volume' | 'shuffle'

/**
 * Control de la música de la TV (profes, recepción y administración).
 * La TV toma los cambios en unos 3 segundos; acá se refresca cada 10 s para ver qué tema suena.
 */
export function MusicControl({
  state: initial,
  tracks,
  control,
  manageHint = true,
  library,
}: {
  state: MusicState
  tracks: MusicTrack[]
  control: (action: Action, value?: string) => Promise<ActionState & { state?: MusicState }>
  /** mostrar cómo cargar temas cuando no hay */
  manageHint?: boolean
  /** lista para subir/ordenar/borrar temas (se abre con "Subir y ordenar temas") */
  library?: ReactNode
}) {
  const [showLibrary, setShowLibrary] = useState(false)
  const router = useRouter()
  const [state, setState] = useState(initial)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showList, setShowList] = useState(false)
  const active = tracks.filter((t) => t.active)

  useEffect(() => setState(initial), [initial])
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 10_000)
    return () => clearInterval(t)
  }, [router])

  const send = (action: Action, value?: string, optimistic?: Partial<MusicState>) => {
    setError(null)
    if (optimistic) setState((s) => ({ ...s, ...optimistic }))
    start(async () => {
      const r = await control(action, value)
      if (!r.ok) setError(r.message ?? 'No se pudo.')
      else if (r.state) setState((s) => ({ ...s, ...r.state, now_id: s.now_id, now_title: s.now_title }))
      router.refresh()
    })
  }

  const btn = 'grid h-14 w-14 place-items-center rounded-xl border border-zinc-700 text-white hover:border-[#edcc36] disabled:opacity-40'

  return (
    <section aria-labelledby="music-title" className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="music-title" className="flex items-center gap-2 font-bold text-white">
          <Music className="h-4 w-4 text-[#edcc36]" aria-hidden="true" /> Música en la TV
        </h2>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" aria-label="Enviando" />}
      </div>

      {!active.length ? (
        <p className="text-sm text-zinc-400">
          Todavía no hay música cargada.{manageHint && library ? ' Subí tus temas acá abajo.' : ''}
        </p>
      ) : (
        <>
          <p className="min-h-[1.5rem] truncate text-sm text-zinc-300" aria-live="polite">
            {state.playing ? (state.now_title ? <>Sonando: <strong className="text-white">{state.now_title}</strong></> : 'Arrancando…') : 'En pausa'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btn} disabled={pending} onClick={() => send('prev')} aria-label="Tema anterior">
              <SkipBack className="h-5 w-5" aria-hidden="true" />
            </button>
            {state.playing ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => send('pause', undefined, { playing: false })}
                className="inline-flex min-h-[56px] items-center gap-2 rounded-xl bg-white px-5 font-bold text-black"
              >
                <Pause className="h-5 w-5" aria-hidden="true" /> Pausar
              </button>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => send('play', undefined, { playing: true })}
                className="inline-flex min-h-[56px] items-center gap-2 rounded-xl bg-emerald-500 px-5 font-bold text-black"
              >
                <Play className="h-5 w-5" aria-hidden="true" /> Reproducir
              </button>
            )}
            <button type="button" className={btn} disabled={pending} onClick={() => send('next')} aria-label="Tema siguiente">
              <SkipForward className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={state.shuffle}
              disabled={pending}
              onClick={() => send('shuffle', String(!state.shuffle), { shuffle: !state.shuffle })}
              aria-label="Aleatorio"
              title={state.shuffle ? 'Aleatorio: sí' : 'Aleatorio: no'}
              className={`${btn} ${state.shuffle ? 'border-[#edcc36] text-[#edcc36]' : 'text-zinc-500'}`}
            >
              <Shuffle className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className={btn}
              disabled={pending || state.volume <= 0}
              onClick={() => {
                const v = Math.max(0, state.volume - 10)
                send('volume', String(v), { volume: v })
              }}
              aria-label="Bajar volumen"
            >
              <Volume1 className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="h-2 overflow-hidden rounded-full bg-zinc-800" aria-hidden="true">
                <div className="h-full bg-[#edcc36]" style={{ width: `${state.volume}%` }} />
              </div>
              <p className="mt-1 text-center text-xs text-zinc-400">Volumen {state.volume}%</p>
            </div>
            <button
              type="button"
              className={btn}
              disabled={pending || state.volume >= 100}
              onClick={() => {
                const v = Math.min(100, state.volume + 10)
                send('volume', String(v), { volume: v })
              }}
              aria-label="Subir volumen"
            >
              <Volume2 className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            aria-expanded={showList}
            onClick={() => setShowList((v) => !v)}
            className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-[#edcc36]"
          >
            <ListMusic className="h-4 w-4" aria-hidden="true" /> {showList ? 'Ocultar temas' : `Elegir tema (${active.length})`}
          </button>
          {showList && (
            <ul className="max-h-72 divide-y divide-zinc-900 overflow-y-auto rounded-xl border border-zinc-800">
              {active.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => send('track', t.id, { playing: true })}
                    className={`flex min-h-[48px] w-full items-center justify-between gap-3 px-3 text-left text-sm hover:bg-zinc-900 ${
                      state.now_id === t.id ? 'font-bold text-[#edcc36]' : 'text-zinc-200'
                    }`}
                  >
                    <span className="truncate">{t.title}</span>
                    <span className="shrink-0 text-xs text-zinc-500">{fmtDuration(t.duration_s)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {library && (
        <div className="space-y-3 border-t border-zinc-800 pt-3">
          {active.length > 0 && (
            <button
              type="button"
              aria-expanded={showLibrary}
              onClick={() => setShowLibrary((v) => !v)}
              className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-[#edcc36]"
            >
              <Upload className="h-4 w-4" aria-hidden="true" /> {showLibrary ? 'Ocultar temas cargados' : 'Subir y ordenar temas'}
            </button>
          )}
          {(showLibrary || !active.length) && library}
        </div>
      )}
      {state.tv_linked === false && <p className="text-xs text-amber-300">No hay una TV vinculada: vinculala en Pantallas → TV de la sala.</p>}
      {error && (
        <p role="alert" className="text-sm text-amber-300">
          {error}
        </p>
      )}
      <p className="text-xs text-zinc-500">La TV hace el cambio en unos segundos. La primera vez, apretá OK en el control de la TV para habilitar el sonido.</p>
    </section>
  )
}
