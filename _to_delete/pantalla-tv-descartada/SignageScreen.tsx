'use client'

import { useEffect, useState } from 'react'
import { BRAND, WEB_MEDIA } from '@/features/public/media'

/** Si todavía no se cargó publicidad, pasan las fotos de la web */
const FALLBACK = [WEB_MEDIA.app, ...WEB_MEDIA.gallery, WEB_MEDIA.cta]
const REFRESH_MS = 5 * 60_000

export function SignageScreen({ slug, gymName, seconds }: { slug: string; gymName: string; seconds: number }) {
  const [slides, setSlides] = useState<string[]>([])
  const [i, setI] = useState(0)
  const list = slides.length ? slides : FALLBACK

  // Las imágenes se leen al abrir y cada 5 minutos: los cambios del panel llegan solos
  useEffect(() => {
    let stop = false
    const load = async () => {
      try {
        const r = await fetch(`/api/access/turnstile/slides?org=${encodeURIComponent(slug)}`, { cache: 'no-store' })
        if (!r.ok) return
        const j = (await r.json()) as { slides?: string[] }
        if (stop || !Array.isArray(j.slides)) return
        for (const u of j.slides) new window.Image().src = u // precarga: sin huecos negros al cambiar
        setSlides((prev) => (prev.join('|') === j.slides!.join('|') ? prev : j.slides!))
      } catch {
        /* sin conexión: sigue con las que tenía */
      }
    }
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [slug])

  useEffect(() => {
    setI(0)
    if (list.length < 2) return
    const t = setInterval(() => setI((n) => (n + 1) % list.length), seconds * 1000)
    return () => clearInterval(t)
  }, [list, seconds])

  // Una vez por día se recarga la página entera (toma las mejoras de la web sin tocar el televisor)
  useEffect(() => {
    const t = setTimeout(() => window.location.reload(), 24 * 3600_000)
    return () => clearTimeout(t)
  }, [])

  return (
    <main
      className="fixed inset-0 cursor-none overflow-hidden bg-black"
      onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
    >
      <h1 className="sr-only">{gymName}</h1>
      {list.map((src, n) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-1000 ${n === i ? 'opacity-100' : 'opacity-0'}`}
        />
      ))}
      {!slides.length && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={BRAND.logo} alt="" className="absolute bottom-8 left-1/2 h-auto w-72 -translate-x-1/2 drop-shadow-lg" />
      )}
    </main>
  )
}
