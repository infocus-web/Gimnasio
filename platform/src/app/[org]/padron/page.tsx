import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicGym } from '@/features/public/profile'
import { submitStaffRequest } from '@/features/admin/padron-actions'
import { PadronForm } from './PadronForm'

export const metadata: Metadata = {
  title: 'Padrón del equipo',
  robots: { index: false, follow: false },
}

export default async function PadronPage({ params }: PageProps<'/[org]/padron'>) {
  const { org: slug } = await params
  const gym = await getPublicGym(slug)
  if (!gym) notFound()
  return <PadronForm gymName={gym.name} action={submitStaffRequest.bind(null, slug)} />
}
