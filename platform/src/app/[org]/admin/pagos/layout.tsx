import { SubNav } from '@/features/admin/SubNav'

export default async function PagosLayout({ children, params }: LayoutProps<'/[org]/admin/pagos'>) {
  const { org: slug } = await params
  const base = `/${slug}/admin/pagos`
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-white">Pagos</h1>
      <SubNav
        items={[
          { href: base, label: 'Caja' },
          { href: `${base}/deudores`, label: 'Vencidos' },
          { href: `${base}/planes`, label: 'Planes' },
        ]}
      />
      {children}
    </div>
  )
}
