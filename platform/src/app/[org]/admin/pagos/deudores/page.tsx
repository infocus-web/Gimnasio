import { redirect } from 'next/navigation'
import type { Route } from 'next'

/** Esta pantalla se mudó a /admin/socios/vencidos (reorganización del menú por secciones). */
export default async function OldDeudoresRedirect({ params }: PageProps<'/[org]/admin/pagos/deudores'>) {
  const { org: slug } = await params
  redirect(`/${slug}/admin/socios/vencidos` as Route)
}
