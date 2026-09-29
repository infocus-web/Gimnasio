import type { Metadata } from 'next'
import { Plus } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { savePlan } from '@/features/admin/billing-actions'
import { formatMoney } from '@/features/admin/format'
import { PlanForm } from '@/features/admin/PlanForm'

export const metadata: Metadata = { title: 'Planes' }

const PERIOD: Record<string, string> = { day: 'día', week: 'semana', month: 'mes', year: 'año' }

export default async function PlansPage({ params }: PageProps<'/[org]/admin/pagos/planes'>) {
  const { org: slug } = await params
  const ctx = (await getAdminContext(slug))!
  if (!ctx.can('billing.read')) return <p className="text-sm text-zinc-400">No tenés permiso.</p>
  const canEdit = ctx.can('billing.write')

  const supabase = await createClient()
  const [{ data: plans }, { data: types }, { data: pct }, { data: counts }] = await Promise.all([
    supabase.from('membership_plans').select('*').eq('org_id', ctx.org.id).order('active', { ascending: false }).order('sort').order('price_cents'),
    supabase.from('class_types').select('id, name').eq('org_id', ctx.org.id).eq('active', true).order('name'),
    supabase.from('plan_class_types').select('plan_id, class_type_id').eq('org_id', ctx.org.id),
    supabase.from('member_directory').select('plan_id').eq('org_id', ctx.org.id).not('plan_id', 'is', null),
  ])
  const members = new Map<string, number>()
  for (const c of counts ?? []) members.set(c.plan_id!, (members.get(c.plan_id!) ?? 0) + 1)

  return (
    <div className="space-y-4">
      {canEdit && (
        <details className="rounded-2xl border border-dashed border-zinc-700 p-4 open:border-solid open:border-[#edcc36]/40">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-[#edcc36]">
            <Plus className="h-4 w-4" aria-hidden="true" /> Nuevo plan
          </summary>
          <div className="mt-4">
            <PlanForm action={savePlan.bind(null, slug, null)} classTypes={types ?? []} />
          </div>
        </details>
      )}

      <ul className="space-y-3">
        {(plans ?? []).map((p) => {
          const detail =
            p.kind === 'recurring'
              ? `por ${p.interval_count > 1 ? `${p.interval_count} ` : ''}${PERIOD[p.billing_interval ?? 'month']}${p.interval_count > 1 ? 'es' : ''}`
              : p.kind === 'class_pack'
                ? `${p.class_credits} clases · ${p.credits_valid_days ?? 30} días`
                : p.kind === 'trial'
                  ? 'prueba 7 días'
                  : 'clase suelta'
          return (
            <li key={p.id} className={`rounded-2xl border border-zinc-800/80 bg-zinc-950 ${p.active ? '' : 'opacity-60'}`}>
              <details>
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 p-4">
                  <span className="min-w-0 flex-1">
                    <span className="font-bold text-white">{p.name}</span>
                    <span className="block text-xs text-zinc-500">
                      {detail}
                      {p.max_members > 1 && ` · familiar hasta ${p.max_members}`}
                      {!p.is_public && ' · oculto en la web'}
                      {!p.active && ' · desactivado'}
                    </span>
                  </span>
                  <span className="text-xs text-zinc-400">{members.get(p.id) ?? 0} socios</span>
                  <span className="text-lg font-extrabold tabular-nums text-white">{formatMoney(p.price_cents, p.currency)}</span>
                </summary>
                {canEdit && (
                  <div className="border-t border-zinc-900 p-4">
                    <PlanForm
                      action={savePlan.bind(null, slug, p.id)}
                      classTypes={types ?? []}
                      values={{
                        name: p.name,
                        description: p.description,
                        kind: p.kind,
                        priceCents: p.price_cents,
                        billingInterval: p.billing_interval,
                        intervalCount: p.interval_count,
                        classCredits: p.class_credits,
                        creditsValidDays: p.credits_valid_days,
                        maxMembers: p.max_members,
                        maxBookingsPerWeek: p.max_bookings_per_week,
                        bookingWindowDays: p.booking_window_days,
                        isPublic: p.is_public,
                        active: p.active,
                        sort: p.sort,
                        classTypeIds: (pct ?? []).filter((x) => x.plan_id === p.id).map((x) => x.class_type_id),
                      }}
                    />
                  </div>
                )}
              </details>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-zinc-500">
        Cambiar el precio no modifica lo que ya pagaron los socios: aplica a los próximos cobros.
      </p>
    </div>
  )
}
