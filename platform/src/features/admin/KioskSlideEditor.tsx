'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, RotateCcw, X } from 'lucide-react'
import { PromoSlide } from '@/features/screens/PromoSlide'
import {
  PROMO_ORIENTATIONS,
  PROMO_POSITIONS,
  PROMO_STYLES,
  type PromoOrientation,
  type PromoPosition,
  type PromoSlideData,
  type PromoStyle,
} from '@/features/screens/promo'
import type { ActionState } from './errors'

export interface SlideTexts {
  badge: string
  title: string
  subtitle: string
  style: PromoStyle
  position: PromoPosition
  orientation: PromoOrientation
}

const input =
  'w-full rounded-xl border border-zinc-700 bg-black px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#edcc36] focus:outline-none focus:ring-2 focus:ring-[#edcc36]/30'

/** Editor de textos animados de una imagen, con vista previa en vivo (vertical / horizontal). */
export function KioskSlideEditor({
  slide,
  onClose,
  onSave,
}: {
  slide: PromoSlideData
  onClose: () => void
  onSave: (v: SlideTexts) => Promise<ActionState>
}) {
  const [v, setV] = useState<SlideTexts>({
    badge: slide.badge ?? '',
    title: slide.title ?? '',
    subtitle: slide.subtitle ?? '',
    style: slide.style ?? 'impacto',
    position: slide.position ?? 'bottom',
    orientation: slide.orientation ?? 'both',
  })
  const [view, setView] = useState<'vertical' | 'horizontal'>(slide.orientation === 'horizontal' ? 'horizontal' : 'vertical')
  const [replay, setReplay] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialog = useRef<HTMLDivElement>(null)

  const set = <K extends keyof SlideTexts>(k: K, val: SlideTexts[K]) => setV((p) => ({ ...p, [k]: val }))
  // Con un cambio de animación, posición u orientación se vuelve a ver la animación desde el principio
  useEffect(() => setReplay((n) => n + 1), [v.style, v.position, view])
  useEffect(() => {
    if (v.orientation !== 'both') setView(v.orientation)
  }, [v.orientation])

  useEffect(() => {
    dialog.current?.querySelector<HTMLInputElement>('input, textarea')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async () => {
    setSaving(true)
    setError(null)
    const r = await onSave(v)
    setSaving(false)
    if (!r.ok) setError(r.message ?? 'No se pudo guardar.')
  }

  const preview: PromoSlideData = { ...slide, ...v }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80 p-3 sm:p-6" onClick={onClose}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="slide-editor-title"
        className="w-full max-w-5xl rounded-2xl border border-[#444] bg-[#2c2c2c] p-4 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="slide-editor-title" className="text-lg font-bold text-white">
            Textos de la publicidad
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="grid h-11 w-11 place-items-center rounded-full text-zinc-300 hover:bg-zinc-800">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* Campos */}
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-400">Etiqueta (opcional)</span>
              <input className={input} maxLength={30} value={v.badge} onChange={(e) => set('badge', e.target.value)} placeholder="PROMO · NUEVO · SOLO HOY" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-400">Título</span>
              <input className={input} maxLength={80} value={v.title} onChange={(e) => set('title', e.target.value)} placeholder="2x1 en *funcional*" />
              <span className="block text-xs text-zinc-500">Poné una palabra entre *asteriscos* para que salga en amarillo.</span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-400">Bajada (opcional)</span>
              <textarea
                className={`${input} min-h-[72px] resize-y`}
                maxLength={160}
                value={v.subtitle}
                onChange={(e) => set('subtitle', e.target.value)}
                placeholder="Traé a un amigo y entrenan juntos todo marzo"
              />
            </label>

            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-zinc-400">Animación</legend>
              <div className="grid grid-cols-3 gap-2">
                {PROMO_STYLES.map((o) => (
                  <Choice key={o.value} name="style" checked={v.style === o.value} onChange={() => set('style', o.value)} label={o.label} hint={o.hint} />
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-zinc-400">Dónde van los textos</legend>
              <div className="grid grid-cols-3 gap-2">
                {PROMO_POSITIONS.map((o) => (
                  <Choice key={o.value} name="position" checked={v.position === o.value} onChange={() => set('position', o.value)} label={o.label} />
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-zinc-400">Formato</legend>
              <div className="grid grid-cols-3 gap-2">
                {PROMO_ORIENTATIONS.map((o) => (
                  <Choice key={o.value} name="orientation" checked={v.orientation === o.value} onChange={() => set('orientation', o.value)} label={o.label} hint={o.hint} />
                ))}
              </div>
              <p className="mt-1.5 text-xs text-zinc-500">{PROMO_ORIENTATIONS.find((o) => o.value === v.orientation)?.hint}.</p>
            </fieldset>
          </div>

          {/* Vista previa */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-zinc-400">Vista previa</p>
              <div className="flex gap-2">
                {v.orientation === 'both' && (
                  <div className="flex rounded-full bg-black p-1" role="group" aria-label="Ver como">
                    {(['vertical', 'horizontal'] as const).map((o) => (
                      <button
                        key={o}
                        type="button"
                        aria-pressed={view === o}
                        onClick={() => setView(o)}
                        className={`min-h-[36px] rounded-full px-3 text-xs font-semibold ${view === o ? 'bg-[#edcc36] text-black' : 'text-zinc-300'}`}
                      >
                        {o === 'vertical' ? 'Tablet' : 'TV'}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setReplay((n) => n + 1)}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-zinc-700 px-3 text-xs text-zinc-200 hover:border-[#edcc36]"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Repetir
                </button>
              </div>
            </div>
            <div className={`mx-auto overflow-hidden rounded-xl border border-zinc-700 ${view === 'vertical' ? 'w-full max-w-[300px]' : 'w-full'}`}>
              <div className={`relative ${view === 'vertical' ? 'aspect-[9/16]' : 'aspect-video'}`}>
                <PromoSlide key={replay} slide={preview} />
              </div>
            </div>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm text-amber-300">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-[48px] rounded-xl border border-zinc-700 px-5 text-sm font-semibold text-zinc-200">
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-[#edcc36] px-6 text-sm font-bold text-black disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

function Choice({ name, checked, onChange, label, hint }: { name: string; checked: boolean; onChange: () => void; label: string; hint?: string }) {
  return (
    <label
      title={hint}
      className="flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl border border-zinc-700 px-2 text-center text-sm text-zinc-200 has-[:checked]:border-[#edcc36] has-[:checked]:bg-[#edcc36]/10 has-[:checked]:font-semibold has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#edcc36]"
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      {label}
    </label>
  )
}
