'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

/** Error inesperado en cualquier pantalla: mensaje claro y "Reintentar", en vez del error en inglés de Next. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <main className="grid min-h-[70dvh] place-items-center p-6 text-center">
      <div className="max-w-sm space-y-4">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-red-500/40 bg-red-500/10">
          <AlertTriangle className="h-7 w-7 text-red-300" aria-hidden="true" />
        </span>
        <h1 className="text-xl font-extrabold text-white">Algo salió mal</h1>
        <p className="text-sm text-zinc-400">
          Probá de nuevo. Si vuelve a pasar, revisá tu conexión a internet o avisá en el gimnasio.
          {error.digest && <span className="mt-1 block font-mono text-xs text-zinc-600">Código: {error.digest}</span>}
        </p>
        <div className="flex justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="btn-tac inline-flex min-h-[44px] items-center rounded-xl bg-[#edcc36] px-5 text-sm font-bold text-black"
          >
            Reintentar
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex min-h-[44px] items-center rounded-xl border border-zinc-700 px-4 text-sm font-semibold text-zinc-200"
          >
            Recargar la página
          </button>
        </div>
      </div>
    </main>
  )
}
