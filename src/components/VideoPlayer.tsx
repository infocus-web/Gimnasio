import { useState } from 'react'
import { Play } from 'lucide-react'
import { videoSource } from '../lib/video'

/** Muestra un video de YouTube/Vimeo o un archivo subido. Carga el iframe recién al tocar play. */
export function VideoPlayer({ url, poster, title }: { url: string; poster?: string | null; title?: string }) {
  const src = videoSource(url)
  const [playing, setPlaying] = useState(false)
  if (!src) return null

  if (src.kind === 'file') {
    return (
      <video controls playsInline preload="metadata" poster={poster ?? undefined} className="aspect-video w-full rounded-xl bg-black">
        <source src={src.src} />
      </video>
    )
  }

  const thumb = poster || src.thumb
  if (!playing) {
    return (
      <button
        onClick={() => setPlaying(true)}
        className="group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-zinc-900"
        aria-label={`Reproducir ${title ?? 'video'}`}
      >
        {thumb && <img src={thumb} alt="" className="absolute inset-0 size-full object-cover opacity-80 transition group-hover:opacity-100" />}
        <span className="relative flex size-14 items-center justify-center rounded-full bg-brand-400 text-zinc-950 shadow-lg transition group-hover:scale-110">
          <Play className="ml-0.5 size-6 fill-current" />
        </span>
      </button>
    )
  }
  return (
    <iframe
      src={`${src.embed}${src.embed.includes('?') ? '&' : '?'}autoplay=1`}
      title={title ?? 'Video'}
      className="aspect-video w-full rounded-xl bg-black"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
    />
  )
}

export function videoThumb(url: string | null | undefined, fallback?: string | null) {
  if (fallback) return fallback
  const src = videoSource(url)
  return src && src.kind !== 'file' ? src.thumb : null
}
