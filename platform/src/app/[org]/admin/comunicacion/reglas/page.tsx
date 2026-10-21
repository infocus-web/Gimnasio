import type { Metadata } from 'next'
import { getAdminContext } from '@/features/admin/context'
import { Card } from '@/features/admin/ui'
import { createClient } from '@/lib/supabase/server'
import { RulesForm } from '@/features/engagement/RulesForm'
import { saveRules } from '@/features/engagement/actions'
import type { AdminData } from '@/features/engagement/shared'

export const metadata: Metadata = { title: 'Reglas de regalos y congelamiento' }

export default async function ReglasPage({ params }: PageProps<'/[org]/admin/comunicacion/reglas'>) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx || !ctx.can('members.write')) return null

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('engagement_admin_get', { p_org: ctx.org.id })
  const d = data as unknown as AdminData | null
  if (error || !d) {
    return (
      <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
        No pudimos cargar las reglas. Recargá la página en un rato.
      </p>
    )
  }
  const rules = d.rules ?? { birthday_gift_days: 1, referral_reward_days: 15, freeze_max_days_year: 15 }
  return (
    <div className="max-w-xl">
      <Card title="Regalos y congelamiento">
        <RulesForm rules={rules} canManage={d.can_manage} action={saveRules.bind(null, slug)} />
      </Card>
    </div>
  )
}
