'use client'

import { useEffect, useRef, useState } from 'react'
import { Share, SquarePlus, Compass, X, TriangleAlert } from 'lucide-react'

/**
 * Botón "Instalar en iPhone" de la web pública.
 * En iPhone no hay archivo para descargar: la app se instala desde Safari con "Agregar a pantalla de inicio".
 * Ojo: iOS guarda la dirección de la página donde estás, por eso el paso 1 lleva a la app (no a esta web).
 */
export function IosInstallButton({ appHref }: { appHref: string }) {
  const [open, setOpen] = useState(false)
  const [inApp, setInApp] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Navegadores metidos dentro de otras apps (Instagram, Facebook, TikTok…): desde ahí no se puede instalar
    setInApp(/Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|Line\//i.test(navigator.userAgent))
  }, [])

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative inline-flex min-h-[54px] items-center justify-between gap-5 rounded-xl border border-[#444] bg-[#2c2c2c]/90 py-3 pl-6 pr-3 transition-colors duration-200 hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-[0.98]"
      >
        <span className="whitespace-nowrap text-[15px] font-semibold text-white">App para iPhone</span>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-black transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true">
          <Share className="h-4 w-4" strokeWidth={2.5} />
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="ios-install-title" className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#1c1c1c] p-6 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="ios-install-title" className="text-xl font-bold">Instalá la app en tu iPhone</h2>
                <p className="mt-1 text-sm text-white/60">Gratis y sin App Store. Te queda el ícono de Evolution en la pantalla.</p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {inApp && (
              <p className="mt-4 flex gap-2 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Estás dentro de Instagram (o de otra app). Tocá los <strong>tres puntitos ···</strong> y elegí <strong>“Abrir en el navegador”</strong>; después volvé a este botón.
                </span>
              </p>
            )}

            <ol className="mt-5 space-y-4">
              <li className="flex gap-3">
                <Step n={1} />
                <div className="text-[15px]">
                  <p>
                    Abrí la app en <strong>Safari</strong> <Compass className="mb-0.5 inline h-4 w-4 text-brand" aria-hidden="true" />
                  </p>
                  <a
                    href={appHref}
                    className="mt-2 inline-flex min-h-[44px] items-center rounded-lg bg-brand px-4 font-semibold text-black hover:bg-[#f5db5c]"
                  >
                    Abrir la app
                  </a>
                </div>
              </li>
              <li className="flex gap-3">
                <Step n={2} />
                <p className="text-[15px]">
                  Ya en la app, tocá <strong>Compartir</strong> <Share className="mb-0.5 inline h-4 w-4 text-brand" aria-hidden="true" /> (abajo en el medio, o
                  arriba a la derecha en iPad).
                </p>
              </li>
              <li className="flex gap-3">
                <Step n={3} />
                <p className="text-[15px]">
                  Bajá y elegí <strong>“Agregar a pantalla de inicio”</strong> <SquarePlus className="mb-0.5 inline h-4 w-4 text-brand" aria-hidden="true" />.
                  Después tocá <strong>Agregar</strong>.
                </p>
              </li>
            </ol>

            <p className="mt-5 border-t border-white/10 pt-4 text-sm text-white/55">
              La primera vez que la abras desde el ícono, iniciá sesión con tu email. Después queda guardada.
            </p>
          </div>
        </div>
      )}
    </>
  )
}

function Step({ n }: { n: number }) {
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-black" aria-hidden="true">
      {n}
    </span>
  )
}
