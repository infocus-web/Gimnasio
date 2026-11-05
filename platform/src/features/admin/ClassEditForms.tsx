'use client'

import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { ActionState } from './errors'
import { Field, inputClass, Notice, SubmitButton, useActionForm } from './ui'
import { WEEKDAYS } from './format'
import { InfoTip } from '@/components/InfoTip'

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>
type BareAction = (prev: ActionState) => Promise<ActionState>

interface Opt {
  id: string
  name: string
}

/** Cambiar día/hora, duración, cupo o sala de UNA clase (las otras semanas no cambian). */
export function EditSessionForm({
  action,
  date,
  time,
  durationMin,
  capacity,
  roomId,
  rooms,
  booked,
  minDate,
}: {
  action: Action
  /** YYYY-MM-DD y HH:MM en la zona del gimnasio */
  date: string
  time: string
  durationMin: number
  capacity: number
  roomId: string
  rooms: (Opt & { capacity: number })[]
  /** Anotados (el cupo no puede ser menor) */
  booked: number
  minDate: string
}) {
  const [state, formAction] = useActionForm(action, {})
  const err = state.fieldErrors ?? {}
  return (
    <details className="group rounded-xl border border-zinc-800 p-3 open:border-[#edcc36]/40">
      <summary className="flex min-h-[40px] cursor-pointer list-none items-center gap-2 text-sm font-semibold text-[#edcc36]">
        <Pencil className="h-4 w-4" aria-hidden="true" /> Cambiar horario, cupo o sala de esta clase
        <InfoTip label="Cambiar esta clase">
          <p>Cambia <strong>solo esta clase</strong> (este día). El horario fijo de las otras semanas sigue igual: para cambiarlo, andá a «Mis horarios».</p>
          <p>Si la movés de día u hora, los anotados conservan su lugar y les llega un email avisando el cambio. Si subís el cupo, entra la lista de espera.</p>
        </InfoTip>
      </summary>
      <form action={formAction} className="mt-3 space-y-3" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Día" name="date" error={err.date}>
            <input name="date" type="date" defaultValue={date} min={minDate} className={inputClass} />
          </Field>
          <Field label="Hora" name="time" error={err.time}>
            <input name="time" type="time" defaultValue={time} className={inputClass} />
          </Field>
          <Field label="Duración (min)" name="durationMin" error={err.durationMin}>
            <input name="durationMin" type="number" min={5} max={480} defaultValue={durationMin} className={inputClass} />
          </Field>
          <Field label="Cupo" name="capacity" error={err.capacity} hint={booked ? `Hay ${booked} anotados: no puede ser menor` : undefined}>
            <input name="capacity" type="number" min={Math.max(1, booked)} max={500} defaultValue={capacity} className={inputClass} />
          </Field>
          <Field label="Sala" name="roomId" error={err.roomId}>
            <select name="roomId" defaultValue={roomId} className={inputClass}>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.capacity})
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="flex min-h-[44px] items-center gap-2 text-sm text-zinc-300">
          <input type="hidden" name="notify" value="off" />
          <input type="checkbox" name="notify" value="on" defaultChecked className="h-5 w-5 accent-[#edcc36]" />
          Si cambia el día u hora, avisar por email a los anotados
        </label>
        <Notice state={state} />
        <SubmitButton>Guardar cambios</SubmitButton>
      </form>
    </details>
  )
}

/** Editar un horario fijo de la grilla: día, hora, duración, sala, cupo (y profe si es administración) + dar de baja. */
export function EditSeriesForm({
  action,
  endAction,
  weekday,
  startTime,
  durationMin,
  capacity,
  roomId,
  rooms,
  instructorId,
  instructors,
}: {
  action: Action
  endAction: BareAction
  weekday: number
  startTime: string
  durationMin: number
  capacity: number
  roomId: string
  rooms: (Opt & { capacity: number })[]
  instructorId?: string
  /** Solo administración: lista de profes para reasignar */
  instructors?: Opt[]
}) {
  const [state, formAction] = useActionForm(action, {})
  const [endState, endFormAction] = useActionForm(endAction, {})
  const [sure, setSure] = useState(false)
  const err = state.fieldErrors ?? {}
  if (endState.ok) return <Notice state={endState} />
  return (
    <div className="space-y-2">
      <details className="rounded-xl border border-zinc-800 p-3 open:border-[#edcc36]/40">
        <summary className="flex min-h-[40px] cursor-pointer list-none items-center gap-2 text-sm font-semibold text-zinc-200 hover:text-white">
          <Pencil className="h-4 w-4 text-[#edcc36]" aria-hidden="true" /> Cambiar día, hora, sala o cupo
        </summary>
        <form action={formAction} className="mt-3 space-y-3" noValidate>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Día" name="weekday" error={err.weekday}>
              <select name="weekday" defaultValue={String(weekday)} className={inputClass}>
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i + 1}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Hora" name="startTime" error={err.startTime}>
              <input name="startTime" type="time" defaultValue={startTime} className={inputClass} />
            </Field>
            <Field label="Duración (min)" name="durationMin" error={err.durationMin}>
              <input name="durationMin" type="number" min={5} max={480} defaultValue={durationMin} className={inputClass} />
            </Field>
            <Field label="Sala" name="roomId" error={err.roomId}>
              <select name="roomId" defaultValue={roomId} className={inputClass}>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.capacity})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cupo" name="capacity" error={err.capacity}>
              <input name="capacity" type="number" min={1} max={500} defaultValue={capacity} className={inputClass} />
            </Field>
            {instructors && (
              <Field label="Profesor" name="instructorId">
                <select name="instructorId" defaultValue={instructorId} className={inputClass}>
                  {instructors.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <label className="flex items-start gap-2 text-sm text-zinc-300">
            <input type="hidden" name="moveBooked" value="off" />
            <input type="checkbox" name="moveBooked" value="on" defaultChecked className="mt-0.5 h-5 w-5 accent-[#edcc36]" />
            <span>
              Mover también las clases que ya tienen anotados (a la misma semana, con el día y hora nuevos) y avisarles por email.
              <span className="block text-xs text-zinc-500">Si lo destildás, esas clases quedan en el horario de antes.</span>
            </span>
          </label>
          <Notice state={state} />
          <SubmitButton>Guardar horario</SubmitButton>
        </form>
      </details>
      {sure ? (
        <form action={endFormAction} className="flex flex-wrap items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-2">
          <span className="text-xs text-zinc-300">
            <strong className="text-white">¿Seguro?</strong> Deja de repetirse y se borran sus clases futuras sin anotados.
          </span>
          <SubmitButton variant="ghost">
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Sí, dar de baja
          </SubmitButton>
          <button type="button" onClick={() => setSure(false)} className="min-h-[44px] px-3 text-sm text-zinc-400 hover:text-white">
            Cancelar
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setSure(true)} className="inline-flex min-h-[36px] items-center gap-1 text-xs text-zinc-500 hover:text-red-300">
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Dar de baja este horario
        </button>
      )}
      <Notice state={endState.message ? endState : undefined} />
    </div>
  )
}
