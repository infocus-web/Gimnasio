import type { Metadata } from 'next'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/features/admin/format'
import { Card } from '@/features/admin/ui'
import { saveProduct } from '@/features/payments/actions'
import { ProductForm } from '@/features/payments/ProductForm'

export const metadata: Metadata = { title: 'Productos' }

const asPrice = (cents: number) => (cents / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })

export default async function ProductosPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx) return null
  if (!ctx.can('billing.read')) return <p className="text-sm text-zinc-400">No tenés permiso.</p>
  const canEdit = ctx.can('billing.write')

  const supabase = await createClient()
  const { data: products } = await supabase
    .from('products')
    .select('id, name, price_cents, stock, active, sort')
    .eq('org_id', ctx.org.id)
    .order('active', { ascending: false })
    .order('sort')
    .order('name')

  return (
    <div className="space-y-5">
      {canEdit && (
        <Card title="Agregar producto">
          <ProductForm action={saveProduct.bind(null, slug, null)} submitLabel="Agregar" />
        </Card>
      )}
      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-300">
          Catálogo <span className="text-zinc-500">({products?.length ?? 0})</span>
        </h2>
        {products?.length ? (
          <ul className="space-y-2">
            {products.map((p) => (
              <li key={p.id} className={`rounded-2xl border border-zinc-800/80 bg-zinc-950 ${p.active ? '' : 'opacity-60'}`}>
                <details className="group">
                  <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-white">{p.name}</span>
                      <span className="block text-xs text-zinc-500">
                        {p.stock === null ? 'Sin control de stock' : p.stock === 0 ? 'Sin stock' : `Stock: ${p.stock}`}
                        {!p.active && ' · desactivado'}
                      </span>
                    </span>
                    <span className="font-bold tabular-nums text-white">{formatMoney(Number(p.price_cents))}</span>
                    {canEdit && <span className="text-xs text-[#edcc36] group-open:hidden">Editar</span>}
                  </summary>
                  {canEdit && (
                    <div className="border-t border-zinc-900 p-4">
                      <ProductForm
                        action={saveProduct.bind(null, slug, p.id)}
                        initial={{ name: p.name, price: asPrice(Number(p.price_cents)), stock: p.stock === null ? '' : String(p.stock), active: p.active, sort: p.sort }}
                      />
                    </div>
                  )}
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
            Todavía no cargaste productos. Agregá bebidas, suplementos o lo que vendas en el mostrador.
          </p>
        )}
      </section>
    </div>
  )
}
