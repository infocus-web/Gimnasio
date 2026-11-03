'use client'

import { useState } from 'react'
import type { ActionState } from '@/features/admin/errors'
import { Field, inputClass, Notice, SubmitButton, useActionForm } from '@/features/admin/ui'
import { METRICS, type ChallengeMetric } from './retention'

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>

/** Ideas para arrancar rápido (el dueño las puede cambiar) */
const PRESETS: { label: string; metric: ChallengeMetric; goal: number; title: string; description: string; reward: number }[] = [
  { label: '12 días en el mes', metric: 'visits', goal: 12, title: 'Reto 12 días', description: 'Entrená 12 días este mes y ganá días de plan.', reward: 3 },
  { label: 'Club 10.000 kg', metric: 'volume_kg', goal: 10000, title: 'Club 10.000 kg', description: 'Sumá 10.000 kg levantados registrando tus series en la app.', reward: 3 },
  { label: '8 clases', metric: 'classes', goal: 8, title: 'Reto 8 clases', description: 'Vení a 8 clases este mes.', reward: 2 },
  { label: '10 entrenos en la app', metric: 'workouts', goal: 10, title: 'Reto 10 entrenos', description: 'Registrá 10 entrenamientos en la app.', reward: 2 },
]

export function ChallengeForm({ action, monthStart, monthEnd }: { action: Action; monthStart: string; monthEnd: string }) {
  const [state, formAction] = useActionForm(action, {})
  const err = state.fieldErrors ?? {}
  const [v, setV] = useState({ title: '', description: '', metric: 'visits' as ChallengeMetric, goal: '', reward: '3' })

  return (
    <form action={formAction} className="space-y-3" noValidate>
      <div className="flex flex-wrap gap-2">
        <span className="self-center text-xs text-zinc-400">Ideas:</span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setV({ title: p.title, description: p.description, metric: p.metric, goal: String(p.goal), reward: String(p.reward) })}
            className="min-h-[36px] rounded-full border border-zinc-700 px-3 text-xs font-semibold text-zinc-200 hover:border-[#edcc36]/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre del reto" name="title" error={err.title}>
          <input name="title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} maxLength={80} className={inputClass} />
        </Field>
        <Field label="Qué se mide" name="metric" error={err.metric} hint={METRICS[v.metric].help}>
          <select name="metric" value={v.metric} onChange={(e) => setV({ ...v, metric: e.target.value as ChallengeMetric })} className={inputClass}>
            {(Object.keys(METRICS) as ChallengeMetric[]).map((k) => (
              <option key={k} value={k}>
                {METRICS[k].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Meta (${METRICS[v.metric].unit})`} name="goal" error={err.goal}>
          <input name="goal" inputMode="decimal" value={v.goal} onChange={(e) => setV({ ...v, goal: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Premio: días de plan gratis" name="reward_days" error={err.reward_days} hint="0 = sin premio. Se suma al vencimiento al cerrar el reto.">
          <input name="reward_days" inputMode="numeric" value={v.reward} onChange={(e) => setV({ ...v, reward: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Empieza" name="starts_on" error={err.starts_on}>
          <input type="date" name="starts_on" defaultValue={monthStart} className={inputClass} />
        </Field>
        <Field label="Termina" name="ends_on" error={err.ends_on}>
          <input type="date" name="ends_on" defaultValue={monthEnd} className={inputClass} />
        </Field>
      </div>
      <Field label="Descripción (la ven los socios)" name="description" error={err.description}>
        <textarea
          name="description"
          rows={2}
          maxLength={500}
          value={v.description}
          onChange={(e) => setV({ ...v, description: e.target.value })}
          className={`${inputClass} py-2`}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" name="show_ranking" value="1" defaultChecked className="h-4 w-4 accent-[#edcc36]" />
        Mostrar ranking (nombre y la inicial del apellido de los anotados)
      </label>
      <Notice state={state} />
      <SubmitButton>Crear reto</SubmitButton>
    </form>
  )
}
