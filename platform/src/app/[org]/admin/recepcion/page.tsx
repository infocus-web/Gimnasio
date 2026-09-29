import type { Metadata } from 'next'
import { getAdminContext } from '@/features/admin/context'
import { ReceptionScreen } from './ReceptionScreen'

export const metadata: Metadata = { title: 'Recepción' }

export default async function RecepcionPage({ params }: PageProps<'/[org]/admin/recepcion'>) {
  const { org: slug } = await params
  const ctx = (await getAdminContext(slug))!

  if (!ctx.can('checkins.manage') || !ctx.org.locationId) {
    return <p className="text-sm text-zinc-400">Tu rol no tiene acceso a la recepción.</p>
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <ReceptionScreen orgId={ctx.org.id} locationId={ctx.org.locationId} />
    </div>
  )
}
