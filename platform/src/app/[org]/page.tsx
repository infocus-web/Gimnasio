import { redirect } from 'next/navigation'
import type { Route } from 'next'

export default async function OrgHome({ params }: PageProps<'/[org]'>) {
  const { org } = await params
  redirect(`/${org}/app/pase` as Route)
}
