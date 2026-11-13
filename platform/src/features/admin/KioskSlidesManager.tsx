'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Eye, EyeOff, ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ActionState } from './errors'
import { KIOSK_BUCKET } from './kiosk-slides'

export interface KioskSlide {
  id: string
  url: string
  active: boolean
}

const MAX_SIDE = 1920 // nítida en la tablet y liviana (≈300 KB)

/** Achica la imagen (lado mayor 1920 px) y la pasa a JPEG. */
async function toJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('jpeg'))), 'image/jpeg', 0.85))
}

/**
 * Publicidad de la tablet del molinete: subir varias imágenes, ordenarlas, pausarlas o borrarlas.
 * Las imágenes se suben directo al almacenamiento desde el navegador (no pasan por el servidor de la web).
 */
export function KioskSlidesManager({
  orgId,
  slides,
  add,
  remove,
  toggle,
  move,
}: {
  orgId: string
  slides: KioskSlide[]
  add: (path: string) => Promise<ActionState>
  remove: (id: string) => Promise<ActionState>
  toggle: (id: string, active: boolean) => Promise<ActionState>
  move: (id: string, dir: -1 | 1) => Promise<ActionState>
}) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  const run = (fn: () => Promise<ActionState>) =>
    start(async () => {
      const r = await fn()
      if (r.message) setMsg({ ok: !!r.ok, text: r.message })
      router.refresh()
    })

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setMsg(null)
    const supabase = createClient()
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    let added = 0
    let lastError = ''
    for (let i = 0; i < list.length; i++) {
      setUploading(`Subiendo ${i + 1} de ${list.length}…`)
      try {
        const blob = await toJpeg(list[i]!)
        const path = `${orgId}/${crypto.randomUUID()}.jpg`
        const up = await supabase.storage.from(KIOSK_BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
        if (up.error) throw new Error(up.error.message)
        const r = await add(path)
        if (r.ok) added++
        else lastError = r.message ?? 'No se pudo agregar.'
      } catch {
        lastError = 'No se pudo subir una de las imágenes. Probá de nuevo.'
      }
    }
    setUploading(null)
    if (input.current) input.current.value = ''
    setMsg(
      lastError
        ? { ok: false, text: added ? `Se agregaron ${added}. ${lastError}` : lastError }
        : { ok: true, text: added === 1 ? 'Imagen agregada.' : `Se agregaron ${added} imágenes.` },
    )
    router.refresh()
  }

  const busy = !!uploading || pending

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          id="kiosk-upload"
          onChange={(e) => upload(e.target.files)}
          disabled={busy}
        />
        <label
          htmlFor="kiosk-upload"
          className={`inline-flex min-h-[48px] cursor-pointer items-center gap-2 rounded-xl bg-[#edcc36] px-5 text-sm font-bold text-black ${busy ? 'pointer-events-none opacity-60' : ''}`}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ImagePlus className="h-4 w-4" aria-hidden="true" />}
          {uploading ?? 'Agregar imágenes'}
        </label>
        <p className="text-xs text-zinc-400">Podés elegir varias juntas. Mejor si son verticales, como la pantalla de la tablet.</p>
      </div>

      <p aria-live="polite" className={`text-sm ${msg ? (msg.ok ? 'text-emerald-300' : 'text-amber-300') : 'sr-only'}`}>
        {msg?.text ?? ''}
      </p>

      {slides.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {slides.map((s, i) => (
            <li key={s.id} className={`overflow-hidden rounded-xl border border-zinc-700 bg-black ${s.active ? '' : 'opacity-50'}`}>
              <div className="relative aspect-[3/4]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.url} alt={`Imagen ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
                <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-bold text-white">{i + 1}</span>
                {!s.active && <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs text-zinc-300">Pausada</span>}
              </div>
              <div className="flex items-center justify-between gap-1 p-1.5">
                <button
                  type="button"
                  disabled={busy || i === 0}
                  onClick={() => run(() => move(s.id, -1))}
                  aria-label={`Mover la imagen ${i + 1} antes`}
                  className="grid h-10 w-10 place-items-center rounded-lg text-zinc-300 hover:bg-zinc-800 disabled:opacity-30"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => toggle(s.id, !s.active))}
                  aria-label={s.active ? `Pausar la imagen ${i + 1}` : `Volver a mostrar la imagen ${i + 1}`}
                  title={s.active ? 'Pausar' : 'Mostrar'}
                  className="grid h-10 w-10 place-items-center rounded-lg text-zinc-300 hover:bg-zinc-800"
                >
                  {s.active ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm('¿Borrar esta imagen de la tablet?')) run(() => remove(s.id))
                  }}
                  aria-label={`Borrar la imagen ${i + 1}`}
                  className="grid h-10 w-10 place-items-center rounded-lg text-red-300 hover:bg-red-950/50"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={busy || i === slides.length - 1}
                  onClick={() => run(() => move(s.id, 1))}
                  aria-label={`Mover la imagen ${i + 1} después`}
                  className="grid h-10 w-10 place-items-center rounded-lg text-zinc-300 hover:bg-zinc-800 disabled:opacity-30"
                >
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-400">
          Todavía no cargaste imágenes: la tablet muestra las fotos de la web del gimnasio.
        </p>
      )}
    </div>
  )
}
