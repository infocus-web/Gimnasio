import { SubNav } from '@/features/admin/SubNav'
import { getAdminContext } from '@/features/admin/context'

export default async function PagosLayout({ children, params }: LayoutProps<'/[org]/admin/pagos'>) {
  const { org: slug } = await params
  const base = `/${slug}/admin/pagos`
  const ctx = await getAdminContext(slug)
  const isAdmin = ctx?.staff.role === 'owner' || ctx?.staff.role === 'admin'
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-white">Pagos</h1>
      <SubNav
        items={[
          { href: base, label: 'Caja' },
          { href: `${base}/vender`, label: 'Vender' },
          { href: `${base}/cierre`, label: 'Cierre de caja' },
          { href: `${base}/deudores`, label: 'Vencidos' },
          { href: `${base}/online`, label: 'Pagos online' },
          { href: `${base}/productos`, label: 'Productos' },
          ...(isAdmin ? [{ href: `${base}/ganancias`, label: 'Ganancias' }] : []),
          { href: `${base}/planes`, label: 'Planes' },
        ]}
      />
      {children}
    </div>
  )
}
