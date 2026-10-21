import type { Metadata } from 'next'
import { getMemberContext } from '@/lib/member-context'
import { GuestsScreen } from './GuestsScreen'

export const metadata: Metadata = { title: 'Invitados' }

export default async function GuestsPage({ params }: PageProps<'/[org]/app/invitados'>) {
  const { org: slug } = await params
  const ctx = await getMemberContext(slug)
  if ('error' in ctx) return null // el layout ya muestra el aviso
  return <GuestsScreen timezone={ctx.org.timezone} />
}
