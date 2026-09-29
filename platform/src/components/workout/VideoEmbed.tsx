'use client'

import { ExternalLink } from 'lucide-react'

/** YouTube (watch, youtu.be, shorts), Vimeo y archivos .mp4/.webm; el resto (Instagram, TikTok…) como link */
function parse(url: string): { kind: 'youtube' | 'vimeo' | 'file' | 'link'; src: string } {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\.|^m\./, '')
    if (host === 'youtu.be') return { kind: 'youtube', src: u.pathname.slice(1) }
    if (host === 'youtube.com' || host === 'music.youtube.com') {
      const id = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/)?.[1]
      if (id) return { kind: 'youtube', src: id }
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.match(/^\/(\d+)/)?.[1]
      if (id) return { kind: 'vimeo', src: id }
    }
    if (/\.(mp4|webm|mov)$/i.test(u.pathname)) return { kind: 'file', src: url }
  } catch {
    /* link inválido */
  }
  return { kind: 'link', src: url }
}

export function VideoEmbed({ url, title }: { url: string; title: string }) {
  const v = parse(url)
  if (v.kind === 'youtube' || v.kind === 'vimeo') {
    const src =
      v.kind === 'youtube'
        ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.src)}?rel=0&playsinline=1&loop=1&playlist=${encodeURIComponent(v.src)}`
        : `https://player.vimeo.com/video/${encodeURIComponent(v.src)}?loop=1`
    return (
      <iframe
        src={src}
        title={`Video: ${title}`}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        className="h-full w-full"
      />
    )
  }
  if (v.kind === 'file') {
    return <video src={v.src} controls autoPlay loop playsInline className="h-full w-full object-cover" />
  }
  return (
    <a href={v.src} target="_blank" rel="noreferrer"
      className="flex h-full w-full items-center justify-center gap-2 text-sm font-semibold text-[#edcc36]">
      <ExternalLink className="h-5 w-5" aria-hidden="true" /> Abrir el video
    </a>
  )
}
