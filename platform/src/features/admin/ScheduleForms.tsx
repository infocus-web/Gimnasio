'use client'

import { useActionState, useMemo, useState } from 'react'
import { CalendarPlus, Search, Trash2, UserPlus, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ActionState } from './errors'
import { Field, inputClass, Notice, SubmitButton } from './ui'

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>
type BareAction = (prev: ActionState) => Promise<ActionState>

export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export function GenerateButton({ action }: { action: BareAction }) {
  const [state, formAction] = useActionState(action, {})
  return (
    <form action={formAction} className="space-y-2">
      <SubmitButton variant="ghost">
        <CalendarPlus className="h-4 w-4" aria-hidden="true" /> Generar próximas 4 semanas
      </SubmitButton>
      <Notice state={state} />
    </form>
  )
}

export function CancelSessionForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, {})
  if (state.ok) return <Notice state={state} />
  return (
    <details className="rounded-xl border border-red-500/20 p-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-red-300">
        <XCircle className="h-4 w-4" aria-hidden="true" /> Cancelar esta clase
      </summary>
      <form action={formAction} className="mt-3 space-y-3">
        <Field label="Motivo (lo ven los inscriptos)" name="reason">
          <input id="reason" name="reason" placeholder="Ej. el profe está enfermo" className={inputClass} />
        </Field>
        <p className="text-xs text-zinc-500">Se liberan todas las reservas y se devuelven las clases de los packs.</p>
        <Notice state={state} />
        <SubmitButton variant="ghost">Confirmar cancelación</SubmitButton>
      </form>
    </details>
  )
}

/** Buscador de socios + reservar en su nombre (recepción) */
export function BookForMemberForm({ action, orgId }: { action: Action; orgId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [state, formAction] = useActionState(action, {})
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ id: string; name: string; plan: string | null }[]>([])
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null)

  const search = async () => {
    const term = q.replace(/[,()*%\\:]/g, ' ').trim()
    if (term.length < 2) return
    const { data } = await supabase
      .from('member_directory')
      .select('id, first_name, last_name, plan_name')
      .eq('org_id', orgId)
      .neq('status', 'archived')
      .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,document_id.ilike.%${term}%`)
      .limit(8)
    setResults((data ?? []).map((m) => ({ id: m.id!, name: `${m.first_name} ${m.last_name}`, plan: m.plan_name })))
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Buscar socio</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void search()
              }
            }}
            placeholder="Nombre o DNI"
            className={`${inputClass} pl-9`}
          />
        </label>
        <button type="button" onClick={search} className="min-h-[44px] rounded-xl border border-zinc-700 px-3 text-sm text-zinc-200">
          Buscar
        </button>
      </div>
      {results.length > 0 && !picked && (
        <ul className="divide-y divide-zinc-900 rounded-xl border border-zinc-800">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setPicked(r)} className="flex min-h-[44px] w-full items-center justify-between px-3 text-left text-sm hover:bg-zinc-900">
                <span className="text-white">{r.name}</span>
                <span className="text-xs text-zinc-500">{r.plan ?? 'sin plan'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {picked && (
        <form action={formAction} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#edcc36]/30 p-3">
          <input type="hidden" name="memberId" value={picked.id} />
          <span className="flex-1 text-sm text-white">{picked.name}</span>
          <button type="button" onClick={() => setPicked(null)} className="text-xs text-zinc-400 hover:text-white">
            Cambiar
          </button>
          <SubmitButton>
            <UserPlus className="h-4 w-4" aria-hidden="true" /> Anotar
          </SubmitButton>
        </form>
      )}
      <Notice state={state} />
    </div>
  )
}

interface Opt {
  id: string
  name: string
}

export function SeriesForm({
  action,
  classTypes,
  rooms,
  instructors,
}: {
  action: Action
  classTypes: (Opt & { duration: number; capacity: number })[]
  rooms: (Opt & { capacity: number })[]
  instructors: Opt[]
}) {
  const [state, formAction] = useActionState(action, {})
  const [typeId, setTypeId] = useState(classTypes[0]?.id ?? '')
  const t = classTypes.find((x) => x.id === typeId)
  const err = state.fieldErrors ?? {}
  return (
    <form action={formAction} className="space-y-4" noValidate key={state.ok ? 'reset' : 'form'}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Actividad" name="classTypeId" error={err.classTypeId}>
          <select id="classTypeId" name="classTypeId" value={typeId} onChange={(e) => setTypeId(e.target.value)} className={inputClass}>
            {classTypes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Día" name="weekday">
          <select id="weekday" name="weekday" defaultValue="1" className={inputClass}>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i + 1}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Hora" name="startTime" error={err.startTime}>
          <input id="startTime" name="startTime" type="time" defaultValue="18:00" className={inputClass} />
        </Field>
        <Field label="Duración (min)" name="durationMin" error={err.durationMin}>
          <input id="durationMin" name="durationMin" type="number" min={5} key={`d-${typeId}`} defaultValue={t?.duration ?? 60} className={inputClass} />
        </Field>
        <Field label="Sala" name="roomId" error={err.roomId}>
          <select id="roomId" name="roomId" className={inputClass}>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.capacity})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Profesor" name="instructorId" error={err.instructorId}>
          <select id="instructorId" name="instructorId" className={inputClass}>
            {instructors.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cupo" name="capacity" error={err.capacity}>
          <input id="capacity" name="capacity" type="number" min={1} key={`c-${typeId}`} defaultValue={t?.capacity ?? 20} className={inputClass} />
        </Field>
        <Field label="Desde" name="validFrom">
          <input id="validFrom" name="validFrom" type="date" className={inputClass} />
        </Field>
      </div>
      <Notice state={state} />
      <div className="flex justify-end">
        <SubmitButton>Agregar horario</SubmitButton>
      </div>
    </form>
  )
}

export function SeriesRowForm({
  action,
  endAction,
  roomId,
  instructorId,
  capacity,
  rooms,
  instructors,
}: {
  action: Action
  endAction: BareAction
  roomId: string
  instructorId: string
  capacity: number
  rooms: Opt[]
  instructors: Opt[]
}) {
  const [state, formAction] = useActionState(action, {})
  const [endState, endFormAction] = useActionState(endAction, {})
  if (endState.ok) return <Notice state={endState} />
  return (
    <div className="space-y-2">
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <label className="sr-only" htmlFor="instructorId">Profesor</label>
        <select name="instructorId" defaultValue={instructorId} className={`${inputClass} w-auto min-w-[140px]`} aria-label="Profesor">
          {instructors.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select name="roomId" defaultValue={roomId} className={`${inputClass} w-auto min-w-[120px]`} aria-label="Sala">
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <input name="capacity" type="number" min={1} defaultValue={capacity} aria-label="Cupo" className={`${inputClass} w-20`} />
        <SubmitButton variant="ghost">Guardar</SubmitButton>
      </form>
      <form action={endFormAction}>
        <button type="submit" className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-red-300">
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Dar de baja este horario
        </button>
      </form>
      <Notice state={state.message ? state : endState} />
    </div>
  )
}

export function RoomForm({ action, values }: { action: Action; values?: { name: string; capacity: number; active: boolean } }) {
  const [state, formAction] = useActionState(action, {})
  const err = state.fieldErrors ?? {}
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2" noValidate>
      <div className="min-w-[160px] flex-1">
        <Field label="Sala" name="name" error={err.name}>
          <input id="name" name="name" defaultValue={values?.name ?? ''} placeholder="Ej. Salón 1" className={inputClass} />
        </Field>
      </div>
      <div className="w-28">
        <Field label="Capacidad" name="capacity" error={err.capacity}>
          <input id="capacity" name="capacity" type="number" min={1} defaultValue={values?.capacity ?? 20} className={inputClass} />
        </Field>
      </div>
      {values && (
        <label className="flex min-h-[44px] items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" name="active" defaultChecked={values.active} className="h-4 w-4 accent-[#edcc36]" /> Activa
        </label>
      )}
      <SubmitButton variant={values ? 'ghost' : 'primary'}>{values ? 'Guardar' : 'Crear sala'}</SubmitButton>
      <div className="w-full">
        <Notice state={state} />
      </div>
    </form>
  )
}

export function EquipmentForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, {})
  const err = state.fieldErrors ?? {}
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2" noValidate>
      <div className="w-32">
        <Field label="Tipo" name="kind" error={err.kind}>
          <input id="kind" name="kind" defaultValue="bike" list="equipment-kinds" className={inputClass} />
        </Field>
        <datalist id="equipment-kinds">
          <option value="bike" />
          <option value="rower" />
          <option value="reformer" />
          <option value="treadmill" />
        </datalist>
      </div>
      <div className="w-24">
        <Field label="Cantidad" name="count" error={err.count}>
          <input id="count" name="count" type="number" min={1} max={100} defaultValue={10} className={inputClass} />
        </Field>
      </div>
      <div className="w-24">
        <Field label="Desde el #" name="startAt">
          <input id="startAt" name="startAt" type="number" min={1} defaultValue={1} className={inputClass} />
        </Field>
      </div>
      <SubmitButton variant="ghost">Agregar equipos</SubmitButton>
      <div className="w-full">
        <Notice state={state} />
      </div>
    </form>
  )
}

export function ClassTypeForm({
  action,
  values,
}: {
  action: Action
  values?: { name: string; description: string | null; color: string; duration: number; capacity: number; equipmentKind: string | null; active: boolean }
}) {
  const [state, formAction] = useActionState(action, {})
  const err = state.fieldErrors ?? {}
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Field label="Nombre" name="name" error={err.name}>
            <input id="name" name="name" defaultValue={values?.name ?? ''} placeholder="Ej. Spinning" className={inputClass} />
          </Field>
        </div>
        <Field label="Duración (min)" name="durationMin" error={err.durationMin}>
          <input id="durationMin" name="durationMin" type="number" min={5} defaultValue={values?.duration ?? 60} className={inputClass} />
        </Field>
        <Field label="Cupo habitual" name="capacity" error={err.capacity}>
          <input id="capacity" name="capacity" type="number" min={1} defaultValue={values?.capacity ?? 20} className={inputClass} />
        </Field>
        <Field label="Color" name="color">
          <input id="color" name="color" type="color" defaultValue={values?.color ?? '#edcc36'} className={`${inputClass} p-1`} />
        </Field>
        <div className="lg:col-span-3">
          <Field label="Descripción (se ve en la web)" name="description">
            <input id="description" name="description" defaultValue={values?.description ?? ''} className={inputClass} />
          </Field>
        </div>
        <div className="lg:col-span-2">
          <Field label="Usa equipo asignado" name="equipmentKind" hint="Ej. bike para spinning: cada socio elige su bici. Vacío = no.">
            <input id="equipmentKind" name="equipmentKind" defaultValue={values?.equipmentKind ?? ''} list="equipment-kinds-t" className={inputClass} />
          </Field>
          <datalist id="equipment-kinds-t">
            <option value="bike" />
            <option value="rower" />
            <option value="reformer" />
          </datalist>
        </div>
      </div>
      {values && (
        <label className="flex min-h-[40px] items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" name="active" defaultChecked={values.active} className="h-4 w-4 accent-[#edcc36]" /> Activa
        </label>
      )}
      <Notice state={state} />
      <div className="flex justify-end">
        <SubmitButton variant={values ? 'ghost' : 'primary'}>{values ? 'Guardar' : 'Crear actividad'}</SubmitButton>
      </div>
    </form>
  )
}
