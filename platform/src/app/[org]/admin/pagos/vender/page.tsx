import type { Metadata } from 'next'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/features/admin/ui'
import { recordSaleAction, searchMembers } from '@/features/payments/actions'
import { SaleForm } from '@/features/payments/SaleForm'

export const metadata: Metadata = { title: 'Vender' }

export default async function VenderPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx) return null
  if (!ctx.can('billing.write')) return <p className="text-sm text-zinc-400">No tenés permiso para vender.</p>

  const supabase = await createClient()
  const { data: products } = await supabase
    .from('products')
    .select('id, name, price_cents, stock')
    .eq('org_id', ctx.org.id)
    .eq('active', true)
    .order('sort')
    .order('name')

  return (
    <Card title="Venta en mostrador">
      <SaleForm
        action={recordSaleAction.bind(null, slug)}
        search={searchMembers.bind(null, slug)}
        products={(products ?? []).map((p) => ({ id: p.id, name: p.name, priceCents: Number(p.price_cents), stock: p.stock }))}
      />
    </Card>
  )
}
