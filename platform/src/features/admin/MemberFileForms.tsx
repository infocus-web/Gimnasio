'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Loader2, Trash2, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ActionState } from './errors'
import { Notice, SubmitButton, inputClass, useActionForm } from './ui'
import { WebcamCapture } from './WebcamCapture'

/** Ficha: ver / cambiar la foto del socio (webcam o archivo). */
export function MemberPhotoForm({
  current,
  action,
  canWrite,
}: {
  current: string | null
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  canWrite: boolean
}) {
  const [state, submit] = useActionForm(action, {})
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (state.ok) setEditing(false)   // guardada: vuelve a mostrar la foto
  }, [state])
  if (!canWrite || !editing) {
    return (
      <div className="space-y-3">
        <div className="mx-auto aspect-square w-full max-w-[220px] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
          {current ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current} alt="Foto del socio" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center p-4 text-center text-sm text-zinc-500">Sin foto</div>
          )}
        </div>
        {canWrite && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-semibold text-zinc-200"
            >
              {current ? 'Cambiar foto' : 'Sacar foto'}
            </button>
          </div>
        )}
        {state.ok && <Notice state={state} />}
      </div>
    )
  }
  return (
    <form action={submit} className="space-y-3">
      <WebcamCapture current={current} />
      <div className="flex justify-center gap-2">
        <SubmitButton>Guardar foto</SubmitButton>
        <button type="button" onClick={() => setEditing(false)} className="min-h-[44px] px-3 text-sm text-zinc-400">
          Cancelar
        </button>
      </div>
      <Notice state={state} />
    </form>
  )
}

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp'
const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/** Ficha: apto físico (PDF o foto). Se sube directo al almacenamiento privado. */
export function MedicalCertCard({
  orgId,
  memberId,
  viewUrl,
  uploadedLabel,
  expiresOn,
  expired,
  canWrite,
  save,
  remove,
}: {
  orgId: string
  memberId: string
  viewUrl: string | null
  uploadedLabel: string | null
  expiresOn: string | null
  expired: boolean
  canWrite: boolean
  save: (path: string, expiresOn: string | null) => Promise<ActionState>
  remove: (prev: ActionState) => Promise<ActionState>
}) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [expires, setExpires] = useState('')
  const [state, setState] = useState<ActionState>({})
  const [pending, start] = useTransition()
  const [removeState, doRemove] = useActionForm(remove, {})
  const [replacing, setReplacing] = useState(false)
  const [sureRemove, setSureRemove] = useState(false)
  useEffect(() => {
    if (removeState.ok) setSureRemove(false)
  }, [removeState])

  const upload = () =>
    start(async () => {
      if (!file) return setState({ message: 'Elegí el archivo del apto (PDF o foto).' })
      const ext = EXT[file.type]
      if (!ext) return setState({ message: 'Tiene que ser PDF, JPG, PNG o WEBP.' })
      if (file.size > 10 * 1024 * 1024) return setState({ message: 'El archivo pesa más de 10 MB.' })
      const path = `${orgId}/${memberId}/apto-${Date.now()}.${ext}`
      const { error } = await createClient().storage.from('socios').upload(path, file, { contentType: file.type })
      if (error) return setState({ message: 'No se pudo subir el archivo. Probá de nuevo.' })
      const r = await save(path, expires || null)
      setState(r)
      if (r.ok) {
        setFile(null)
        setExpires('')
        setReplacing(false)
        router.refresh()
      }
    })

  const form = (
    <div className="space-y-3">
      <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-dashed border-zinc-700 px-4 py-3 text-sm text-zinc-300 hover:border-[#edcc36]/60">
        <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{file ? file.name : 'Elegir archivo (PDF o foto del apto)'}</span>
        <input type="file" accept={ACCEPT} className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-zinc-400">Vence (opcional)</span>
        <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={inputClass} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={upload}
          disabled={pending}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#edcc36] px-5 text-sm font-bold text-black disabled:opacity-60"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Adjuntar apto físico
        </button>
        {replacing && (
          <button type="button" onClick={() => setReplacing(false)} className="min-h-[44px] px-3 text-sm text-zinc-400">
            Cancelar
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-3">
      {viewUrl ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <a
              href={viewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-700 px-4 font-semibold text-zinc-100 hover:border-[#edcc36]/60"
            >
              <FileText className="h-4 w-4" aria-hidden="true" /> Ver apto
            </a>
            <span className="text-zinc-400">
              {uploadedLabel && <>Cargado el {uploadedLabel}</>}
              {expiresOn && (
                <span className={expired ? 'ml-1 font-semibold text-red-300' : 'ml-1 text-zinc-300'}>
                  · {expired ? 'VENCIDO el' : 'vence el'} {expiresOn}
                </span>
              )}
            </span>
          </div>
          {canWrite &&
            (replacing ? (
              form
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setReplacing(true)}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-semibold text-zinc-200"
                >
                  <Upload className="h-4 w-4" aria-hidden="true" /> Reemplazar
                </button>
                {sureRemove ? (
                  <form action={doRemove} className="flex flex-wrap items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-2">
                    <span className="text-xs text-zinc-300">
                      <strong className="text-white">¿Seguro?</strong> Se borra el archivo del apto físico.
                    </span>
                    <SubmitButton variant="ghost">
                      <Trash2 className="h-4 w-4" aria-hidden="true" /> Sí, quitar
                    </SubmitButton>
                    <button type="button" onClick={() => setSureRemove(false)} className="min-h-[44px] px-3 text-sm text-zinc-400 hover:text-white">
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSureRemove(true)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-red-500/30 px-4 text-sm font-semibold text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" /> Quitar
                  </button>
                )}
              </div>
            ))}
        </div>
      ) : canWrite ? (
        <>
          <p className="text-sm text-amber-200">Todavía no tiene apto físico cargado.</p>
          {form}
        </>
      ) : (
        <p className="text-sm text-zinc-500">Sin apto físico cargado.</p>
      )}
      <Notice state={state} />
      <Notice state={removeState} />
    </div>
  )
}
