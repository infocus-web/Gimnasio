import { redirect } from 'next/navigation'
import type { Route } from 'next'

export default async function MemberHome({ params }: PageProps<'/[org]/app'>) {
  const { org } = await params
  redirect(`/${org}/app/pase` as Route)
}
