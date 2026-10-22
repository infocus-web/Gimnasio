'use client'

import { useEffect, useState } from 'react'
import { Lock, Save, Wand2 } from 'lucide-react'
import type { ActionState } from '@/features/admin/errors'
import { formatMoney } from '@/features/admin/format'
import { Field, inputClass, Notice, SubmitButton, useActionForm } from '@/features/admin/ui'
import { ProductImagePicker } from './ProductImagePicker'
import { toCents } from './money'
import { fmtPct, priceForMarkup, profitOf } from './profit'

export interface ProductValues {
  name: string
  price: string
  stock: string
  active: boolean
  sort: number
  /** Link público de la foto actual */
  imageUrl?: string | null
  /** Costo actual ("" = sin cargar). Solo llega si quien mira es administrador. */
  cost?: string
}

const asInput = (cents: number) => (cents / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })

export function ProductForm({
  action,
  initial,
  submitLabel = 'Guardar',
  showCost = false,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  initial?: ProductValues
  submitLabel?: string
  /** Solo para dueño/administrador: costo, ganancia, margen y recargo */
  showCost?: boolean
}) {
  const [state, formAction] = useActionForm(action, {})
  const err = state.fieldErrors ?? {}
  const [price, setPrice] = useState(initial?.price ?? '')
  const [cost, setCost] = useState(initial?.cost ?? '')
  const [markup, setMarkup] = useState('')
  // Después de guardar, el selector de foto vuelve a cero (si no, la foto quedaría para el próximo producto)
  const [pickerKey, setPickerKey] = useState(0)
  useEffect(() => {
    if (!state.ok) return
    setPickerKey((k) => k + 1)
    if (!initial) {
      setPrice('')
      setCost('')
      setMarkup('')
    }
  }, [state, initial])

  const priceC = toCents(price)
  const costC = cost.trim() ? toCents(cost) : null
  const calc = priceC !== null && costC !== null ? profitOf(priceC, costC) : null
  const markupN = Number(markup.replace(',', '.'))
  const suggested = costC !== null && costC > 0 && markup.trim() && Number.isFinite(markupN) && markupN >= 0
    ? priceForMarkup(costC, markupN)
    : null

  return (
    <form action={formAction} className="space-y-3" noValidate>
      <div className="flex gap-4">
        <ProductImagePicker key={pickerKey} current={initial?.imageUrl} />
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <Field label="Nombre" name="name" error={err.name}>
            <input name="name" defaultValue={initial?.name} placeholder="Ej. Agua 500 ml" maxLength={80} className={inputClass} />
          </Field>
          <Field label="Precio de venta ($)" name="price" error={err.price}>
            <input name="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="1.500" className={inputClass} />
          </Field>
          <Field label="Stock" name="stock" error={err.stock} hint="Vacío = no se controla">
            <input name="stock" inputMode="numeric" defaultValue={initial?.stock} className={inputClass} />
          </Field>
        </div>
      </div>

      {showCost && (
        <fieldset className="rounded-xl border border-zinc-800 bg-black/40 p-3">
          <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold text-zinc-400">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Costo y ganancia · solo lo ven los administradores
          </legend>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr]">
            <Field label="Costo por unidad ($)" name="cost" error={err.cost} hint="Lo que te sale a vos. Vacío = sin cargar">
              <input name="cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="800" className={inputClass} />
            </Field>
            <div className="space-y-1">
              <label htmlFor="markup" className="block text-xs font-medium text-zinc-400">Recargo deseado (%)</label>
              <div className="flex gap-2">
                <input id="markup" inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value)} placeholder="80" className={`${inputClass} w-24`} />
                <button
                  type="button"
                  disabled={suggested === null}
                  onClick={() => suggested !== null && setPrice(asInput(suggested))}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-700 px-3 text-xs font-semibold text-zinc-200 hover:border-[#edcc36]/60 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
                >
                  <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {suggested !== null ? `Usar ${formatMoney(suggested)}` : 'Sugerir precio'}
                </button>
              </div>
              <p className="text-xs text-zinc-500">Calcula el precio a partir del costo.</p>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-zinc-800 bg-zinc-950 p-2 text-center" aria-live="polite">
              <div>
                <p className="text-[11px] text-zinc-500">Ganancia</p>
                <p className={`text-sm font-bold tabular-nums ${calc && calc.profit < 0 ? 'text-red-300' : 'text-white'}`}>
                  {calc ? formatMoney(calc.profit) : '—'}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-500">Margen</p>
                <p className="text-sm font-bold tabular-nums text-white">{fmtPct(calc?.margin)}</p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-500">Recargo</p>
                <p className="text-sm font-bold tabular-nums text-white">{fmtPct(calc?.markup)}</p>
              </div>
              {calc && calc.profit < 0 && <p className="col-span-3 text-xs text-red-300">Lo estás vendiendo por debajo del costo.</p>}
            </div>
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-zinc-200">
            <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} className="h-4 w-4 accent-[#edcc36]" />
            Activo (se puede vender)
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            Orden
            <input name="sort" type="number" defaultValue={initial?.sort ?? 0} className={`${inputClass} w-20`} />
          </label>
        </div>
        <SubmitButton>
          <Save className="h-4 w-4" aria-hidden="true" /> {submitLabel}
        </SubmitButton>
      </div>
      <Notice state={state} />
    </form>
  )
}
