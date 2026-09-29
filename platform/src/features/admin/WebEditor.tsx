'use client'

import { useActionState, useMemo, useRef, useState } from 'react'
import { ImagePlus, Loader2, Trash2, ExternalLink, GripVertical } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ActionState } from './errors'
import { Card, Field, inputClass, Notice, SubmitButton } from './ui'

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export interface WebValues {
  tagline?: string
  hero_kicker?: string
  hero_text?: string
  hero_image?: string
  about_title?: string
  about_text?: string
  about_images?: string[]
  gallery?: string[]
  phone?: string
  whatsapp?: string
  email?: string
  instagram?: string
  facebook?: string
  address?: string
  maps_url?: string
}

/** Achica la foto en el navegador (máx. 1920 px, JPEG) antes de subirla */
async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen'))), 'image/jpeg', 0.85),
  )
}

function useUploader(orgId: string) {
  const supabase = useMemo(() => createClient(), [])
  return async (file: File) => {
    if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen')
    if (file.size > 25 * 1024 * 1024) throw new Error('La imagen supera 25 MB')
    const blob = await compress(file)
    const path = `${orgId}/web/${crypto.randomUUID()}.jpg`
    const { error } = await supabase.storage.from('media').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
    if (error) throw new Error('No se pudo subir la imagen')
    return supabase.storage.from('media').getPublicUrl(path).data.publicUrl
  }
}

function ImageSlot({ name, label, initial, orgId, aspect = 'aspect-video' }: { name: string; label: string; initial?: string; orgId: string; aspect?: string }) {
  const [url, setUrl] = useState(initial ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const upload = useUploader(orgId)
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      <input type="hidden" name={name} value={url} />
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={`group relative grid w-full place-items-center overflow-hidden rounded-xl border border-dashed border-zinc-700 bg-black ${aspect} hover:border-[#edcc36]/60`}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        <span className="relative z-10 flex items-center gap-2 rounded-lg bg-black/70 px-3 py-2 text-xs font-semibold text-white opacity-90 group-hover:opacity-100">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ImagePlus className="h-4 w-4" aria-hidden="true" />}
          {busy ? 'Subiendo…' : url ? 'Cambiar foto' : 'Subir foto'}
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          setBusy(true)
          setError(null)
          try {
            setUrl(await upload(f))
          } catch (err) {
            setError((err as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      />
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    </div>
  )
}

function Gallery({ initial, orgId }: { initial: string[]; orgId: string }) {
  const [items, setItems] = useState(initial)
  const [busy, setBusy] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const upload = useUploader(orgId)
  const move = (i: number, d: -1 | 1) =>
    setItems((xs) => {
      const j = i + d
      if (j < 0 || j >= xs.length) return xs
      const c = [...xs]
      ;[c[i], c[j]] = [c[j]!, c[i]!]
      return c
    })
  return (
    <div className="space-y-3">
      {items.map((u) => (
        <input key={u} type="hidden" name="gallery" value={u} />
      ))}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((u, i) => (
          <li key={u} className="group relative aspect-square overflow-hidden rounded-xl border border-zinc-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt={`Foto ${i + 1} de la galería`} className="h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/70 p-1.5">
              <span className="flex gap-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Mover antes"
                  className="grid h-8 w-8 place-items-center rounded-md text-zinc-300 hover:bg-zinc-800 disabled:opacity-30">
                  <GripVertical className="h-4 w-4 -rotate-90" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Mover después"
                  className="grid h-8 w-8 place-items-center rounded-md text-zinc-300 hover:bg-zinc-800 disabled:opacity-30">
                  <GripVertical className="h-4 w-4 rotate-90" aria-hidden="true" />
                </button>
              </span>
              <button type="button" onClick={() => setItems((xs) => xs.filter((x) => x !== u))} aria-label="Quitar foto"
                className="grid h-8 w-8 place-items-center rounded-md text-red-300 hover:bg-red-500/20">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
        <li>
          <button type="button" onClick={() => input.current?.click()}
            className="grid aspect-square w-full place-items-center rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-400 hover:border-[#edcc36]/60 hover:text-white">
            <span className="flex flex-col items-center gap-2">
              {busy ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" /> : <ImagePlus className="h-6 w-6" aria-hidden="true" />}
              {busy ? `Subiendo ${busy}…` : 'Agregar fotos'}
            </span>
          </button>
        </li>
      </ul>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])].slice(0, 12)
          e.target.value = ''
          setError(null)
          for (const f of files) {
            setBusy((b) => b + 1)
            try {
              const u = await upload(f)
              setItems((xs) => [...xs, u])
            } catch (err) {
              setError((err as Error).message)
            } finally {
              setBusy((b) => b - 1)
            }
          }
        }}
      />
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    </div>
  )
}

interface TextFieldProps {
  name: keyof WebValues
  label: string
  max: number
  rows?: number
  hint?: string
  placeholder?: string
  values: WebValues
  errors: Record<string, string>
}

function TextField({ name, label, max, rows, hint, placeholder, values, errors }: TextFieldProps) {
  const def = (values[name] as string | undefined) ?? ''
  return (
    <Field label={label} name={name} error={errors[name]} hint={hint}>
      {rows ? (
        <textarea id={name} name={name} rows={rows} maxLength={max} defaultValue={def} placeholder={placeholder} className={`${inputClass} py-2`} />
      ) : (
        <input id={name} name={name} maxLength={max} defaultValue={def} placeholder={placeholder} className={inputClass} />
      )}
    </Field>
  )
}

export function WebEditor({
  action,
  values,
  hours,
  orgId,
  publicUrl,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  values: WebValues
  hours: { weekday: number; open: string; close: string }[]
  orgId: string
  publicUrl: string
}) {
  const [state, formAction] = useActionState(action, {})
  const err = state.fieldErrors ?? {}
  const v = values

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-900 bg-[#09090b]/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0">
        <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white">
          <ExternalLink className="h-4 w-4" aria-hidden="true" /> Ver la web
        </a>
        <SubmitButton>Publicar cambios</SubmitButton>
      </div>
      <Notice state={state} />

      <Card title="Portada">
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-3">
            <TextField values={v} errors={err} name="hero_kicker" label="Texto chico arriba del título" max={60} placeholder="Gimnasio y centro de fitness" />
            <TextField values={v} errors={err} name="tagline" label="Frase principal" max={80} placeholder="Evolucioná tu entrenamiento" />
            <TextField values={v} errors={err} name="hero_text" label="Bajada" max={240} rows={3} />
          </div>
          <ImageSlot name="hero_image" label="Foto de portada (horizontal)" initial={v.hero_image} orgId={orgId} />
        </div>
      </Card>

      <Card title="Nosotros">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-3">
            <TextField values={v} errors={err} name="about_title" label="Título" max={120} />
            <TextField values={v} errors={err} name="about_text" label="Texto" max={1200} rows={6} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ImageSlot name="about_image_1" label="Foto 1" initial={v.about_images?.[0]} orgId={orgId} aspect="aspect-[3/4]" />
            <ImageSlot name="about_image_2" label="Foto 2" initial={v.about_images?.[1]} orgId={orgId} aspect="aspect-[3/4]" />
          </div>
        </div>
      </Card>

      <Card title="Horarios del gimnasio">
        <div className="space-y-2">
          {DAYS.map((d, i) => {
            const h = hours.find((x) => x.weekday === i + 1)
            return (
              <div key={d} className="flex flex-wrap items-center gap-3">
                <label className="flex min-h-[44px] w-32 items-center gap-2 text-sm text-zinc-200">
                  <input type="checkbox" name={`day${i + 1}_open_flag`} defaultChecked={!!h} className="h-4 w-4 accent-[#edcc36]" />
                  {d}
                </label>
                <input type="time" name={`day${i + 1}_open`} defaultValue={h?.open ?? '08:00'} aria-label={`${d} abre`} className={`${inputClass} w-32`} />
                <span className="text-zinc-500">a</span>
                <input type="time" name={`day${i + 1}_close`} defaultValue={h?.close ?? '22:00'} aria-label={`${d} cierra`} className={`${inputClass} w-32`} />
              </div>
            )
          })}
          {err.hours && <p role="alert" className="text-xs text-red-300">{err.hours}</p>}
          <p className="text-xs text-zinc-500">
            Destildá los días que cierra. Estos horarios también se usan para el cartel "Abierto ahora" y los horarios pico de la app.
          </p>
        </div>
      </Card>

      <Card title="Contacto">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField values={v} errors={err} name="phone" label="Teléfono" max={40} placeholder="+54 230 442-6425" />
          <TextField values={v} errors={err} name="whatsapp" label="WhatsApp" max={40} placeholder="+54 9 230 …" hint="Muestra el botón de WhatsApp en la web" />
          <TextField values={v} errors={err} name="email" label="Email" max={120} />
          <TextField values={v} errors={err} name="instagram" label="Instagram" max={60} placeholder="@gym.evolutionfitnesspilar" />
          <TextField values={v} errors={err} name="facebook" label="Facebook" max={80} placeholder="evolutionPILAR" />
          <TextField values={v} errors={err} name="address" label="Dirección" max={160} />
          <div className="sm:col-span-2">
            <TextField values={v} errors={err} name="maps_url" label="Link de Google Maps" max={300} hint='En Google Maps: "Compartir" → "Copiar vínculo"' />
          </div>
        </div>
      </Card>

      <Card title="Galería de fotos">
        <Gallery initial={v.gallery ?? []} orgId={orgId} />
      </Card>

      <div className="flex justify-end">
        <SubmitButton>Publicar cambios</SubmitButton>
      </div>
    </form>
  )
}
