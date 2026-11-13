'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ActionState } from '@/features/admin/errors'
import { BOARD_BUCKET, boardMediaUrl, type BoardMedia, type BoardTimer } from '@/features/screens/board'
import type { BoardInput } from './board-actions'

const MAX_MEDIA = 12
const MAX_VIDEO_MB = 50
const IMG_SIDE = 1920

const input =
  'w-full rounded-xl border border-zinc-700 bg-black px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#edcc36] focus:outline-none focus:ring-2 focus:ring-[#edcc36]/30'

async function imageToJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, IMG_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('jpeg'))), 'image/jpeg', 0.85))
}

type TimerMode = 'none' | 'stopwatch' | 'countdown' | 'interval'

/** Crear o editar una pizarra: título, texto de la clase, imágenes y videos, temporizador. */
export function BoardEditor({
  orgId,
  staffId,
  board,
  onClose,
  onSave,
}: {
  orgId: string
  staffId: string
  board: { title: string; body: string; media: BoardMedia[]; timer: BoardTimer | null } | null
  onClose: () => void
  onSave: (v: BoardInput) => Promise<ActionState>
}) {
  const [title, setTitle] = useState(board?.title ?? '')
  const [body, setBody] = useState(board?.body ?? '')
  const [media, setMedia] = useState<BoardMedia[]>(board?.media.map((m) => ({ type: m.type, path: m.path })) ?? [])
  const t = board?.timer ?? null
  const [mode, setMode] = useState<TimerMode>(t?.mode ?? 'none')
  const [cdMin, setCdMin] = useState(t?.mode === 'countdown' ? Math.floor(t.total_s / 60) : 10)
  const [cdSec, setCdSec] = useState(t?.mode === 'countdown' ? t.total_s % 60 : 0)
  const [work, setWork] = useState(t?.mode === 'interval' ? t.work_s : 40)
  const [rest, setRest] = useState(t?.mode === 'interval' ? t.rest_s : 20)
  const [rounds, setRounds] = useState(t?.mode === 'interval' ? t.rounds : 8)
  const [uploading, setUploading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [titleError, setTitleError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialog.current?.querySelector<HTMLInputElement>('input')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setError(null)
    const supabase = createClient()
    const list = Array.from(files).slice(0, MAX_MEDIA - media.length)
    const added: BoardMedia[] = []
    for (let i = 0; i < list.length; i++) {
      const f = list[i]!
      setUploading(`Subiendo ${i + 1} de ${list.length}…`)
      try {
        const isVideo = f.type.startsWith('video/')
        if (!isVideo && !f.type.startsWith('image/')) continue
        if (isVideo && f.size > MAX_VIDEO_MB * 1024 * 1024) {
          setError(`El video "${f.name}" pesa más de ${MAX_VIDEO_MB} MB. Recortalo o bajale la calidad.`)
          continue
        }
        const ext = isVideo ? (f.type.includes('webm') ? 'webm' : f.type.includes('quicktime') ? 'mov' : 'mp4') : 'jpg'
        const blob = isVideo ? f : await imageToJpeg(f)
        const path = `${orgId}/${staffId}/${crypto.randomUUID()}.${ext}`
        const up = await supabase.storage
          .from(BOARD_BUCKET)
          .upload(path, blob, { contentType: isVideo ? f.type || 'video/mp4' : 'image/jpeg', cacheControl: '31536000' })
        if (up.error) throw new Error(up.error.message)
        added.push({ type: isVideo ? 'video' : 'image', path })
      } catch {
        setError('No se pudo subir uno de los archivos. Probá de nuevo.')
      }
    }
    setMedia((m) => [...m, ...added].slice(0, MAX_MEDIA))
    setUploading(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const move = (i: number, d: -1 | 1) =>
    setMedia((m) => {
      const j = i + d
      if (j < 0 || j >= m.length) return m
      const c = [...m]
      ;[c[i], c[j]] = [c[j]!, c[i]!]
      return c
    })

  const timer = (): BoardTimer | null =>
    mode === 'stopwatch'
      ? { mode }
      : mode === 'countdown'
        ? { mode, total_s: Math.max(10, cdMin * 60 + cdSec) }
        : mode === 'interval'
          ? { mode, work_s: work, rest_s: rest, rounds }
          : null

  const submit = async () => {
    if (!title.trim()) {
      setTitleError('Poné un título (ej.: "Funcional · Martes")')
      return
    }
    setSaving(true)
    setError(null)
    const r = await onSave({ title, body, media, timer: timer() })
    setSaving(false)
    if (!r.ok) {
      if (r.fieldErrors?.title) setTitleError(r.fieldErrors.title)
      setError(r.message ?? null)
    }
  }

  const num = (v: number, set: (n: number) => void, min: number, max: number, label: string, id: string) => (
    <label htmlFor={id} className="space-y-1">
      <span className="block text-xs text-zinc-400">{label}</span>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={v}
        onChange={(e) => set(Math.min(max, Math.max(min, Number(e.target.value) || 0)))}
        className={`${input} w-24 text-center`}
      />
    </label>
  )

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80 p-3 sm:p-6" onClick={onClose}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="board-editor-title"
        className="w-full max-w-3xl space-y-5 rounded-2xl border border-[#444] bg-[#2c2c2c] p-4 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="board-editor-title" className="text-lg font-bold text-white">
            {board ? 'Editar pizarra' : 'Nueva pizarra'}
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="grid h-11 w-11 place-items-center rounded-full text-zinc-300 hover:bg-zinc-800">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-zinc-400">Título</span>
          <input
            className={input}
            maxLength={80}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setTitleError(null)
            }}
            placeholder="Funcional · Circuito de piernas"
            aria-invalid={!!titleError}
            aria-describedby={titleError ? 'board-title-error' : undefined}
          />
          {titleError && (
            <span id="board-title-error" role="alert" className="block text-xs text-red-300">
              {titleError}
            </span>
          )}
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-zinc-400">Texto de la clase (opcional)</span>
          <textarea
            className={`${input} min-h-[140px] resize-y font-mono`}
            maxLength={2000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={'1. Sentadilla con salto · 15\n2. Estocadas alternadas · 20\n3. Burpees · 10\n\n4 vueltas · 1 min de pausa'}
          />
          <span className="block text-xs text-zinc-500">Una línea por ejercicio. En la TV se ve grande, tal cual lo escribís.</span>
        </label>

        {/* Imágenes y videos */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-zinc-400">
              Imágenes y videos (opcional) · {media.length}/{MAX_MEDIA}
            </span>
            <input
              ref={fileRef}
              id="board-files"
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
              multiple
              className="sr-only"
              onChange={(e) => upload(e.target.files)}
              disabled={!!uploading || media.length >= MAX_MEDIA}
            />
            <label
              htmlFor="board-files"
              className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-zinc-600 px-4 text-sm font-semibold text-white hover:border-[#edcc36] ${
                uploading || media.length >= MAX_MEDIA ? 'pointer-events-none opacity-50' : ''
              }`}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ImagePlus className="h-4 w-4" aria-hidden="true" />}
              {uploading ?? 'Agregar'}
            </label>
          </div>
          {media.length > 0 && (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {media.map((m, i) => {
                const url = boardMediaUrl(m.path) ?? ''
                return (
                  <li key={m.path} className="overflow-hidden rounded-lg border border-zinc-700 bg-black">
                    <div className="relative aspect-video">
                      {m.type === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt={`Imagen ${i + 1}`} className="h-full w-full object-cover" />
                      ) : (
                        <video src={url} muted playsInline preload="metadata" className="h-full w-full object-cover" aria-label={`Video ${i + 1}`} />
                      )}
                      <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-[11px] text-white">{m.type === 'video' ? 'Video' : i + 1}</span>
                    </div>
                    <div className="flex justify-between">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Mover antes" className="grid h-10 w-10 place-items-center text-zinc-300 disabled:opacity-30">
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button type="button" onClick={() => setMedia((all) => all.filter((_, n) => n !== i))} aria-label="Quitar" className="grid h-10 w-10 place-items-center text-red-300">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        disabled={i === media.length - 1}
                        aria-label="Mover después"
                        className="grid h-10 w-10 place-items-center text-zinc-300 disabled:opacity-30"
                      >
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="text-xs text-zinc-500">En la TV las imágenes van pasando solas; los videos se reproducen sin sonido. Videos de hasta {MAX_VIDEO_MB} MB.</p>
        </div>

        {/* Temporizador */}
        <fieldset className="space-y-3">
          <legend className="mb-1.5 text-xs font-medium text-zinc-400">Temporizador</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                ['none', 'Ninguno'],
                ['interval', 'Intervalos'],
                ['countdown', 'Cuenta regresiva'],
                ['stopwatch', 'Cronómetro'],
              ] as [TimerMode, string][]
            ).map(([v, label]) => (
              <label
                key={v}
                className="flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl border border-zinc-700 px-2 text-center text-sm text-zinc-200 has-[:checked]:border-[#edcc36] has-[:checked]:bg-[#edcc36]/10 has-[:checked]:font-semibold has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#edcc36]"
              >
                <input type="radio" name="timer-mode" checked={mode === v} onChange={() => setMode(v)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
          {mode === 'interval' && (
            <div className="flex flex-wrap gap-3">
              {num(work, setWork, 5, 3600, 'Trabajo (seg)', 'tm-work')}
              {num(rest, setRest, 0, 3600, 'Descanso (seg)', 'tm-rest')}
              {num(rounds, setRounds, 1, 99, 'Rondas', 'tm-rounds')}
            </div>
          )}
          {mode === 'countdown' && (
            <div className="flex flex-wrap gap-3">
              {num(cdMin, setCdMin, 0, 180, 'Minutos', 'tm-min')}
              {num(cdSec, setCdSec, 0, 59, 'Segundos', 'tm-sec')}
            </div>
          )}
          {mode !== 'none' && <p className="text-xs text-zinc-500">Lo arrancás y pausás desde tu celular cuando la pizarra está en la TV.</p>}
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-amber-300">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-[48px] rounded-xl border border-zinc-700 px-5 text-sm font-semibold text-zinc-200">
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !!uploading}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-[#edcc36] px-6 text-sm font-bold text-black disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
