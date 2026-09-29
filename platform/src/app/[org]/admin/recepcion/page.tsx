import type { Metadata } from 'next'
import { getStaffContext } from '@/lib/member-context'
import { ReceptionScreen } from './ReceptionScreen'

export const metadata: Metadata = { title: 'Recepción' }

export default async function RecepcionPage({ params }: PageProps<'/[org]/admin/recepcion'>) {
  const { org: slug } = await params
  const ctx = await getStaffContext(slug)

  if (!ctx || !ctx.org.locationId) {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-sm space-y-2">
          <h1 className="text-xl font-bold text-white">Acceso solo para el staff</h1>
          <p className="text-sm text-zinc-400">Ingresá con una cuenta de recepción o administración de este gimnasio.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <ReceptionScreen orgId={ctx.org.id} locationId={ctx.org.locationId} />
    </main>
  )
}
