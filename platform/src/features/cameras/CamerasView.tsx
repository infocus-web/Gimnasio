'use client'

import { useCallback, useEffect, useState } from 'react'
import { Maximize2, X } from 'lucide-react'
import { CameraPlayer } from './CameraPlayer'

export interface CameraInfo {
  id: string
  name: string
  online: boolean
}

/** Grilla de cámaras en calidad liviana; tocando una se abre en grande y en alta calidad. */
export function CamerasView({ cameras, getUrl }: { cameras: CameraInfo[]; getUrl: (stream: string) => Promise<string | null> }) {
  const [big, setBig] = useState<CameraInfo | null>(null)
  const get = useCallback((s: string) => getUrl(s), [getUrl])

  useEffect(() => {
    if (!big) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setBig(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [big])

  return (
    <>
      <div className={`grid gap-3 ${cameras.length > 1 ? 'sm:grid-cols-2' : ''} ${cameras.length > 4 ? 'xl:grid-cols-3' : ''}`}>
        {cameras.map((c) => (
          <figure key={c.id} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
            {/* Con la vista grande abierta, la grilla se pausa para no gastar la conexión del gimnasio */}
            {big ? (
              <div className="aspect-video bg-black" />
            ) : (
              <CameraPlayer stream={c.id} getUrl={get} className="aspect-video" />
            )}
            <figcaption className="flex min-h-[48px] items-center gap-2 px-3">
              <span className={`h-2 w-2 shrink-0 rounded-full ${c.online ? 'bg-emerald-400' : 'bg-red-400'}`} aria-hidden="true" />
              <span className="flex-1 truncate text-sm font-semibold text-white">{c.name}</span>
              {!c.online && <span className="text-xs text-red-300">No responde</span>}
              <button
                type="button"
                onClick={() => setBig(c)}
                aria-label={`Ver ${c.name} en grande`}
                className="grid h-10 w-10 place-items-center rounded-lg text-zinc-300 hover:bg-zinc-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
              >
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </figcaption>
          </figure>
        ))}
      </div>

      {big && (
        <div role="dialog" aria-modal="true" aria-label={big.name} className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex min-h-[56px] items-center gap-3 px-4">
            <span className="flex-1 truncate font-semibold text-white">{big.name}</span>
            <button
              type="button"
              onClick={() => setBig(null)}
              aria-label="Cerrar"
              className="grid h-11 w-11 place-items-center rounded-xl text-zinc-200 hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <CameraPlayer key={big.id} stream={`${big.id}_hd`} getUrl={get} className="flex-1" />
        </div>
      )}
    </>
  )
}
