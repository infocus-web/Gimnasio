'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Minus, Package, Search, ShoppingCart, X } from 'lucide-react'
import type { ActionState } from '@/features/admin/errors'
import { formatMoney } from '@/features/admin/format'
import { inputClass, Notice, SubmitButton, useActionForm } from '@/features/admin/ui'
import type { MemberHit } from './actions'

export interface SaleProduct {
  id: string
  name: string
  priceCents: number
  stock: number | null
  imageUrl?: string | null
}

const METHODS: { value: string; label: string }[] = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'card_terminal', label: 'Tarjeta' },
  { value: 'mercadopago', label: 'Mercado Pago' },
]

function SaleFormInner({
  action,
  products,
  search,
  onDone,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  products: SaleProduct[]
  search: (q: string) => Promise<MemberHit[]>
  onDone: () => void
}) {
  const [state, formAction] = useActionForm(action, {})
  const [qty, setQty] = useState<Record<string, number>>({})
  const [member, setMember] = useState<MemberHit | null>(null)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<MemberHit[]>([])
  const [searching, setSearching] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setHits([])
      return
    }
    const id = ++seq.current
    setSearching(true)
    const t = setTimeout(() => {
      search(term)
        .then((r) => id === seq.current && setHits(r))
        .catch(() => {})
        .finally(() => id === seq.current && setSearching(false))
    }, 250)
    return () => clearTimeout(t)
  }, [q, search])

  const items = useMemo(
    () => Object.entries(qty).filter(([, n]) => n > 0).map(([product_id, quantity]) => ({ product_id, quantity })),
    [qty],
  )
  const total = items.reduce((s, i) => s + (products.find((p) => p.id === i.product_id)?.priceCents ?? 0) * i.quantity, 0)

  const change = (p: SaleProduct, delta: number) =>
    setQty((cur) => {
      const next = Math.max(0, (cur[p.id] ?? 0) + delta)
      if (p.stock !== null && next > p.stock) return cur
      return { ...cur, [p.id]: next }
    })

  if (state.ok) {
    return (
      <div className="space-y-3">
        <Notice state={state} />
        <button type="button" onClick={onDone}
          className="btn-tac inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#edcc36] px-5 text-sm font-bold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
          <ShoppingCart className="h-4 w-4" aria-hidden="true" /> Nueva venta
        </button>
      </div>
    )
  }

  if (!products.length) {
    return (
      <p className="rounded-2xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
        Todavía no hay productos activos. Cargalos en la pestaña Productos.
      </p>
    )
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <input type="hidden" name="memberId" value={member?.id ?? ''} />

      <fieldset className="space-y-2">
        <legend className="mb-2 text-xs font-medium text-zinc-400">Productos · tocá para sumar</legend>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => {
            const n = qty[p.id] ?? 0
            const out = p.stock !== null && p.stock <= 0
            const full = p.stock !== null && n >= p.stock
            return (
              <li key={p.id} className="relative">
                <button
                  type="button"
                  onClick={() => change(p, 1)}
                  disabled={out || full}
                  aria-label={`Agregar un ${p.name}${n ? ` (van ${n})` : ''}`}
                  className={`flex w-full flex-col overflow-hidden rounded-2xl border bg-black text-left transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36] disabled:cursor-not-allowed ${
                    n > 0 ? 'border-[#edcc36] shadow-[0_0_0_1px_#edcc36]' : 'border-zinc-800 hover:border-zinc-600'
                  } ${out ? 'opacity-40' : ''}`}
                >
                  <span className="grid aspect-square w-full place-items-center bg-zinc-900 text-zinc-600">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <Package className="h-8 w-8" aria-hidden="true" />
                    )}
                  </span>
                  <span className="block w-full px-2.5 py-2">
                    <span className="line-clamp-2 text-sm font-semibold leading-snug text-white">{p.name}</span>
                    <span className="mt-0.5 block text-xs text-zinc-400">
                      <span className="font-bold tabular-nums text-[#edcc36]">{formatMoney(p.priceCents)}</span>
                      {p.stock !== null && ` · ${out ? 'sin stock' : `quedan ${p.stock}`}`}
                    </span>
                  </span>
                </button>
                {n > 0 && (
                  <>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute right-2 top-2 grid h-8 min-w-8 place-items-center rounded-full bg-[#edcc36] px-2 text-sm font-extrabold tabular-nums text-black shadow-lg"
                    >
                      {n}
                    </span>
                    <button
                      type="button"
                      onClick={() => change(p, -1)}
                      aria-label={`Quitar un ${p.name}`}
                      className="absolute left-2 top-2 grid h-9 w-9 place-items-center rounded-full border border-zinc-700 bg-black/80 text-white backdrop-blur hover:border-red-400 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
                    >
                      <Minus className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
        <p className="sr-only" aria-live="polite">
          {items.length ? `${items.reduce((a, i) => a + i.quantity, 0)} productos en la venta` : ''}
        </p>
      </fieldset>

      <div className="space-y-2">
        <span className="text-xs font-medium text-zinc-400">Socio (opcional)</span>
        {member ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black px-3 py-2">
            <span className="text-sm text-white">
              {member.name} {member.number ? <span className="text-zinc-500">· N° {member.number}</span> : null}
            </span>
            <button type="button" onClick={() => setMember(null)} aria-label="Quitar socio"
              className="grid h-10 w-10 place-items-center rounded-lg text-zinc-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <label className="sr-only" htmlFor="sale-member-q">Buscar socio por nombre, DNI o número</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
            <input id="sale-member-q" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off"
              placeholder="Nombre, DNI o N° de socio" className={`${inputClass} pl-9`} />
            {q.trim().length >= 2 && (
              <ul className="mt-1 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950" role="listbox" aria-label="Socios encontrados">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button type="button" onClick={() => { setMember(h); setQ(''); setHits([]) }}
                      className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 text-left text-sm text-white hover:bg-zinc-900 focus-visible:bg-zinc-900 focus-visible:outline-none">
                      <span>{h.name}</span>
                      <span className="text-xs text-zinc-500">{[h.number && `N° ${h.number}`, h.document && `DNI ${h.document}`].filter(Boolean).join(' · ')}</span>
                    </button>
                  </li>
                ))}
                {!hits.length && (
                  <li className="px-3 py-2 text-xs text-zinc-500">{searching ? 'Buscando…' : 'Sin resultados'}</li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>

      <fieldset>
        <legend className="mb-2 text-xs font-medium text-zinc-400">Medio de pago</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {METHODS.map((m, i) => (
            <label key={m.value}
              className="flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl border border-zinc-800 px-3 text-sm font-semibold text-zinc-300 has-[:checked]:border-[#edcc36] has-[:checked]:bg-[#edcc36]/10 has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#edcc36]">
              <input type="radio" name="method" value={m.value} defaultChecked={i === 0} className="sr-only" />
              {m.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-zinc-400">Nota (opcional)</span>
        <input name="note" maxLength={300} className={inputClass} />
      </label>

      <Notice state={state} />
      <div className="sticky bottom-3 flex items-center justify-between gap-3 rounded-2xl border border-[#edcc36]/30 bg-zinc-950/95 p-3 backdrop-blur">
        <div>
          <p className="text-xs text-zinc-400">Total</p>
          <p className="text-2xl font-extrabold tabular-nums text-white">{formatMoney(total)}</p>
        </div>
        {items.length > 0 ? (
          <SubmitButton>
            <ShoppingCart className="h-4 w-4" aria-hidden="true" /> Cobrar venta
          </SubmitButton>
        ) : (
          <span className="text-xs text-zinc-500">Elegí productos</span>
        )}
      </div>
    </form>
  )
}

export function SaleForm(props: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  products: SaleProduct[]
  search: (q: string) => Promise<MemberHit[]>
}) {
  const [round, setRound] = useState(0)
  return <SaleFormInner key={round} {...props} onDone={() => setRound((r) => r + 1)} />
}
