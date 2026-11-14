'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { Minus, Plus, ShoppingBag, Clock, CreditCard, Store, UtensilsCrossed } from 'lucide-react'
import type { ActionState } from '@/features/admin/errors'
import { Notice, SubmitButton, useActionForm } from '@/features/admin/ui'
import { CATEGORY_LABEL, buffetImageUrl, dayLabel, money, type BuffetDayItem, type BuffetPublic } from './types'

/**
 * Pedir en el buffet (app del socio): elegir el día de retiro, sumar productos y elegir cómo pagar.
 * Pensado para el pulgar: botones de 44 px, barra con el total abajo.
 */
export function BuffetOrderScreen({
  data,
  action,
  onlineEnabled,
}: {
  data: BuffetPublic
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  /** Mercado Pago conectado y el buffet acepta pago online */
  onlineEnabled: boolean
}) {
  const days = data.days.filter((d) => d.orderable)
  const [date, setDate] = useState(days[0]?.date ?? '')
  const [cart, setCart] = useState<Record<string, number>>({})
  const payOptions = [
    ...(onlineEnabled ? [{ value: 'online', label: 'Pagar ahora', sub: 'Mercado Pago: tarjeta, débito o dinero en cuenta', Icon: CreditCard }] : []),
    ...(data.accept_at_pickup ? [{ value: 'at_pickup', label: 'Pagar al retirar', sub: 'En el buffet, cuando lo buscás', Icon: Store }] : []),
  ]
  const [pay, setPay] = useState(payOptions[0]?.value ?? '')
  const [state, formAction] = useActionForm(action, {})

  useEffect(() => {
    if (state.ok) setCart({})
  }, [state])

  const day = days.find((d) => d.date === date)
  const items = day?.items ?? []
  const byId = useMemo(() => new Map(items.map((i) => [i.item_id, i])), [items])
  const lines = Object.entries(cart).filter(([id, q]) => q > 0 && byId.has(id))
  const total = lines.reduce((s, [id, q]) => s + (byId.get(id)!.price_cents * q), 0)
  const count = lines.reduce((s, [, q]) => s + q, 0)

  const specials = items.filter((i) => i.special)
  const groups = new Map<string, BuffetDayItem[]>()
  for (const i of items.filter((i) => !i.special)) groups.set(i.category, [...(groups.get(i.category) ?? []), i])

  const changeDay = (d: string) => {
    setDate(d)
    setCart({})
  }
  const add = (i: BuffetDayItem, delta: number) =>
    setCart((c) => {
      const max = Math.min(20, i.left ?? 20)
      const next = Math.max(0, Math.min(max, (c[i.item_id] ?? 0) + delta))
      return { ...c, [i.item_id]: next }
    })

  if (!days.length) {
    return (
      <p className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-center text-sm text-zinc-400">
        Por ahora no hay días abiertos para pedir. Los pedidos para cada día se toman hasta las {data.order_cutoff} h.
      </p>
    )
  }
  if (!payOptions.length) {
    return <p className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-center text-sm text-zinc-400">El pedido por la app no está disponible en este momento.</p>
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="items" value={JSON.stringify(Object.fromEntries(lines))} />

      <fieldset>
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">¿Qué día lo retirás?</legend>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {days.map((d) => (
            <button
              key={d.date}
              type="button"
              onClick={() => changeDay(d.date)}
              aria-pressed={d.date === date}
              className={`min-h-[44px] shrink-0 rounded-full border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36] ${
                d.date === date ? 'border-[#edcc36] bg-[#edcc36] text-black' : 'border-zinc-700 text-zinc-200 hover:border-[#edcc36]/60'
              }`}
            >
              {dayLabel(d.date, data.today)}
            </button>
          ))}
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Pedidos para cada día hasta las {data.order_cutoff} h de ese día.
        </p>
      </fieldset>

      {specials.length > 0 && (
        <section aria-labelledby="menu-dia" className="space-y-2">
          <h2 id="menu-dia" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[#edcc36]">
            <UtensilsCrossed className="h-4 w-4" aria-hidden="true" /> Menú del día
          </h2>
          <ul className="space-y-2">
            {specials.map((i) => <ItemRow key={i.item_id} item={i} qty={cart[i.item_id] ?? 0} onAdd={add} />)}
          </ul>
        </section>
      )}

      {[...groups.entries()].map(([cat, list]) => (
        <section key={cat} aria-label={CATEGORY_LABEL[cat]} className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-300">{CATEGORY_LABEL[cat] ?? 'Otros'}</h2>
          <ul className="space-y-2">
            {list.map((i) => <ItemRow key={i.item_id} item={i} qty={cart[i.item_id] ?? 0} onAdd={add} />)}
          </ul>
        </section>
      ))}

      {count > 0 && (
        <>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">¿Cómo lo pagás?</legend>
            {payOptions.map(({ value, label, sub, Icon }) => (
              <label key={value} className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 has-[:checked]:border-[#edcc36]/70">
                <input type="radio" name="pay" value={value} checked={pay === value} onChange={() => setPay(value)} className="h-4 w-4 accent-[#edcc36]" />
                <Icon className="h-5 w-5 text-zinc-400" aria-hidden="true" />
                <span className="text-sm">
                  <span className="block font-semibold text-white">{label}</span>
                  <span className="block text-xs text-zinc-500">{sub}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-400">Aclaración (opcional)</span>
            <input name="note" maxLength={200} placeholder="Ej. sin cebolla, lo retiro a las 19" className="min-h-[44px] w-full rounded-xl border border-[#444] bg-[#1a1a1a] px-3.5 text-sm text-white placeholder:text-zinc-500 focus-visible:border-[#edcc36] focus-visible:outline-none" />
          </label>
        </>
      )}

      <Notice state={state} />

      <div className="sticky z-30 -mx-1" style={{ bottom: 'calc(68px + env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-black/95 p-3 shadow-2xl backdrop-blur">
          <div aria-live="polite">
            <p className="text-xs text-zinc-400">{count ? `${count} ${count === 1 ? 'producto' : 'productos'} · ${dayLabel(date, data.today)}` : 'Sumá lo que quieras'}</p>
            <p className="text-lg font-extrabold tabular-nums text-white">{money(total, data.currency)}</p>
          </div>
          {count > 0 ? (
            <SubmitButton>
              <ShoppingBag className="h-4 w-4" aria-hidden="true" /> {pay === 'online' ? 'Pedir y pagar' : 'Hacer pedido'}
            </SubmitButton>
          ) : (
            <span className="text-xs text-zinc-500">Tocá + para agregar</span>
          )}
        </div>
      </div>
    </form>
  )
}

function ItemRow({ item, qty, onAdd }: { item: BuffetDayItem; qty: number; onAdd: (i: BuffetDayItem, d: number) => void }) {
  const img = buffetImageUrl(item.image_path)
  const soldOut = item.left !== null && item.left <= 0
  const btn = 'grid h-11 w-11 place-items-center rounded-xl border text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36] disabled:opacity-30'
  return (
    <li className={`flex items-center gap-3 rounded-2xl border bg-zinc-950 p-2.5 ${qty ? 'border-[#edcc36]/50' : 'border-zinc-800'}`}>
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-zinc-900">
        {img ? (
          <Image src={img} alt="" fill sizes="64px" className="object-cover" />
        ) : (
          <UtensilsCrossed className="absolute inset-0 m-auto h-6 w-6 text-zinc-700" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-white">{item.name}</p>
        {item.description && <p className="line-clamp-2 text-xs text-zinc-400">{item.description}</p>}
        <p className="mt-0.5 text-sm font-bold tabular-nums text-[#edcc36]">
          {money(item.price_cents)}
          {item.left !== null && (
            <span className={`ml-2 text-[11px] font-semibold ${soldOut ? 'text-red-300' : item.left <= 5 ? 'text-amber-300' : 'text-zinc-500'}`}>
              {soldOut ? 'Agotado' : `Quedan ${item.left}`}
            </span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {qty > 0 && (
          <>
            <button type="button" onClick={() => onAdd(item, -1)} aria-label={`Sacar un ${item.name}`} className={`${btn} border-zinc-700`}>
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="w-5 text-center text-sm font-bold tabular-nums text-white" aria-label={`${qty} en el pedido`}>{qty}</span>
          </>
        )}
        <button
          type="button"
          onClick={() => onAdd(item, 1)}
          disabled={soldOut || qty >= Math.min(20, item.left ?? 20)}
          aria-label={`Agregar ${item.name}`}
          className={`${btn} border-[#edcc36]/60 bg-[#edcc36]/10 text-[#edcc36]`}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}
