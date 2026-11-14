'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, CheckCheck, ChefHat, ImagePlus, Save, Trash2, Undo2, X } from 'lucide-react'
import type { ActionState } from '@/features/admin/errors'
import { Field, inputClass, Notice, SubmitButton, useActionForm } from '@/features/admin/ui'
import { PendingButton } from '@/features/admin/ConfirmAction'
import { ProductImagePicker } from '@/features/payments/ProductImagePicker'
import { CATEGORIES } from './types'

type FormAction = (prev: ActionState, form: FormData) => Promise<ActionState>

/** Recarga la lista de pedidos cada 30 s (llegan pedidos nuevos sin tocar nada). */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, seconds * 1000)
    return () => clearInterval(id)
  }, [router, seconds])
  return null
}

// ---------------------------------------------------------------------
// Carta
// ---------------------------------------------------------------------
export interface ItemValues {
  name: string
  description: string
  category: string
  price: string
  alwaysAvailable: boolean
  active: boolean
  sort: number
  imageUrl: string | null
}

export function BuffetItemForm({ action, initial, submitLabel = 'Guardar' }: { action: FormAction; initial?: ItemValues; submitLabel?: string }) {
  const [state, formAction] = useActionForm(action, {})
  const err = state.fieldErrors ?? {}
  const [pickerKey, setPickerKey] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (!state.ok) return
    setPickerKey((k) => k + 1)
    if (!initial) formRef.current?.reset()
  }, [state, initial])
  return (
    <form ref={formRef} action={formAction} className="space-y-3" noValidate>
      <div className="flex gap-4">
        <ProductImagePicker key={pickerKey} current={initial?.imageUrl} />
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <Field label="Nombre" name="name" error={err.name}>
            <input name="name" defaultValue={initial?.name} placeholder="Ej. Wok de pollo con vegetales" maxLength={80} className={inputClass} />
          </Field>
          <Field label="Categoría" name="category" error={err.category}>
            <select name="category" defaultValue={initial?.category ?? 'vianda'} className={inputClass}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Precio ($)" name="price" error={err.price}>
            <input name="price" inputMode="decimal" defaultValue={initial?.price} placeholder="6.500" className={inputClass} />
          </Field>
          <div className="sm:col-span-3">
            <Field label="Descripción (opcional)" name="description" hint="Ingredientes, tamaño, si es apto vegano o sin TACC…">
              <input name="description" defaultValue={initial?.description} maxLength={300} className={inputClass} />
            </Field>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-zinc-200">
            <input type="checkbox" name="always_available" defaultChecked={initial?.alwaysAvailable ?? false} className="h-4 w-4 accent-[#edcc36]" />
            Siempre disponible <span className="text-xs text-zinc-500">(se puede pedir todos los días: café, licuados…)</span>
          </label>
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-zinc-200">
            <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} className="h-4 w-4 accent-[#edcc36]" />
            Activo
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

// ---------------------------------------------------------------------
// Menú del día
// ---------------------------------------------------------------------
export function MenuEntryForm({
  action,
  items,
}: {
  action: FormAction
  items: { id: string; name: string; price: string }[]
}) {
  const [state, formAction] = useActionForm(action, {})
  const err = state.fieldErrors ?? {}
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
        <Field label="Plato de la carta" name="item_id" error={err.item_id}>
          <select name="item_id" defaultValue="" className={inputClass}>
            <option value="" disabled>Elegí…</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>{i.name} · {i.price}</option>
            ))}
          </select>
        </Field>
        <Field label="Precio de hoy ($)" name="price" error={err.price} hint="Vacío = el de la carta">
          <input name="price" inputMode="decimal" className={inputClass} />
        </Field>
        <Field label="Porciones" name="stock" error={err.stock} hint="Vacío = sin límite">
          <input name="stock" inputMode="numeric" className={inputClass} />
        </Field>
        <SubmitButton>
          <Check className="h-4 w-4" aria-hidden="true" /> Agregar
        </SubmitButton>
      </div>
      <Notice state={state} />
    </form>
  )
}

/** Cambiar precio o porciones de un plato ya cargado en el menú del día (en la misma fila). */
export function MenuRowForm({ action, itemId, price, stock }: { action: FormAction; itemId: string; price: string; stock: string }) {
  const [state, formAction] = useActionForm(action, {})
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="item_id" value={itemId} />
      <label className="flex items-center gap-1 text-xs text-zinc-400">
        $ <input name="price" inputMode="decimal" defaultValue={price} placeholder="carta" aria-label="Precio de ese día" className={`${inputClass} !min-h-[36px] w-24`} />
      </label>
      <label className="flex items-center gap-1 text-xs text-zinc-400">
        Porciones <input name="stock" inputMode="numeric" defaultValue={stock} placeholder="∞" aria-label="Porciones" className={`${inputClass} !min-h-[36px] w-20`} />
      </label>
      <PendingButton className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-zinc-700 px-3 text-xs font-semibold text-zinc-200 hover:border-[#edcc36]/60">
        <Save className="h-3.5 w-3.5" aria-hidden="true" /> Guardar
      </PendingButton>
      {state.message && (
        <span role={state.ok ? 'status' : 'alert'} className={`text-xs ${state.ok ? 'text-emerald-300' : 'text-red-300'}`}>{state.message}</span>
      )}
    </form>
  )
}

export function CopyMenuForm({ action, options }: { action: FormAction; options: { value: string; label: string }[] }) {
  const [state, formAction] = useActionForm(action, {})
  if (!options.length) return null
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <Field label="Copiar el menú de" name="from">
        <select name="from" className={`${inputClass} w-auto min-w-[180px]`}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Field>
      <SubmitButton variant="ghost">Copiar acá</SubmitButton>
      <div className="w-full"><Notice state={state} /></div>
    </form>
  )
}

// ---------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------
const PILL = 'inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]'

function MiniForm({ action, children, className }: { action: FormAction; children: React.ReactNode; className?: string }) {
  const [state, formAction] = useActionForm(action, {})
  return (
    <form action={formAction} className={className ?? 'inline-flex flex-col gap-1'}>
      {children}
      {state.message && !state.ok && <span role="alert" className="max-w-[18rem] text-xs text-red-300">{state.message}</span>}
      {state.message && state.ok && /devoluci/.test(state.message) && <span role="status" className="max-w-[18rem] text-xs text-amber-200">{state.message}</span>}
    </form>
  )
}

export function OrderActions({
  status,
  paid,
  ready,
  deliver,
  cancel,
  undo,
}: {
  status: string
  paid: boolean
  ready: FormAction
  deliver: FormAction
  cancel: FormAction
  undo: FormAction
}) {
  const [cancelling, setCancelling] = useState(false)
  if (status === 'cancelled') return null
  if (status === 'delivered') {
    return (
      <MiniForm action={undo}>
        <PendingButton className={`${PILL} border-zinc-800 text-zinc-500 hover:text-white`}>
          <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Deshacer entrega
        </PendingButton>
      </MiniForm>
    )
  }
  return (
    <div className="flex flex-wrap items-start gap-2">
      {status !== 'ready' && (
        <MiniForm action={ready}>
          <PendingButton className={`${PILL} border-sky-500/40 text-sky-200 hover:bg-sky-500/10`}>
            <ChefHat className="h-3.5 w-3.5" aria-hidden="true" /> Listo
          </PendingButton>
        </MiniForm>
      )}
      <MiniForm action={deliver} className="inline-flex flex-wrap items-center gap-1.5">
        {!paid && (
          <select name="paid_via" defaultValue="cash" aria-label="Cómo pagó" className={`${inputClass} !min-h-[40px] w-auto text-xs`}>
            <option value="cash">Pagó en efectivo</option>
            <option value="transfer">Transferencia</option>
            <option value="card">Tarjeta</option>
            <option value="other">Otro</option>
          </select>
        )}
        <PendingButton className={`${PILL} border-emerald-500/50 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20`}>
          <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> {paid ? 'Entregado' : 'Cobrado y entregado'}
        </PendingButton>
      </MiniForm>
      {cancelling ? (
        <MiniForm action={cancel} className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-2">
          <input name="reason" maxLength={200} placeholder="Motivo (opcional, lo ve el socio)" className={`${inputClass} !min-h-[40px] flex-1 text-xs`} />
          <PendingButton className={`${PILL} border-red-500/40 text-red-200`}>Sí, cancelar</PendingButton>
          <button type="button" onClick={() => setCancelling(false)} className="min-h-[40px] px-2 text-xs text-zinc-400 hover:text-white">Volver</button>
        </MiniForm>
      ) : (
        <button type="button" onClick={() => setCancelling(true)} className={`${PILL} border-zinc-800 text-zinc-500 hover:border-red-500/40 hover:text-red-300`}>
          <X className="h-3.5 w-3.5" aria-hidden="true" /> Cancelar
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Ajustes y publicidad
// ---------------------------------------------------------------------
const COVER_W = 1600
const COVER_H = 700

async function toCoverJpeg(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const ratio = COVER_W / COVER_H
  let sw = bitmap.width
  let sh = sw / ratio
  if (sh > bitmap.height) {
    sh = bitmap.height
    sw = sh * ratio
  }
  const canvas = document.createElement('canvas')
  canvas.width = COVER_W
  canvas.height = COVER_H
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, COVER_W, COVER_H)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.82)
}

function CoverPicker({ current }: { current: string | null }) {
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [removed, setRemoved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shown = preview ?? (removed ? null : current)
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-zinc-400">Foto de portada (se ve en la web y en la app)</span>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="relative grid aspect-[16/7] w-full place-items-center overflow-hidden rounded-xl border border-dashed border-zinc-700 bg-black text-zinc-500 hover:border-[#edcc36]/60 hover:text-[#edcc36] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
        aria-label={shown ? 'Cambiar la foto de portada' : 'Agregar una foto de portada'}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-xs font-semibold">
            <ImagePlus className="h-7 w-7" aria-hidden="true" /> Agregar foto (horizontal)
          </span>
        )}
      </button>
      {shown && (
        <button
          type="button"
          onClick={() => {
            setPreview(null)
            setRemoved(true)
            if (input.current) input.current.value = ''
          }}
          className="inline-flex min-h-[32px] items-center gap-1 text-xs text-zinc-500 hover:text-red-300"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Quitar
        </button>
      )}
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={async (e) => {
          setError(null)
          const f = e.target.files?.[0]
          if (!f) return
          try {
            setPreview(await toCoverJpeg(f))
            setRemoved(false)
          } catch {
            setError('No se pudo leer esa imagen. Probá con otra.')
          }
        }}
      />
      <input type="hidden" name="image" value={preview ?? ''} />
      <input type="hidden" name="removeImage" value={removed && !preview ? '1' : ''} />
    </div>
  )
}

export interface SettingsValues {
  enabled: boolean
  name: string
  tagline: string
  description: string
  pickupText: string
  whatsapp: string
  orderCutoff: string
  daysAhead: number
  acceptOnline: boolean
  acceptAtPickup: boolean
  coverUrl: string | null
}

export function BuffetSettingsForm({ action, initial, mpReady }: { action: FormAction; initial: SettingsValues; mpReady: boolean }) {
  const [state, formAction] = useActionForm(action, {})
  const err = state.fieldErrors ?? {}
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <label className="flex min-h-[52px] items-center gap-3 rounded-xl border border-[#edcc36]/40 bg-[#edcc36]/5 p-3 text-sm text-white">
        <input type="checkbox" name="enabled" defaultChecked={initial.enabled} className="h-5 w-5 accent-[#edcc36]" />
        <span>
          <span className="block font-semibold">Buffet visible</span>
          <span className="block text-xs text-zinc-400">Aparece en la web del gimnasio y los socios pueden pedir desde la app.</span>
        </span>
      </label>
      <CoverPicker current={initial.coverUrl} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" name="name" error={err.name}>
          <input name="name" defaultValue={initial.name} maxLength={60} className={inputClass} />
        </Field>
        <Field label="Frase corta" name="tagline" hint="Ej. Comida rica para después de entrenar">
          <input name="tagline" defaultValue={initial.tagline} maxLength={120} className={inputClass} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Texto de presentación (web)" name="description">
            <textarea name="description" defaultValue={initial.description} maxLength={600} rows={3} className={`${inputClass} py-2.5`} />
          </Field>
        </div>
        <Field label="Dónde y cuándo se retira" name="pickup_text" hint="Ej. En el buffet de planta baja, de 12 a 21 h">
          <input name="pickup_text" defaultValue={initial.pickupText} maxLength={160} className={inputClass} />
        </Field>
        <Field label="WhatsApp del buffet (opcional)" name="whatsapp">
          <input name="whatsapp" defaultValue={initial.whatsapp} inputMode="tel" maxLength={30} placeholder="+54 11 …" className={inputClass} />
        </Field>
        <Field label="Pedidos para cada día hasta las" name="order_cutoff" error={err.order_cutoff} hint="De ese mismo día. Ej. 11:00 para tener tiempo de cocinar">
          <input name="order_cutoff" type="time" defaultValue={initial.orderCutoff} className={inputClass} />
        </Field>
        <Field label="Días por adelantado" name="days_ahead" error={err.days_ahead} hint="Cuántos días para adelante se puede pedir (0 = solo hoy)">
          <input name="days_ahead" type="number" min={0} max={14} defaultValue={initial.daysAhead} className={inputClass} />
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-medium text-zinc-400">Cómo puede pagar el socio</legend>
        <label className="flex min-h-[44px] items-center gap-2 text-sm text-zinc-200">
          <input type="checkbox" name="accept_online" defaultChecked={initial.acceptOnline} className="h-4 w-4 accent-[#edcc36]" />
          Online por adelantado (Mercado Pago del gimnasio)
          {!mpReady && <span className="text-xs text-amber-300">· Mercado Pago no está conectado</span>}
        </label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm text-zinc-200">
          <input type="checkbox" name="accept_at_pickup" defaultChecked={initial.acceptAtPickup} className="h-4 w-4 accent-[#edcc36]" />
          Al retirar, en el buffet
        </label>
        {err.accept_at_pickup && <p className="text-xs text-red-300">{err.accept_at_pickup}</p>}
      </fieldset>
      <div className="flex justify-end">
        <SubmitButton>
          <Save className="h-4 w-4" aria-hidden="true" /> Guardar
        </SubmitButton>
      </div>
      <Notice state={state} />
    </form>
  )
}

// ---------------------------------------------------------------------
// Rendición
// ---------------------------------------------------------------------
export function PayoutForm({ action, today }: { action: FormAction; today: string }) {
  const [state, formAction] = useActionForm(action, {})
  const err = state.fieldErrors ?? {}
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
        <Field label="Monto ($)" name="amount" error={err.amount}>
          <input name="amount" inputMode="decimal" className={inputClass} />
        </Field>
        <Field label="Fecha" name="paid_on" error={err.paid_on}>
          <input name="paid_on" type="date" defaultValue={today} className={inputClass} />
        </Field>
        <Field label="Nota (opcional)" name="note">
          <input name="note" maxLength={200} placeholder="Ej. transferencia semana 1" className={inputClass} />
        </Field>
        <SubmitButton>
          <Save className="h-4 w-4" aria-hidden="true" /> Registrar
        </SubmitButton>
      </div>
      <Notice state={state} />
    </form>
  )
}

/** Link de la página pública del buffet: copiar o compartir por WhatsApp. */
export function BuffetShareLink({ url, text }: { url: string; text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input readOnly value={url} aria-label="Link de la página del buffet" className={`${inputClass} font-mono text-xs`} onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(url)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
          className="min-h-[44px] shrink-0 rounded-xl border border-zinc-700 px-3 text-xs font-semibold text-zinc-200 hover:border-[#edcc36]/60"
        >
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-[44px] items-center rounded-xl border border-emerald-500/40 px-4 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/10"
      >
        Compartir por WhatsApp
      </a>
    </div>
  )
}
