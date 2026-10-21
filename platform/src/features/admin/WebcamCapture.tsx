'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, RefreshCw, Upload, VideoOff } from 'lucide-react'

const SIZE = 480 // foto cuadrada de 480×480: liviana (≈40 KB) y nítida para recepción

/** Recorta al centro en cuadrado y devuelve un JPEG en data URL. */
function toJpeg(source: CanvasImageSource, w: number, h: number) {
  const side = Math.min(w, h)
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIZE, SIZE)
  return canvas.toDataURL('image/jpeg', 0.85)
}

/**
 * Foto del socio con la webcam. Abre la cámara apenas aparece (al inscribir) y
 * deja la foto en un campo oculto `name` (data URL JPEG) para el formulario.
 * Si no hay cámara o no dan permiso: subir una foto desde la compu.
 */
export function WebcamCapture({
  name = 'photo',
  current,
  autoStart = true,
}: {
  name?: string
  current?: string | null
  autoStart?: boolean
}) {
  const video = useRef<HTMLVideoElement | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [on, setOn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    setOn(false)
  }, [])

  const start = useCallback(async () => {
    setError(null)
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('sin cámara')
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      })
      if (!mounted.current) {
        // se cerró la pantalla mientras se pedía permiso: apagar la cámara
        s.getTracks().forEach((t) => t.stop())
        return
      }
      stream.current?.getTracks().forEach((t) => t.stop())
      stream.current = s
      setOn(true)
      setPhoto(null)
    } catch {
      setError('No se pudo abrir la cámara. Revisá que esté conectada y que el navegador tenga permiso (ícono de cámara en la barra de direcciones). También podés subir una foto.')
      setOn(false)
    }
  }, [])

  // El <video> aparece después de setOn(true): ahí se le conecta la cámara
  useEffect(() => {
    if (on && video.current && stream.current) {
      video.current.srcObject = stream.current
      video.current.play().catch(() => {})
    }
  }, [on])

  useEffect(() => {
    mounted.current = true
    if (autoStart) void start()
    return () => {
      mounted.current = false
      stream.current?.getTracks().forEach((t) => t.stop())
    }
  }, [autoStart, start])

  const shoot = () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    setPhoto(toJpeg(v, v.videoWidth, v.videoHeight))
    stop()
  }

  const fromFile = (file: File | undefined) => {
    if (!file) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      setPhoto(toJpeg(img, img.naturalWidth, img.naturalHeight))
      URL.revokeObjectURL(url)
      stop()
    }
    img.onerror = () => {
      setError('Ese archivo no es una imagen.')
      URL.revokeObjectURL(url)
    }
    img.src = url
  }

  const shown = photo ?? (!on ? current : null)

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={photo ?? ''} />
      <div className="relative mx-auto aspect-square w-full max-w-[260px] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
        {on ? (
          <video ref={video} playsInline muted className="h-full w-full scale-x-[-1] object-cover" />
        ) : shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="Foto del socio" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-zinc-600">
            <VideoOff className="h-10 w-10" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {on ? (
          <button
            type="button"
            onClick={shoot}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#edcc36] px-5 text-sm font-bold text-black"
          >
            <Camera className="h-4 w-4" aria-hidden="true" /> Tomar foto
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void start()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-semibold text-zinc-200"
          >
            {photo || current ? <RefreshCw className="h-4 w-4" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}
            {photo || current ? 'Sacar otra' : 'Abrir cámara'}
          </button>
        )}
        <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-semibold text-zinc-200">
          <Upload className="h-4 w-4" aria-hidden="true" /> Subir foto
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => fromFile(e.target.files?.[0])} />
        </label>
      </div>
      {photo && <p className="text-center text-xs text-emerald-300">Foto lista: se guarda con el socio.</p>}
      {error && <p role="alert" className="text-center text-xs text-amber-300">{error}</p>}
    </div>
  )
}
