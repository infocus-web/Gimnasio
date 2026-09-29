import { SubNav } from '@/features/admin/SubNav'
import { getAdminContext } from '@/features/admin/context'

export default async function AgendaLayout({ children, params }: LayoutProps<'/[org]/admin/agenda'>) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  const base = `/${slug}/admin/agenda`
  const manage = ctx?.can('schedule.manage')
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-white">Agenda</h1>
      <SubNav
        items={[
          { href: base, label: 'Semana' },
          ...(manage
            ? [
                { href: `${base}/grilla`, label: 'Grilla semanal' },
                { href: `${base}/actividades`, label: 'Actividades' },
                { href: `${base}/salas`, label: 'Salas y equipos' },
              ]
            : []),
        ]}
      />
      {children}
    </div>
  )
}
