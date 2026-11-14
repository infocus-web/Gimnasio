import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import type { Route } from 'next'
import { Trash2, UtensilsCrossed } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { todayYMD } from '@/features/admin/format'
import { Card } from '@/features/admin/ui'
import { ConfirmAction } from '@/features/admin/ConfirmAction'
import { buffetDb } from '@/features/buffet/data'
import { copyMenu, removeMenuEntry, saveMenuEntry } from '@/features/buffet/actions'
import { CopyMenuForm, MenuEntryForm, MenuRowForm } from '@/features/buffet/AdminForms'
import { DayChips, MissingMigration, NoAccess, addDays, isMissingTable } from '@/features/buffet/admin-shared'
import { buffetImageUrl, dayLabel, money } from '@/features/buffet/types'

export const metadata: Metadata = { title: 'Buffet · Menú del día' }

const YMD = /^\d{4}-\d{2}-\d{2}$/
const asInput = (cents: number | null) => (cents === null ? '' : (cents / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 }))

interface Item { id: string; name: string; price_cents: number; image_path: string | null; always_available: boolean; active: boolean }
interface MenuRow { item_id: string; price_cents: number | null; stock: number | null }

export default async function BuffetMenuPage({ params, searchParams }: PageProps<'/[org]/admin/buffet/menu'>) {
  const { org: slug } = await params
  const sp = await searchParams
  const ctx = await getAdminContext(slug)
  if (!ctx) return null
  if (!ctx.can('buffet.manage')) return <NoAccess />

  const today = todayYMD(ctx.org.timezone)
  const day = typeof sp.dia === 'string' && YMD.test(sp.dia) ? sp.dia : today
  const db = await buffetDb()
  const [itemsRes, menuRes, recentRes, soldRes] = await Promise.all([
    db.from('buffet_items').select('id, name, price_cents, image_path, always_available, active').eq('org_id', ctx.org.id).order('sort').order('name'),
    db.from('buffet_menu').select('item_id, price_cents, stock').eq('org_id', ctx.org.id).eq('menu_date', day).order('sort'),
    db.from('buffet_menu').select('menu_date').eq('org_id', ctx.org.id).gte('menu_date', addDays(today, -14)).lte('menu_date', addDays(today, 14)),
    db
      .from('buffet_order_items')
      .select('item_id, quantity, buffet_orders!inner(pickup_date, status, created_at)')
      .eq('org_id', ctx.org.id)
      .eq('buffet_orders.pickup_date', day)
      .in('buffet_orders.status', ['confirmed', 'ready', 'delivered', 'pending_payment']),
  ])
  if (isMissingTable(itemsRes.error)) return <MissingMigration />
  const items = (itemsRes.data ?? []) as Item[]
  const menu = (menuRes.data ?? []) as MenuRow[]
  const byId = new Map(items.map((i) => [i.id, i]))
  const sold = new Map<string, number>()
  for (const r of (soldRes.data ?? []) as { item_id: string | null; quantity: number }[]) {
    if (r.item_id) sold.set(r.item_id, (sold.get(r.item_id) ?? 0) + r.quantity)
  }
  const inMenu = new Set(menu.map((m) => m.item_id))
  const addable = items.filter((i) => i.active && !inMenu.has(i.id))
  const always = items.filter((i) => i.active && i.always_available)
  const daysWithMenu = [...new Set(((recentRes.data ?? []) as { menu_date: string }[]).map((r) => r.menu_date))].filter((d) => d !== day).sort().reverse()

  const base = `/${slug}/admin/buffet/menu`
  const days = Array.from({ length: 8 }, (_, n) => addDays(today, n))
  if (!days.includes(day)) days.unshift(day)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Menú del día</h1>
        <p className="text-sm text-zinc-400">
          Elegí el día y cargá los platos que vas a tener. Lo de la carta marcado como «siempre disponible» se puede pedir todos los días sin cargarlo acá.
        </p>
      </div>
      <DayChips base={base} days={days} current={day} today={today} />
      <form method="get" className="flex items-center gap-2 text-xs text-zinc-400">
        Otro día:
        <input type="date" name="dia" defaultValue={day} className="min-h-[40px] rounded-lg border border-[#444] bg-[#1a1a1a] px-2 text-sm text-white" />
        <button className="min-h-[40px] rounded-lg border border-zinc-700 px-3 text-xs font-semibold text-zinc-200 hover:border-[#edcc36]/60">Ir</button>
      </form>

      {!items.length ? (
        <Card title="Primero cargá la carta">
          <p className="text-sm text-zinc-400">
            Todavía no hay productos. Cargalos en{' '}
            <Link href={`/${slug}/admin/buffet/carta` as Route} className="font-semibold text-[#edcc36] underline">Carta</Link> y después armá el menú de cada día.
          </p>
        </Card>
      ) : (
        <>
          <Card title={`Menú de ${dayLabel(day, today, true).toLowerCase()}`}>
            {menu.length ? (
              <ul className="divide-y divide-[#444]">
                {menu.map((m) => {
                  const it = byId.get(m.item_id)
                  if (!it) return null
                  const img = buffetImageUrl(it.image_path)
                  const s = sold.get(m.item_id) ?? 0
                  return (
                    <li key={m.item_id} className="flex flex-wrap items-center gap-3 py-3">
                      <span className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-black">
                        {img ? <Image src={img} alt="" fill sizes="48px" className="object-cover" /> : <UtensilsCrossed className="h-5 w-5 text-zinc-600" aria-hidden="true" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-white">{it.name}</p>
                        <p className="text-xs text-zinc-400">
                          {money(m.price_cents ?? it.price_cents)} · Pedidos: <strong className="text-white">{s}</strong>
                          {m.stock !== null && <> de {m.stock} {s >= m.stock && <span className="font-semibold text-red-300">· Agotado</span>}</>}
                        </p>
                      </div>
                      <MenuRowForm
                        action={saveMenuEntry.bind(null, slug, day)}
                        itemId={m.item_id}
                        price={asInput(m.price_cents)}
                        stock={m.stock === null ? '' : String(m.stock)}
                      />
                      <ConfirmAction
                        action={removeMenuEntry.bind(null, slug, day, m.item_id)}
                        variant="icon"
                        ariaLabel={`Sacar ${it.name} del menú`}
                        confirmText={s ? 'Los pedidos ya hechos se mantienen.' : 'Deja de verse ese día.'}
                        yesLabel="Sí, sacar"
                        className="flex flex-col items-end gap-1"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </ConfirmAction>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-sm text-zinc-400">No hay platos cargados para este día.</p>
            )}
            {addable.length > 0 && (
              <div className="mt-4 border-t border-[#444] pt-4">
                <MenuEntryForm action={saveMenuEntry.bind(null, slug, day)} items={addable.map((i) => ({ id: i.id, name: i.name, price: money(i.price_cents) }))} />
              </div>
            )}
            {!menu.length && daysWithMenu.length > 0 && (
              <div className="mt-4 border-t border-[#444] pt-4">
                <CopyMenuForm
                  action={copyMenu.bind(null, slug, day)}
                  options={daysWithMenu.slice(0, 14).map((d) => ({ value: d, label: dayLabel(d, today, true) }))}
                />
              </div>
            )}
          </Card>

          {always.length > 0 && (
            <Card title="Siempre disponible (todos los días)">
              <p className="mb-2 text-xs text-zinc-500">Se cambia en Carta.</p>
              <p className="text-sm text-zinc-300">{always.map((i) => i.name).join(' · ')}</p>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
