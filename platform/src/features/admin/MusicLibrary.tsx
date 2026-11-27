'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Music, Trash2, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ActionState } from './errors'
import { fmtDuration, MUSIC_BUCKET, MUSIC_MAX_MB, type MusicTrack } from '@/features/screens/music'

const TYPES: Record<string, { ext: 'mp3' | 'm4a'; type: string }> = {
  'audio/mpeg': { ext: 'mp3', type: 'audio/mpeg' },
  'audio/mp3': { ext: 'mp3', type: 'audio/mpeg' },
  'audio/mp4': { ext: 'm4a', type: 'audio/mp4' },
  'audio/x-m4a': { ext: 'm4a', type: 'audio/mp4' },
  'audio/aac': { ext: 'm4a', type: 'audio/mp4' },
}

function kindOf(f: File) {
  if (TYPES[f.type]) return TYPES[f.type]!
  const ext = f.name.split('.').pop()?.toLowerCase()
  return ext === 'mp3' ? TYPES['audio/mpeg']! : ext === 'm4a' ? TYPES['audio/mp4']! : null
}

/** Duración del archivo (para mostrarla en la lista); null si el navegador no la puede leer */
function durationOf(f: File): Promise<number | null> {
  return new Promise((ok) => {
    const url = URL.createObjectURL(f)
    const a = new Audio()
    const done = (v: number | null) => {
      URL.revokeObjectURL(url)
      ok(v)
    }
    const t = setTimeout(() => done(null), 8000)
    a.preload = 'metadata'
    a.onloadedmetadata = () => {
      clearTimeout(t)
      done(Number.isFinite(a.duration) ? a.duration : null)
    }
    a.onerror = () => {
      clearTimeout(t)
      done(null)
    }
    a.src = url
  })
}

const titleOf = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Tema'

/** Administración: subir MP3/M4A para la TV, ordenarlos, pausarlos o borrarlos. */
export function MusicLibrary({
  orgId,
  tracks,
  add,
  remove,
  toggle,
  move,
}: {
  orgId: string
  tracks: MusicTrack[]
  add: (path: string, title: string, durationS: number | null) => Promise<ActionState>
  remove: (id: string) => Promise<ActionState>
  toggle: (id: string, active: boolean) => Promise<ActionState>
  move: (id: string, dir: -1 | 1) => Promise<ActionState>
}) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()
  const busy = !!uploading || pending

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
    const all = Array.from(files)
    let added = 0
    let lastError = ''
    for (let i = 0; i < all.length; i++) {
      const f = all[i]!
      const kind = kindOf(f)
      if (!kind) {
        lastError = `"${f.name}" no es MP3 ni M4A.`
        continue
      }
      if (f.size > MUSIC_MAX_MB * 1024 * 1024) {
        lastError = `"${f.name}" pesa más de ${MUSIC_MAX_MB} MB.`
        continue
      }
      setUploading(`Subiendo ${i + 1} de ${all.length}…`)
      try {
        const [duration] = await Promise.all([durationOf(f)])
        const path = `${orgId}/${crypto.randomUUID()}.${kind.ext}`
        const up = await supabase.storage.from(MUSIC_BUCKET).upload(path, f, { contentType: kind.type, cacheControl: '31536000' })
        if (up.error) throw new Error(up.error.message)
        const r = await add(path, titleOf(f.name), duration)
        if (r.ok) added++
        else lastError = r.message ?? 'No se pudo agregar.'
      } catch {
        lastError = `No se pudo subir "${f.name}". Probá de nuevo.`
      }
    }
    setUploading(null)
    if (input.current) input.current.value = ''
    setMsg(
      lastError
        ? { ok: false, text: added ? `Se agregaron ${added}. ${lastError}` : lastError }
        : { ok: true, text: added === 1 ? 'Tema agregado.' : `Se agregaron ${added} temas.` },
    )
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={input}
          id="music-upload"
          type="file"
          accept="audio/mpeg,audio/mp4,audio/x-m4a,.mp3,.m4a"
          multiple
          className="sr-only"
          disabled={busy}
          onChange={(e) => upload(e.target.files)}
        />
        <label
          htmlFor="music-upload"
          className={`inline-flex min-h-[48px] cursor-pointer items-center gap-2 rounded-xl bg-[#edcc36] px-5 text-sm font-bold text-black ${busy ? 'pointer-events-none opacity-60' : ''}`}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
          {uploading ?? 'Agregar temas (MP3)'}
        </label>
        <p className="text-xs text-zinc-400">Podés elegir varios juntos. MP3 o M4A de hasta {MUSIC_MAX_MB} MB cada uno.</p>
      </div>

      <p aria-live="polite" className={`text-sm ${msg ? (msg.ok ? 'text-emerald-300' : 'text-amber-300') : 'sr-only'}`}>
        {msg?.text ?? ''}
      </p>

      {tracks.length ? (
        <ol className="divide-y divide-zinc-900 rounded-xl border border-zinc-800">
          {tracks.map((t, i) => (
            <li key={t.id} className={`flex items-center gap-2 px-3 py-1.5 ${t.active ? '' : 'opacity-50'}`}>
              <Music className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm text-white">{t.title}</span>
              <span className="shrink-0 text-xs text-zinc-500">{fmtDuration(t.duration_s)}</span>
              <button
                type="button"
                disabled={busy || i === 0}
                onClick={() => run(() => move(t.id, -1))}
                aria-label={`Subir "${t.title}"`}
                className="grid h-10 w-10 place-items-center rounded-lg text-zinc-300 hover:bg-zinc-800 disabled:opacity-30"
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={busy || i === tracks.length - 1}
                onClick={() => run(() => move(t.id, 1))}
                aria-label={`Bajar "${t.title}"`}
                className="grid h-10 w-10 place-items-center rounded-lg text-zinc-300 hover:bg-zinc-800 disabled:opacity-30"
              >
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => toggle(t.id, !t.active))}
                aria-label={t.active ? `Pausar "${t.title}"` : `Volver a pasar "${t.title}"`}
                title={t.active ? 'Pausar' : 'Mostrar'}
                className="grid h-10 w-10 place-items-center rounded-lg text-zinc-300 hover:bg-zinc-800"
              >
                {t.active ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`¿Borrar "${t.title}"?`)) run(() => remove(t.id))
                }}
                aria-label={`Borrar "${t.title}"`}
                className="grid h-10 w-10 place-items-center rounded-lg text-red-300 hover:bg-red-950/50"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-2xl border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-400">Todavía no subiste música.</p>
      )}
      <p className="text-xs text-zinc-500">
        Usá música comprada o de bibliotecas libres para uso comercial. Pasar música en el gimnasio requiere las licencias de SADAIC y AADI-CAPIF.
      </p>
    </div>
  )
}
