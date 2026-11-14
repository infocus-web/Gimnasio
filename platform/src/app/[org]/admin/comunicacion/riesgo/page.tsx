import { redirect } from 'next/navigation'
import type { Route } from 'next'

/** Esta pantalla se mudó a /admin/socios/riesgo (reorganización del menú por secciones). */
export default async function OldRiesgoRedirect({ params }: PageProps<'/[org]/admin/comunicacion/riesgo'>) {
  const { org: slug } = await params
  redirect(`/${slug}/admin/socios/riesgo` as Route)
}
