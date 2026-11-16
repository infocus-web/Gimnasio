'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, VideoOff } from 'lucide-react'

type PlayerEl = HTMLElement & { src: string; wsURL: string; video?: HTMLVideoElement }

/** Registra <evo-camera> (reproductor de go2rtc, solo MSE, sin audio ni controles). */
async function defineElement() {
  if (customElements.get('evo-camera')) return
  const { VideoRTC } = (await import('./video-rtc.js')) as unknown as { VideoRTC: CustomElementConstructor }
  class EvoCamera extends (VideoRTC as unknown as { new (): HTMLElement & Record<string, unknown> }) {
    constructor() {
      super()
      this.mode = 'mse'
      this.media = 'video'
    }
    oninit() {
      ;(VideoRTC.prototype as unknown as { oninit: () => void }).oninit.call(this)
      const v = this.video as HTMLVideoElement
      v.controls = false
      v.muted = true
      v.style.objectFit = 'contain'
      v.style.background = '#000'
    }
  }
  if (!customElements.get('evo-camera')) customElements.define('evo-camera', EvoCamera as unknown as CustomElementConstructor)
}

/**
 * Una cámara en vivo. `getUrl` (acción del servidor) devuelve la dirección del túnel con un pase firmado.
 * El pase se renueva solo: cada minuto mientras no hay imagen (por si cambió el túnel) y cada 50 minutos con imagen.
 */
export function CameraPlayer({ stream, getUrl, className }: { stream: string; getUrl: (stream: string) => Promise<string | null>; className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'playing' | 'error'>('loading')

  useEffect(() => {
    let el: PlayerEl | null = null
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let lastFetch = 0

    const refresh = async () => {
      const url = await getUrl(stream).catch(() => null)
      lastFetch = Date.now()
      if (!alive) return
      if (!url) {
        setState('error')
        return
      }
      if (!el) {
        el = document.createElement('evo-camera') as PlayerEl
        el.style.display = 'block'
        el.style.width = '100%'
        el.style.height = '100%'
        host.current?.appendChild(el)
        el.src = url
        el.video?.addEventListener('playing', () => alive && setState('playing'))
        el.video?.addEventListener('waiting', () => alive && setState('loading'))
      } else {
        el.wsURL = url // la usa la próxima reconexión
      }
    }

    const tick = async () => {
      const playing = !!el?.video && el.video.readyState >= 2 && !el.video.paused
      if (!playing || Date.now() - lastFetch > 50 * 60_000) await refresh()
      if (alive) timer = setTimeout(tick, 60_000)
    }

    void defineElement().then(async () => {
      await refresh()
      if (alive) timer = setTimeout(tick, 60_000)
    })

    return () => {
      alive = false
      clearTimeout(timer)
      el?.remove()
    }
  }, [stream, getUrl])

  return (
    <div className={`relative overflow-hidden bg-black ${className ?? ''}`}>
      <div ref={host} className="absolute inset-0" />
      {state !== 'playing' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-zinc-400">
          {state === 'loading' ? (
            <Loader2 className="h-6 w-6 animate-spin" aria-label="Conectando" />
          ) : (
            <span className="flex flex-col items-center gap-1 text-xs">
              <VideoOff className="h-6 w-6" aria-hidden="true" /> Sin imagen
            </span>
          )}
        </div>
      )}
    </div>
  )
}
