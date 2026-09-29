import type { Metadata } from 'next'
import { Plus } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { saveClassType } from '@/features/admin/schedule-actions'
import { ClassTypeForm } from '@/features/admin/ScheduleForms'

export const metadata: Metadata = { title: 'Actividades' }

export default async function ActivitiesPage({ params }: PageProps<'/[org]/admin/agenda/actividades'>) {
  const { org: slug } = await params
  const ctx = (await getAdminContext(slug))!
  if (!ctx.can('schedule.manage')) return <p className="text-sm text-zinc-400">No tenés permiso.</p>

  const supabase = await createClient()
  const { data: types } = await supabase
    .from('class_types')
    .select('id, name, description, color, default_duration_min, default_capacity, equipment_kind, active')
    .eq('org_id', ctx.org.id)
    .order('active', { ascending: false })
    .order('name')

  return (
    <div className="space-y-4">
      <details className="rounded-2xl border border-dashed border-zinc-700 p-4 open:border-solid open:border-[#edcc36]/40">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-[#edcc36]">
          <Plus className="h-4 w-4" aria-hidden="true" /> Nueva actividad
        </summary>
        <div className="mt-4">
          <ClassTypeForm action={saveClassType.bind(null, slug, null)} />
        </div>
      </details>
      <ul className="space-y-3">
        {(types ?? []).map((t) => (
          <li key={t.id} className={`rounded-2xl border border-zinc-800/80 bg-zinc-950 ${t.active ? '' : 'opacity-60'}`}>
            <details>
              <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
                <span className="h-6 w-6 shrink-0 rounded-md" style={{ background: t.color }} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="font-bold text-white">{t.name}</span>
                  <span className="block text-xs text-zinc-500">
                    {t.default_duration_min} min · cupo {t.default_capacity}
                    {t.equipment_kind && ` · usa ${t.equipment_kind}`}
                    {!t.active && ' · desactivada'}
                  </span>
                </span>
              </summary>
              <div className="border-t border-zinc-900 p-4">
                <ClassTypeForm
                  action={saveClassType.bind(null, slug, t.id)}
                  values={{
                    name: t.name,
                    description: t.description,
                    color: t.color,
                    duration: t.default_duration_min,
                    capacity: t.default_capacity,
                    equipmentKind: t.equipment_kind,
                    active: t.active,
                  }}
                />
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  )
}
