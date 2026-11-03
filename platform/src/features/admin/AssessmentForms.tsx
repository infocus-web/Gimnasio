'use client'

import { useState, useTransition } from 'react'
import { FileSpreadsheet, Trash2 } from 'lucide-react'
import type { ActionState } from './errors'
import type { ScaleImportState } from './assessment-actions'
import { Field, inputClass, Notice, SubmitButton, useActionForm } from './ui'

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>

function Num({ name, label, hint, err, step = '1', placeholder }: { name: string; label: string; hint?: string; err?: string; step?: string; placeholder?: string }) {
  return (
    <Field label={label} name={name} error={err} hint={hint}>
      <input name={name} inputMode="decimal" step={step} placeholder={placeholder} className={inputClass} aria-invalid={err ? true : undefined} />
    </Field>
  )
}

/** Formulario guiado del Evolution Check (cada prueba es opcional) */
export function AssessmentForm({
  action,
  today,
  defaults,
}: {
  action: Action
  today: string
  defaults: { sex: 'F' | 'M' | null; age: number | null; height: number | null }
}) {
  const [state, formAction] = useActionForm(action, {})
  const err = state.fieldErrors ?? {}
  const section = 'space-y-3 rounded-2xl border border-[#444] p-4'
  const h = 'text-sm font-bold text-white'
  const how = 'text-xs text-zinc-400'
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Fecha" name="date" error={err.date}>
          <input type="date" name="date" defaultValue={today} max={today} className={inputClass} />
        </Field>
        <Field label="Edad" name="age_years" error={err.age_years} hint={defaults.age !== null ? 'Calculada con la fecha de nacimiento' : undefined}>
          <input name="age_years" inputMode="numeric" defaultValue={defaults.age ?? ''} className={inputClass} />
        </Field>
        <Field label="Tabla de referencia" name="sex" error={err.sex} hint="Los valores esperados cambian según el sexo">
          <select name="sex" defaultValue={defaults.sex ?? ''} className={inputClass}>
            <option value="" disabled>
              Elegí…
            </option>
            <option value="F">Mujer</option>
            <option value="M">Hombre</option>
          </select>
        </Field>
      </div>

      <section className={section}>
        <h3 className={h}>Composición corporal</h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <Num name="weight_kg" label="Peso (kg)" step="0.1" err={err.weight_kg} />
          <Field label="Altura (cm)" name="height_cm" error={err.height_cm}>
            <input name="height_cm" inputMode="decimal" defaultValue={defaults.height ?? ''} className={inputClass} />
          </Field>
          <Num name="body_fat_pct" label="% de grasa" step="0.1" hint="De la balanza" err={err.body_fat_pct} />
          <Num name="waist_cm" label="Cintura (cm)" step="0.5" hint="A la altura del ombligo" err={err.waist_cm} />
        </div>
      </section>

      <section className={section}>
        <h3 className={h}>Fuerza y core</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Num name="squats_1min" label="Sentadillas en 1 minuto" err={err.squats_1min} />
            <p className={how}>Bajando hasta que el muslo quede paralelo, sin peso.</p>
          </div>
          <div className="space-y-1">
            <Num name="pushups" label="Flexiones seguidas" err={err.pushups} />
            <p className={how}>Hasta no poder mantener la técnica. Mujeres pueden apoyar rodillas.</p>
          </div>
          <div className="space-y-1">
            <Num name="plank_s" label="Plancha (segundos)" err={err.plank_s} />
            <p className={how}>Sobre antebrazos, cuerpo alineado. Se corta cuando cae la cadera.</p>
          </div>
        </div>
      </section>

      <section className={section}>
        <h3 className={h}>Cardio</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Num name="step_hr" label="Pulso después del escalón" err={err.step_hr} />
            <p className={how}>Subir y bajar un escalón de 30 cm durante 3 minutos (24 subidas por minuto), sentarse y contar el pulso de 1 minuto.</p>
          </div>
          <div className="space-y-1">
            <Num name="resting_hr" label="Pulso en reposo" err={err.resting_hr} />
            <p className={how}>Si no hace el escalón: pulso de 1 minuto sentado y tranquilo.</p>
          </div>
        </div>
      </section>

      <section className={section}>
        <h3 className={h}>Movilidad y equilibrio</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Num name="sit_reach_cm" label="Flexión de tronco (cm)" step="0.5" err={err.sit_reach_cm} />
            <p className={how}>Sentado, piernas estiradas: 0 = llega a la punta de los pies; negativo si no llega, positivo si pasa.</p>
          </div>
          <div className="space-y-1">
            <Num name="balance_s" label="Equilibrio en una pierna (segundos, máx. 60)" err={err.balance_s} />
            <p className={how}>Ojos cerrados, manos en la cintura. Se corta al apoyar el otro pie o abrir los ojos.</p>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Objetivo del alumno" name="goal" error={err.goal}>
          <input name="goal" maxLength={200} placeholder="Ej. bajar 5 kg y correr 10 km" className={inputClass} />
        </Field>
        <Field label="Observaciones" name="notes" error={err.notes}>
          <input name="notes" maxLength={1000} placeholder="Molestia en rodilla izquierda…" className={inputClass} />
        </Field>
      </div>

      <Notice state={state} />
      <SubmitButton>Guardar evaluación</SubmitButton>
    </form>
  )
}

/** Carga manual de una medición de balanza (InBody / Tanita) */
export function ScaleReadingForm({ action, today }: { action: Action; today: string }) {
  const [state, formAction] = useActionForm(action, {})
  const err = state.fieldErrors ?? {}
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha" name="date" error={err.date}>
          <input type="date" name="date" defaultValue={today} max={today} className={inputClass} />
        </Field>
        <Num name="weight_kg" label="Peso (kg)" step="0.1" err={err.weight_kg} />
        <Num name="body_fat_pct" label="% de grasa" step="0.1" err={err.body_fat_pct} />
        <Num name="muscle_kg" label="Masa muscular (kg)" step="0.1" err={err.muscle_kg} />
        <Num name="visceral_fat" label="Grasa visceral" step="0.5" err={err.visceral_fat} />
        <Num name="water_pct" label="Agua (%)" step="0.1" err={err.water_pct} />
        <Num name="bmr_kcal" label="Metabolismo basal (kcal)" err={err.bmr_kcal} />
      </div>
      <Notice state={state} />
      <SubmitButton variant="ghost">Guardar medición</SubmitButton>
    </form>
  )
}

/** Importar el CSV que exporta la balanza */
export function ScaleImportForm({ action }: { action: (prev: ScaleImportState, form: FormData) => Promise<ScaleImportState> }) {
  const [state, formAction] = useActionForm(action as Action, {})
  const r = (state as ScaleImportState).result
  return (
    <form action={formAction} className="space-y-3">
      <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-[#555] p-4 text-sm text-zinc-300 hover:border-[#edcc36]/60">
        <FileSpreadsheet className="h-6 w-6 shrink-0 text-[#edcc36]" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block font-semibold text-white">Archivo CSV de la balanza</span>
          <span className="block text-xs text-zinc-400">Tiene que tener el DNI del socio (o el ID cargado con el DNI), la fecha y el peso o el % de grasa.</span>
        </span>
        <input type="file" name="file" accept=".csv,text/csv,text/plain" required className="ml-auto max-w-[45%] text-xs" />
      </label>
      <Notice state={state} />
      {r && (
        <div className="space-y-1 rounded-xl border border-[#444] p-3 text-sm text-zinc-300">
          <p>
            Importadas: <strong className="text-white">{r.imported}</strong> · ya estaban: {r.duplicates} · con datos inválidos: {r.invalid + r.skipped}
          </p>
          {r.unmatched.length > 0 && (
            <p className="text-amber-200">
              Sin socio con ese DNI ({r.unmatched.length}): {r.unmatched.join(', ')}. Revisá que el DNI esté cargado en la ficha (si dos fichas tienen el
              mismo DNI tampoco se asigna).
            </p>
          )}
          {r.columns.length > 0 && <p className="text-xs text-zinc-500">Columnas que usamos: {r.columns.join(' · ')}</p>}
        </div>
      )}
      <SubmitButton>Importar</SubmitButton>
    </form>
  )
}

/** Botón para borrar una evaluación cargada por error */
export function DeleteAssessmentButton({ action }: { action: () => Promise<ActionState> }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm('¿Borrar esta evaluación? No se puede deshacer.')) return
          start(async () => {
            const r = await action()
            if (!r.ok) setMsg(r.message ?? 'No se pudo borrar.')
          })
        }}
        className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-xs text-zinc-400 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36] disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Borrar
      </button>
      {msg && <span className="text-xs text-red-300">{msg}</span>}
    </span>
  )
}
