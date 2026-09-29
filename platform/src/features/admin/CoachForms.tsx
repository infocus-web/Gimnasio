'use client'

import { useActionState } from 'react'
import { Plus } from 'lucide-react'
import type { ActionState } from './errors'
import { Field, inputClass, Notice, SubmitButton } from './ui'

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>

export const LEVELS: Record<string, string> = { beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado' }

export function TrainerSelectForm({ action, trainers, current }: { action: Action; trainers: { id: string; name: string }[]; current: string | null }) {
  const [state, formAction] = useActionState(action, {})
  return (
    <form action={formAction} className="space-y-2">
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="trainerId">Profesor a cargo</label>
        <select id="trainerId" name="trainerId" defaultValue={current ?? ''} className={inputClass}>
          <option value="">Sin profesor asignado</option>
          {trainers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <SubmitButton variant="ghost">Guardar</SubmitButton>
      </div>
      <Notice state={state} />
    </form>
  )
}

export function ProgramForm({
  action,
  values,
  submitLabel,
}: {
  action: Action
  values?: { name: string; goal: string | null; level: string | null; description: string | null }
  submitLabel: string
}) {
  const [state, formAction] = useActionState(action, {})
  const err = state.fieldErrors ?? {}
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Nombre" name="name" error={err.name}>
          <input id="name" name="name" defaultValue={values?.name ?? ''} placeholder="Ej. Hipertrofia 3 días" className={inputClass} />
        </Field>
        <Field label="Objetivo" name="goal">
          <input id="goal" name="goal" defaultValue={values?.goal ?? ''} placeholder="Ganar masa muscular" className={inputClass} />
        </Field>
        <Field label="Nivel" name="level">
          <select id="level" name="level" defaultValue={values?.level ?? ''} className={inputClass}>
            <option value="">—</option>
            {Object.entries(LEVELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Indicaciones generales (las ve el alumno)" name="description">
        <textarea id="description" name="description" rows={2} defaultValue={values?.description ?? ''} className={`${inputClass} py-2`} />
      </Field>
      <Notice state={state} />
      <div className="flex justify-end">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  )
}

export function AddDayForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, {})
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="new-day">Nombre del día</label>
      <input id="new-day" name="name" placeholder="Ej. Piernas" className={`${inputClass} w-48`} />
      <SubmitButton variant="ghost">
        <Plus className="h-4 w-4" aria-hidden="true" /> Agregar día
      </SubmitButton>
      <div className="w-full">
        <Notice state={state} />
      </div>
    </form>
  )
}

export function RenameDayForm({ action, name }: { action: Action; name: string }) {
  const [state, formAction] = useActionState(action, {})
  return (
    <form action={formAction} className="flex items-center gap-2">
      <label className="sr-only" htmlFor={`day-${name}`}>Nombre del día</label>
      <input id={`day-${name}`} name="name" defaultValue={name} className={`${inputClass} min-h-[40px] w-44 font-bold`} />
      <SubmitButton variant="ghost">Renombrar</SubmitButton>
      {state.message && !state.ok && <span className="text-xs text-red-300">{state.message}</span>}
    </form>
  )
}

export interface ExerciseOpt {
  id: string
  name: string
  muscle_group: string | null
}

export function AddExerciseForm({ action, exercises }: { action: Action; exercises: ExerciseOpt[] }) {
  const [state, formAction] = useActionState(action, {})
  const err = state.fieldErrors ?? {}
  const groups = new Map<string, ExerciseOpt[]>()
  for (const e of exercises) {
    const g = e.muscle_group ?? 'Otros'
    groups.set(g, [...(groups.get(g) ?? []), e])
  }
  return (
    <form action={formAction} className="space-y-2 rounded-xl border border-dashed border-zinc-800 p-3" noValidate key={state.ok ? String(Date.now()) : 'f'}>
      <div className="grid gap-2 sm:grid-cols-[1.6fr_70px_90px_90px_80px]">
        <Field label="Ejercicio" name="exerciseId" error={err.exerciseId}>
          <select id="exerciseId" name="exerciseId" defaultValue="" className={inputClass}>
            <option value="" disabled>
              Elegí…
            </option>
            {[...groups.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([g, list]) => (
                <optgroup key={g} label={g}>
                  {list.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
        </Field>
        <Field label="Series" name="sets" error={err.sets}>
          <input id="sets" name="sets" inputMode="numeric" defaultValue="3" className={inputClass} />
        </Field>
        <Field label="Reps" name="reps">
          <input id="reps" name="reps" defaultValue="10" placeholder="8-12" className={inputClass} />
        </Field>
        <Field label="Peso (kg)" name="weight" error={err.weight}>
          <input id="weight" name="weight" inputMode="decimal" className={inputClass} />
        </Field>
        <Field label="Pausa (s)" name="rest" error={err.rest}>
          <input id="rest" name="rest" inputMode="numeric" defaultValue="60" className={inputClass} />
        </Field>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <Field label="Nota para el alumno" name="notes">
            <input id="notes" name="notes" placeholder="Ej. bajar lento, 3 segundos" className={inputClass} />
          </Field>
        </div>
        <SubmitButton>
          <Plus className="h-4 w-4" aria-hidden="true" /> Agregar
        </SubmitButton>
      </div>
      <Notice state={state.ok ? {} : state} />
    </form>
  )
}

export function NewExerciseForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, {})
  const err = state.fieldErrors ?? {}
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Nombre" name="name" error={err.name}>
          <input id="ex-name" name="name" className={inputClass} placeholder="Ej. Hip thrust" />
        </Field>
        <Field label="Grupo muscular" name="muscleGroup">
          <input id="muscleGroup" name="muscleGroup" list="muscles" className={inputClass} />
          <datalist id="muscles">
            {['Pecho', 'Espalda', 'Piernas', 'Glúteos', 'Hombros', 'Bíceps', 'Tríceps', 'Core', 'Cardio'].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
        <Field label="Equipo" name="equipment">
          <input id="equipment" name="equipment" placeholder="Barra, mancuerna…" className={inputClass} />
        </Field>
      </div>
      <Field label="Video (YouTube / Instagram)" name="videoUrl" error={err.videoUrl} hint="El alumno lo ve desde la app mientras entrena">
        <input id="videoUrl" name="videoUrl" inputMode="url" className={inputClass} />
      </Field>
      <Field label="Cómo se hace" name="instructions">
        <textarea id="instructions" name="instructions" rows={2} className={`${inputClass} py-2`} />
      </Field>
      <Notice state={state} />
      <div className="flex justify-end">
        <SubmitButton variant="ghost">Guardar ejercicio</SubmitButton>
      </div>
    </form>
  )
}

export function AssignProgramForm({
  action,
  programs,
  current,
  today,
}: {
  action: Action
  programs: { id: string; name: string }[]
  current: string | null
  today: string
}) {
  const [state, formAction] = useActionState(action, {})
  return (
    <form action={formAction} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_160px_auto] sm:items-end">
        <Field label="Rutina" name="programId" error={state.fieldErrors?.programId}>
          <select id="programId" name="programId" defaultValue={current ?? ''} className={inputClass}>
            <option value="" disabled>
              Elegí una rutina
            </option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Desde" name="startsOn">
          <input id="startsOn" name="startsOn" type="date" defaultValue={today} className={inputClass} />
        </Field>
        <SubmitButton>Asignar</SubmitButton>
      </div>
      <Notice state={state} />
    </form>
  )
}
