import { getAdminContext } from '@/features/admin/context'

/** Las pestañas de la sección «Caja» las arma el panel (features/admin/sections.ts). */
export default async function PagosLayout({ children, params }: LayoutProps<'/[org]/admin/pagos'>) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  // Profes: solo venden (sin caja, pagos ni productos) → una sola pantalla, sin pestañas
  const onlySells = ctx && !ctx.can('billing.read') && ctx.can('sales.write')
  return (
    <div className="space-y-5">
      {onlySells && <h1 className="text-2xl font-extrabold text-white">Vender</h1>}
      {children}
    </div>
  )
}
