'use client'

import { useEffect } from 'react'

/**
 * Marca con data-in los elementos [data-reveal] / [data-reveal-fade] cuando entran en pantalla (una sola vez).
 * El estado oculto inicial solo se aplica si este script corre (atributo data-js-reveal en <html>, ver REVEAL_BOOT).
 */
export function RevealObserver() {
  useEffect(() => {
    const w = window as Window & { __revealReady?: boolean }
    w.__revealReady = true
    const els = document.querySelectorAll<HTMLElement>('[data-reveal],[data-reveal-fade]')
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.setAttribute('data-in', ''))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          e.target.setAttribute('data-in', '')
          io.unobserve(e.target)
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.15 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
  return null
}

/** Script inline: activa las animaciones antes de pintar; si el JS no arranca en 4 s, muestra todo igual. */
export const REVEAL_BOOT =
  "(function(){var d=document.documentElement;d.setAttribute('data-js-reveal','');setTimeout(function(){if(!window.__revealReady)d.removeAttribute('data-js-reveal')},4000)})()"
