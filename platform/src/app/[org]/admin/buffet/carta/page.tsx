import type { Metadata } from 'next'
import Image from 'next/image'
import { Trash2, UtensilsCrossed } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { Card } from '@/features/admin/ui'
import { ConfirmAction } from '@/features/admin/ConfirmAction'
import { buffetDb } from '@/features/buffet/data'
import { deleteBuffetItem, saveBuffetItem } from '@/features/buffet/actions'
import { BuffetItemForm } from '@/features/buffet/AdminForms'
import { MissingMigration, NoAccess, isMissingTable } from '@/features/buffet/admin-shared'
import { CATEGORIES, buffetImageUrl, money } from '@/features/buffet/types'

export const metadata: Metadata = { title: 'Buffet · Carta' }

interface Item {
  id: string
  name: string
  description: string | null
  category: string
  price_cents: number
  image_path: string | null
  always_available: boolean
  active: boolean
  sort: number
}
const asInput = (cents: number) => (cents / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })

export default async function BuffetCartaPage({ params }: PageProps<'/[org]/admin/buffet/carta'>) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx) return null
  if (!ctx.can('buffet.manage')) return <NoAccess />
  const db = await buffetDb()
  const { data, error } = await db
    .from('buffet_items')
    .select('id, name, description, category, price_cents, image_path, always_available, active, sort')
    .eq('org_id', ctx.org.id)
    .order('category')
    .order('sort')
    .order('name')
  if (isMissingTable(error)) return <MissingMigration />
  const items = (data ?? []) as Item[]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Carta del buffet</h1>
        <p className="text-sm text-zinc-400">
          Todo lo que vendés. Las viandas y platos del día se cargan acá una vez y después se eligen en «Menú del día». Lo «siempre disponible» (café,
          licuados, tortas) se puede pedir cualquier día.
        </p>
      </div>
      <Card title="Agregar a la carta">
        <BuffetItemForm action={saveBuffetItem.bind(null, slug, null)} submitLabel="Agregar" />
      </Card>
      {CATEGORIES.filter((c) => items.some((i) => i.category === c.value)).map((c) => (
        <Card key={c.value} title={c.label}>
          <ul className="divide-y divide-[#444]">
            {items.filter((i) => i.category === c.value).map((i) => {
              const img = buffetImageUrl(i.image_path)
              return (
                <li key={i.id} className="py-3">
                  <details>
                    <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                      <span className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-black">
                        {img ? <Image src={img} alt="" fill sizes="48px" className="object-cover" /> : <UtensilsCrossed className="h-5 w-5 text-zinc-600" aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate font-semibold ${i.active ? 'text-white' : 'text-zinc-500 line-through'}`}>{i.name}</span>
                        <span className="block text-xs text-zinc-400">
                          {money(i.price_cents)}
                          {i.always_available && <span className="ml-2 rounded border border-emerald-500/30 px-1.5 text-[10px] font-semibold text-emerald-300">SIEMPRE</span>}
                          {!i.active && <span className="ml-2 text-zinc-500">· Desactivado</span>}
                        </span>
                      </span>
                      <span className="text-xs font-semibold text-[#edcc36]">Editar</span>
                    </summary>
                    <div className="mt-4 space-y-3 rounded-xl border border-[#444] bg-black/30 p-4">
                      <BuffetItemForm
                        action={saveBuffetItem.bind(null, slug, i.id)}
                        initial={{
                          name: i.name,
                          description: i.description ?? '',
                          category: i.category,
                          price: asInput(i.price_cents),
                          alwaysAvailable: i.always_available,
                          active: i.active,
                          sort: i.sort,
                          imageUrl: img,
                        }}
                      />
                      <ConfirmAction
                        action={deleteBuffetItem.bind(null, slug, i.id)}
                        confirmText="Se borra de la carta y de los menús. Para dejar de venderlo por un tiempo, mejor destildá «Activo»."
                        yesLabel="Sí, borrar"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Borrar de la carta
                      </ConfirmAction>
                    </div>
                  </details>
                </li>
              )
            })}
          </ul>
        </Card>
      ))}
    </div>
  )
}
