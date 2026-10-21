'use client'

import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { Search, Tv, PlayCircle } from 'lucide-react'
import type { ActionState } from '@/features/admin/errors'
import { Field, Notice, SubmitButton, inputClass, useActionForm } from '@/features/admin/ui'

type WithForm = (prev: ActionState, form: FormData) => Promise<ActionState>
type Bare = (prev: ActionState) => Promise<ActionState>

export interface ExerciseOption {
  id: string
  name: string
  muscle_group: string | null
  video_url: string | null
}

export function MachineForm({
  action,
  exercises,
  values,
  submitLabel,
}: {
  action: WithForm
  exercises: ExerciseOption[]
  values?: { name: string; area: string | null; photo_url: string | null; active: boolean; exerciseIds: string[] }
  submitLabel: string
}) {
  const [state, submit] = useActionForm(action)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set(values?.exerciseIds ?? []))

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const map = new Map<string, ExerciseOption[]>()
    for (const e of exercises) {
      if (q && !e.name.toLowerCase().includes(q) && !(e.muscle_group ?? '').toLowerCase().includes(q)) continue
      const g = e.muscle_group || 'Otros'
      map.set(g, [...(map.get(g) ?? []), e])
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'))
  }, [exercises, query])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < 20) next.add(id)
      return next
    })

  const chosen = exercises.filter((e) => selected.has(e.id))

  return (
    <form action={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre de la máquina" name="name" error={state.fieldErrors?.name}>
          <input name="name" required maxLength={80} defaultValue={values?.name} placeholder="Ej.: Prensa 45°" className={inputClass} />
        </Field>
        <Field label="Sector (opcional)" name="area" error={state.fieldErrors?.area} hint="Ej.: Piernas, Planta alta, Zona cardio">
          <input name="area" maxLength={60} defaultValue={values?.area ?? ''} className={inputClass} />
        </Field>
      </div>
      <Field label="Foto (opcional)" name="photo_url" error={state.fieldErrors?.photo_url} hint="Link a una foto de la máquina (https://…)">
        <input name="photo_url" type="url" inputMode="url" maxLength={500} defaultValue={values?.photo_url ?? ''} placeholder="https://" className={inputClass} />
      </Field>
      {values && (
        <label className="flex min-h-[44px] items-center gap-3 text-sm text-zinc-200">
          <input type="checkbox" name="active" defaultChecked={values.active} className="h-5 w-5 accent-[#edcc36]" />
          Máquina en uso (si la destildás, el QR muestra “no encontrada”)
        </label>
      )}

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-zinc-400">Ejercicios que se hacen en esta máquina ({selected.size}/20)</legend>
        {chosen.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Ejercicios elegidos">
            {chosen.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => toggle(e.id)}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-[#edcc36]/50 bg-[#edcc36]/10 px-3 text-xs font-semibold text-[#f5e38a] hover:bg-[#edcc36]/20"
                  aria-label={`Quitar ${e.name}`}
                >
                  {e.name} <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {[...selected].map((id) => (
          <input key={id} type="hidden" name="exercise" value={id} />
        ))}
        <label className="relative block">
          <span className="sr-only">Buscar ejercicio</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar ejercicio o grupo muscular"
            className={`${inputClass} pl-9`}
          />
        </label>
        <div className="max-h-72 overflow-y-auto rounded-xl border border-zinc-800 p-2">
          {groups.length === 0 ? (
            <p className="p-2 text-sm text-zinc-500">
              {exercises.length === 0 ? 'Todavía no hay ejercicios en la biblioteca. Cargalos desde Rutinas.' : 'No hay ejercicios con ese nombre.'}
            </p>
          ) : (
            groups.map(([group, list]) => (
              <div key={group} className="py-1">
                <p className="px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-zinc-500">{group}</p>
                {list.map((e) => (
                  <label key={e.id} className="flex min-h-[40px] cursor-pointer items-center gap-3 rounded-lg px-2 text-sm text-zinc-200 hover:bg-zinc-900">
                    <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} className="h-4 w-4 accent-[#edcc36]" />
                    <span className="flex-1">{e.name}</span>
                    {e.video_url && <PlayCircle className="h-4 w-4 text-zinc-500" aria-label="tiene video" />}
                  </label>
                ))}
              </div>
            ))
          )}
        </div>
      </fieldset>

      <Notice state={state} />
      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  )
}

// ---------------------------------------------------------------------
// Pantalla de TV
// ---------------------------------------------------------------------
export function TvLinkPanel({ slug, linked, seenLabel, action }: { slug: string; linked: boolean; seenLabel: string | null; action: Bare }) {
  const [state, submit] = useActionForm(action)
  const [sure, setSure] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  const link = state.secret && typeof window !== 'undefined' ? `${window.location.origin}/${slug}/tv#k=${state.secret}` : null
  useEffect(() => {
    if (!link) return
    QRCode.toDataURL(link, { margin: 1, width: 240 }).then(setQr).catch(() => setQr(null))
  }, [link])

  return (
    <div className="space-y-3">
      {linked && !link && (
        <p className={`text-sm ${seenLabel ? 'text-emerald-300' : 'text-zinc-400'}`}>
          {seenLabel ? `TV vinculada · última conexión ${seenLabel}` : 'TV vinculada, esperando que se abra el link en el televisor.'}
        </p>
      )}
      {link ? (
        <div className="flex flex-wrap items-start gap-4 rounded-xl border border-[#edcc36]/30 bg-[#edcc36]/10 p-3 text-sm text-[#f5e38a]">
          {qr && <img src={qr} alt="Código QR con el link de la TV" width={160} height={160} className="rounded-lg bg-white p-1" />}
          <div className="min-w-0 flex-1 space-y-2">
            <p>Abrí este link en el navegador del Smart TV (o en la compu/TV Box conectada). Queda guardado: después de un corte arranca solo.</p>
            <p className="break-all font-mono text-xs text-white">{link}</p>
          </div>
        </div>
      ) : linked && !sure ? (
        <button type="button" onClick={() => setSure(true)} className="min-h-[44px] text-sm text-zinc-400 underline hover:text-white">
          Vincular otro televisor
        </button>
      ) : (
        <form action={submit} className="flex flex-wrap items-center gap-2">
          {linked && <span className="text-xs text-amber-200">El televisor anterior deja de mostrar la pantalla.</span>}
          <SubmitButton variant={linked ? 'ghost' : 'primary'}>
            <Tv className="h-4 w-4" aria-hidden="true" /> {linked ? 'Sí, generar link nuevo' : 'Generar link para la TV'}
          </SubmitButton>
        </form>
      )}
      <Notice state={state} />
    </div>
  )
}

export function TvSettingsForm({ action, ranking, message }: { action: WithForm; ranking: boolean; message: string | null }) {
  const [state, submit] = useActionForm(action)
  const [text, setText] = useState(message ?? '')
  return (
    <form action={submit} className="space-y-3">
      <Field label="Mensaje del gimnasio (opcional)" name="message" error={state.fieldErrors?.message} hint={`${text.length}/280 · Ej.: “El sábado abrimos de 9 a 13 h”`}>
        <textarea
          name="message"
          rows={2}
          maxLength={280}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={`${inputClass} min-h-[72px] py-2`}
        />
      </Field>
      <label className="flex min-h-[44px] items-center gap-3 text-sm text-zinc-200">
        <input type="checkbox" name="ranking" defaultChecked={ranking} className="h-5 w-5 accent-[#edcc36]" />
        Mostrar el ranking de constancia del mes (nombre e inicial del apellido)
      </label>
      <Notice state={state} />
      <SubmitButton variant="ghost">Guardar</SubmitButton>
    </form>
  )
}
