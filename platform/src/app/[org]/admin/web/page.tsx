import type { Metadata } from 'next'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { saveWebProfile } from '@/features/admin/web-actions'
import { WebEditor, type WebValues } from '@/features/admin/WebEditor'

export const metadata: Metadata = { title: 'Web' }

export default async function WebPage({ params }: PageProps<'/[org]/admin/web'>) {
  const { org: slug } = await params
  const ctx = (await getAdminContext(slug))!
  if (!ctx.can('org.manage')) return <p className="text-sm text-zinc-400">Solo el dueño o un administrador edita la web.</p>

  const supabase = await createClient()
  const { data: org } = await supabase.from('organizations').select('public_profile, opening_hours').eq('id', ctx.org.id).single()

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-extrabold text-white">Web del gimnasio</h1>
      <p className="text-sm text-zinc-400">
        Lo que cambies acá se publica en la página pública. Planes y actividades se editan en Pagos y Agenda.
      </p>
      <WebEditor
        action={saveWebProfile.bind(null, slug)}
        values={(org?.public_profile ?? {}) as WebValues}
        hours={(org?.opening_hours ?? []) as { weekday: number; open: string; close: string }[]}
        orgId={ctx.org.id}
        publicUrl={`/${slug}`}
      />
    </div>
  )
}
