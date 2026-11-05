import type { Metadata } from 'next'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { deleteTemplate, saveTemplate } from '@/features/admin/template-actions'
import { TemplatesManager, type TemplateRow } from '@/features/admin/TemplatesManager'

export const metadata: Metadata = { title: 'Mensajes predefinidos' }

/** Mensajes predefinidos de WhatsApp: los del gimnasio + los propios del profe */
export default async function TemplatesPage({ params }: PageProps<'/[org]/admin/mis-clases/mensajes'>) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx) return null
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('message_templates')
    .select('id, staff_id, label, body, sort')
    .eq('org_id', ctx.org.id)
    .order('sort')
    .order('label')
  if (error) {
    console.error('[mis-clases/mensajes]', error.message)
    return <p className="text-sm text-red-300">No se pudieron cargar los mensajes. Probá de nuevo en un rato.</p>
  }
  const canShare = ctx.can('members.write')
  const rows: TemplateRow[] = [...(data ?? [])]
    .sort((a, b) => Number(b.staff_id === ctx.staff.id) - Number(a.staff_id === ctx.staff.id))
    .map((t) => {
      const mine = t.staff_id === ctx.staff.id
      return {
        id: t.id,
        label: t.label,
        body: t.body,
        mine,
        editable: mine || (t.staff_id === null && canShare),
        saveAction: saveTemplate.bind(null, slug, t.id),
        deleteAction: deleteTemplate.bind(null, slug, t.id),
      }
    })

  return (
    <div className="space-y-4">
      <div className="space-y-1 text-sm text-zinc-400">
        <p>Son los botones que aparecen al mandar un WhatsApp (desde una clase, desde Socios o desde Mis alumnos). Tocás uno y el texto se carga solo.</p>
        <p className="text-xs text-zinc-500">
          Se reemplazan solos: <strong className="text-zinc-300">{'{nombre}'}</strong> (nombre del socio),{' '}
          <strong className="text-zinc-300">{'{profe}'}</strong> (tu nombre) y, si lo mandás desde una clase,{' '}
          <strong className="text-zinc-300">{'{clase}'}</strong>, <strong className="text-zinc-300">{'{dia}'}</strong> y{' '}
          <strong className="text-zinc-300">{'{hora}'}</strong>.
        </p>
      </div>
      <TemplatesManager rows={rows} createAction={saveTemplate.bind(null, slug, null)} canShare={canShare} profe={ctx.staff.display_name} />
    </div>
  )
}
