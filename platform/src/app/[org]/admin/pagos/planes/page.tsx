import type { Metadata } from 'next'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { saveRates } from '@/features/admin/billing-actions'
import { RatesForm, type RateGroup, type RateOther } from '@/features/admin/RatesForm'
import { periodOf } from '@/features/admin/rates'
import { Card } from '@/features/admin/ui'

export const metadata: Metadata = { title: 'Planes' }


export default async function PlansPage({ params }: PageProps<'/[org]/admin/pagos/planes'>) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx) return null // sin sesión de staff: el layout ya muestra el aviso
  if (!ctx.can('billing.read')) return <p className="text-sm text-zinc-400">No tenés permiso.</p>
  const canEdit = ctx.can('billing.write')

  const supabase = await createClient()
  const [{ data: plans }, { data: types }, { data: pct }, { data: counts }] = await Promise.all([
    supabase.from('membership_plans').select('*').eq('org_id', ctx.org.id).order('active', { ascending: false }).order('sort').order('price_cents'),
    supabase.from('class_types').select('id, name, color').eq('org_id', ctx.org.id).eq('active', true).order('name'),
    supabase.from('plan_class_types').select('plan_id, class_type_id').eq('org_id', ctx.org.id),
    supabase.from('member_directory').select('plan_id').eq('org_id', ctx.org.id).not('plan_id', 'is', null),
  ])
  const members = new Map<string, number>()
  for (const c of counts ?? []) members.set(c.plan_id!, (members.get(c.plan_id!) ?? 0) + 1)

  // Tarifas agrupadas por actividad: un plan "es de" una actividad si está limitado solo a ella
  const typesOf = new Map<string, string[]>()
  for (const x of pct ?? []) typesOf.set(x.plan_id, [...(typesOf.get(x.plan_id) ?? []), x.class_type_id])
  const ownerOf = (planId: string) => {
    const t = typesOf.get(planId) ?? []
    return t.length === 1 && (types ?? []).some((ct) => ct.id === t[0]) ? t[0]! : null
  }
  const activePlans = (plans ?? []).filter((p) => p.active)
  // Musculación primero, después el resto por nombre
  const orderedTypes = [...(types ?? [])].sort((a, b) => Number(b.name === 'Musculación') - Number(a.name === 'Musculación') || a.name.localeCompare(b.name))
  const groups: RateGroup[] = orderedTypes.map((t) => {
    const own = activePlans.filter((p) => ownerOf(p.id) === t.id)
    const openGym = t.name === 'Musculación' || (own.length > 0 && own.every((p) => p.includes_open_gym))
    return {
      typeId: t.id,
      name: t.name,
      color: t.color,
      openGym,
      options: own
        .sort((a, b) => a.sort - b.sort || b.price_cents - a.price_cents)
        .map((p) => ({
          id: p.id,
          perWeek: p.max_bookings_per_week,
          period: periodOf(p.billing_interval, p.interval_count),
          priceCents: p.price_cents,
          members: members.get(p.id) ?? 0,
        })),
    }
  })
  const others: RateOther[] = activePlans
    .filter((p) => !ownerOf(p.id))
    .map((p) => {
      const acts = (typesOf.get(p.id) ?? []).map((id) => (types ?? []).find((t) => t.id === id)?.name).filter(Boolean)
      return {
        id: p.id,
        name: p.name,
        detail: p.description || `${acts.length ? acts.join(' + ') : 'Todas las actividades'}${p.includes_open_gym ? ' · con musculación' : ''}`,
        priceCents: p.price_cents,
      }
    })

  return (
    <div className="space-y-4">
      {canEdit && (
        <Card title="Tarifas">
          <RatesForm action={saveRates.bind(null, slug)} groups={groups} others={others} />
        </Card>
      )}

      <p className="text-xs text-zinc-500">
        Cambiar el precio no modifica lo que ya pagaron los socios: aplica a los próximos cobros.
      </p>

    </div>
  )
}
