import type { Metadata } from 'next'
import { Wrench, Check } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { addEquipment, saveRoom, setEquipmentStatus } from '@/features/admin/schedule-actions'
import { EquipmentForm, RoomForm } from '@/features/admin/ScheduleForms'
import { Card } from '@/features/admin/ui'

export const metadata: Metadata = { title: 'Salas y equipos' }

export default async function RoomsPage({ params }: PageProps<'/[org]/admin/agenda/salas'>) {
  const { org: slug } = await params
  const ctx = (await getAdminContext(slug))!
  if (!ctx.can('schedule.manage')) return <p className="text-sm text-zinc-400">No tenés permiso.</p>

  const supabase = await createClient()
  const [{ data: rooms }, { data: equipment }] = await Promise.all([
    supabase.from('rooms').select('id, name, capacity, active').eq('org_id', ctx.org.id).order('active', { ascending: false }).order('name'),
    supabase.from('equipment').select('id, room_id, kind, label, status').eq('org_id', ctx.org.id).neq('status', 'retired'),
  ])
  const sortLabel = (a: string, b: string) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')) || a.localeCompare(b)

  return (
    <div className="space-y-5">
      <Card title="Nueva sala">
        <RoomForm action={saveRoom.bind(null, slug, null)} />
      </Card>

      {(rooms ?? []).map((r) => {
        const eq = (equipment ?? []).filter((e) => e.room_id === r.id)
        const kinds = [...new Set(eq.map((e) => e.kind))]
        return (
          <section key={r.id} className={`space-y-4 rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4 ${r.active ? '' : 'opacity-60'}`}>
            <RoomForm action={saveRoom.bind(null, slug, r.id)} values={{ name: r.name, capacity: r.capacity, active: r.active }} />
            {kinds.map((k) => (
              <div key={k}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {k} · {eq.filter((e) => e.kind === k && e.status === 'active').length} activos
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {eq
                    .filter((e) => e.kind === k)
                    .sort((a, b) => sortLabel(a.label, b.label))
                    .map((e) => (
                      <li key={e.id}>
                        <form action={setEquipmentStatus.bind(null, slug, e.id, e.status === 'active' ? 'maintenance' : 'active')}>
                          <button
                            type="submit"
                            title={e.status === 'active' ? 'Marcar en mantenimiento' : 'Volver a activo'}
                            className={`inline-flex min-h-[40px] items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold ${
                              e.status === 'active'
                                ? 'border-zinc-700 text-zinc-200 hover:border-amber-500/50'
                                : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                            }`}
                          >
                            {e.status === 'active' ? <Check className="h-3 w-3" aria-hidden="true" /> : <Wrench className="h-3 w-3" aria-hidden="true" />}
                            {e.label}
                          </button>
                        </form>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
            <details>
              <summary className="cursor-pointer text-xs font-semibold text-[#edcc36]">+ Agregar equipos (bicis, remos…)</summary>
              <div className="mt-3">
                <EquipmentForm action={addEquipment.bind(null, slug, r.id)} />
              </div>
            </details>
          </section>
        )
      })}
      <p className="text-xs text-zinc-500">
        Tocá un equipo para pasarlo a mantenimiento: deja de ofrecerse en las reservas hasta que lo vuelvas a activar.
      </p>
    </div>
  )
}
