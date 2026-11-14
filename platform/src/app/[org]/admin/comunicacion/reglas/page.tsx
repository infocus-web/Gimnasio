import { redirect } from 'next/navigation'
import type { Route } from 'next'

/** Esta pantalla se mudó a /admin/pagos/reglas (reorganización del menú por secciones). */
export default async function OldReglasRedirect({ params }: PageProps<'/[org]/admin/comunicacion/reglas'>) {
  const { org: slug } = await params
  redirect(`/${slug}/admin/pagos/reglas` as Route)
}
