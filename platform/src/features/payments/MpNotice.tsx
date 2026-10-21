import Link from 'next/link'
import type { Route } from 'next'
import { PlugZap } from 'lucide-react'

/** Aviso "Conectá Mercado Pago" (sin credenciales cargadas en el servidor). */
export function MpNotice({ slug, compact = false }: { slug: string; compact?: boolean }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4 text-sm text-sky-100">
      <PlugZap className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-semibold">Conectá Mercado Pago</p>
        <p className="text-sky-100/80">
          Para que los socios paguen su plan desde la app (y mandar links de pago por WhatsApp) falta cargar las credenciales de
          Mercado Pago en el servidor.
          {compact && (
            <>
              {' '}
              <Link href={`/${slug}/admin/pagos/online` as Route} className="font-semibold text-sky-200 underline">
                Ver cómo
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
