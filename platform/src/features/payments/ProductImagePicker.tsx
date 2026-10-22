'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'

const SIZE = 400 // cuadrada de 400×400: se ve nítida en la grilla y pesa ≈30 KB

/** Recorta al centro en cuadrado y devuelve un JPEG en data URL (fondo blanco para PNG transparentes). */
async function toSquareJpeg(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.85)
}

/**
 * Miniatura clickeable para la foto del producto. En el celular ofrece la cámara o la galería;
 * en la compu, elegir un archivo. Deja en campos ocultos:
 *   image        → JPEG nuevo (data URL), si se eligió uno
 *   removeImage  → "1" si se quitó la foto actual
 */
export function ProductImagePicker({ current }: { current?: string | null }) {
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [removed, setRemoved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shown = preview ?? (removed ? null : current ?? null)

  const pick = async (file: File | undefined) => {
    setError(null)
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Elegí una imagen (JPG, PNG o WEBP).')
      return
    }
    try {
      setPreview(await toSquareJpeg(file))
      setRemoved(false)
    } catch {
      setError('No se pudo leer esa imagen. Probá con otra.')
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <span className="text-xs font-medium text-zinc-400">Foto</span>
      <button
        type="button"
        onClick={() => input.current?.click()}
        aria-label={shown ? 'Cambiar la foto del producto' : 'Agregar una foto del producto'}
        className="group relative grid h-[88px] w-[88px] place-items-center overflow-hidden rounded-xl border border-dashed border-zinc-700 bg-black text-zinc-500 transition-colors hover:border-[#edcc36]/60 hover:text-[#edcc36] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
      >
        {shown ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shown} alt="" className="h-full w-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-center text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              Cambiar
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-1 text-[11px] font-semibold">
            <ImagePlus className="h-6 w-6" aria-hidden="true" />
            Agregar
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
      {error && <p role="alert" className="max-w-[160px] text-xs text-red-300">{error}</p>}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <input type="hidden" name="image" value={preview ?? ''} />
      <input type="hidden" name="removeImage" value={removed && !preview ? '1' : ''} />
    </div>
  )
}
