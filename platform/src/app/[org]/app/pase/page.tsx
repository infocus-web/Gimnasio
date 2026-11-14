import type { Metadata } from 'next'
import { BuffetTeaser } from '@/features/buffet/BuffetTeaser'
import { PassScreen } from './PassScreen'

export const metadata: Metadata = { title: 'Mi pase' }

export default async function PasePage({ params }: PageProps<'/[org]/app/pase'>) {
  const { org } = await params
  return (
    <div className="space-y-4">
      <PassScreen />
      <BuffetTeaser slug={org} />
    </div>
  )
}
