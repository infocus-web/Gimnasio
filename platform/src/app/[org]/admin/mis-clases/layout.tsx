import { SubNav } from '@/features/admin/SubNav'
import { getAdminContext } from '@/features/admin/context'

/** Panel del profe: sus clases, su grilla, el control de socios y sus mensajes de WhatsApp */
export default async function MyClassesLayout({ children, params }: LayoutProps<'/[org]/admin/mis-clases'>) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  const base = `/${slug}/admin/mis-clases`
  const manage = ctx?.can('schedule.own') || ctx?.can('schedule.manage')
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-white">Mis clases</h1>
      <SubNav
        items={[
          { href: base, label: 'Clases' },
          ...(manage ? [{ href: `${base}/horarios`, label: 'Mis horarios' }] : []),
          { href: `${base}/socios`, label: 'Socios' },
          { href: `${base}/mensajes`, label: 'Mensajes' },
          { href: `${base}/pizarra`, label: 'Pizarra TV' },
        ]}
      />
      {children}
    </div>
  )
}
