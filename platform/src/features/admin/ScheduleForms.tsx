'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarPlus, Loader2, Search, Trash2, UserPlus, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ActionState } from './errors'
import { Field, inputClass, Notice, SubmitButton, useActionForm } from './ui'
import { InfoTip } from '@/components/InfoTip'
import { EQUIPMENT_KINDS, isKnownEquipmentKind } from './equipment'

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>
type BareAction = (prev: ActionState) => Promise<ActionState>

import { WEEKDAYS } from './format'
export { WEEKDAYS }

export function GenerateButton({ action }: { action: BareAction }) {
  const [state, formAction] = useActionForm(action, {})
  return (
    <form action={formAction} className="space-y-2">
      <div className="flex items-center gap-1.5">
        <SubmitButton variant="ghost">
          <CalendarPlus className="h-4 w-4" aria-hidden="true" /> Generar próximas 4 semanas
        </SubmitButton>
        <InfoTip label="Generar próximas 4 semanas">
          <p>Crea en la agenda las clases de las próximas 4 semanas a partir de los <strong>horarios fijos</strong> de la grilla, para que los socios puedan reservarlas.</p>
          <p>El sistema ya lo hace solo todas las mañanas; el botón sirve para ver al instante un horario que acabás de agregar. No duplica clases que ya existen.</p>
        </InfoTip>
      </div>
      <Notice state={state} />
    </form>
  )
}

export function CancelSessionForm({ action }: { action: Action }) {
  const [state, formAction] = useActionForm(action, {})
  if (state.ok) return <Notice state={state} />
  return (
    <details className="rounded-xl border border-red-500/20 p-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-red-300">
        <XCircle className="h-4 w-4" aria-hidden="true" /> Cancelar esta clase
        <InfoTip label="Cancelar esta clase">
          <p>Cancela <strong>solo esta clase</strong> (este día y hora). El horario fijo sigue igual las demás semanas.</p>
          <p>Se liberan todas las reservas y la lista de espera, se devuelven las clases a quienes tienen pack y se les avisa con el motivo que escribas.</p>
        </InfoTip>
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
  const [state, formAction] = useActionForm(action, {})
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ id: string; name: string; plan: string | null; number: number | null }[]>([])
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null)
  const [nonce, setNonce] = useState(() => crypto.randomUUID())
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  // Reserva hecha: limpiar para anotar al siguiente
  useEffect(() => {
    if (!state.ok) return
    setPicked(null)
    setQ('')
    setResults([])
    setSearched(false)
    setNonce(crypto.randomUUID())
  }, [state])

  const search = async () => {
    const term = q.replace(/[,()*%\\:]/g, ' ').trim()
    if (term.length < 2) return
    const digits = term.replace(/[.\s-]/g, '')
    setSearching(true)
    setSearchError(null)
    let query = supabase
      .from('member_directory')
      .select('id, first_name, last_name, plan_name, member_number')
      .eq('org_id', orgId)
      .neq('status', 'archived')
    if (/^\d{4,6}$/.test(digits)) query = query.eq('member_number', Number(digits))
    else if (/^\d{7,}$/.test(digits)) query = query.ilike('document_id', `%${digits}%`)
    else query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,document_id.ilike.%${term}%`)
    const { data, error } = await query.limit(8)
    setSearching(false)
    setSearched(true)
    if (error) {
      setResults([])
      setSearchError('No se pudo buscar. Probá de nuevo.')
      return
    }
    setResults(
      (data ?? []).map((m) => ({ id: m.id!, name: `${m.first_name} ${m.last_name}`, plan: m.plan_name, number: m.member_number ?? null })),
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Buscar socio</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setSearched(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void search()
              }
            }}
            placeholder="Nombre, DNI o N° de socio"
            className={`${inputClass} pl-9`}
          />
        </label>
        <button
          type="button"
          onClick={search}
          disabled={searching}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-700 px-3 text-sm text-zinc-200 disabled:opacity-60"
        >
          {searching && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Buscar
        </button>
      </div>
      {searchError && (
        <p role="alert" className="text-sm text-red-300">
          {searchError}
        </p>
      )}
      {searched && !searchError && results.length === 0 && !picked && (
        <p role="status" className="rounded-xl border border-zinc-800 px-3 py-2.5 text-sm text-zinc-400">
          Sin resultados para «{q.trim()}».
        </p>
      )}
      {results.length > 0 && !picked && (
        <ul className="divide-y divide-zinc-900 rounded-xl border border-zinc-800">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setPicked(r)} className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 text-left text-sm hover:bg-zinc-900">
                <span className="text-white">
                  {r.name}
                  {r.number != null && <span className="ml-2 text-xs text-zinc-500">#{r.number}</span>}
                </span>
                <span className="text-xs text-zinc-500">{r.plan ?? 'sin plan'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {picked && (
        <form action={formAction} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#edcc36]/30 p-3">
          <input type="hidden" name="memberId" value={picked.id} />
          <input type="hidden" name="nonce" value={nonce} />
          <span className="flex-1 text-sm text-white">{picked.name}</span>
          <button type="button" onClick={() => setPicked(null)} className="min-h-[44px] px-2 text-xs text-zinc-400 hover:text-white">
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
  const [state, formAction] = useActionForm(action, {})
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
  const [state, formAction] = useActionForm(action, {})
  const [endState, endFormAction] = useActionForm(endAction, {})
  const [sure, setSure] = useState(false)
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
      {sure ? (
        <form action={endFormAction} className="flex flex-wrap items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-2">
          <span className="text-xs text-zinc-300">
            <strong className="text-white">¿Seguro?</strong> Se borran las clases futuras de este horario.
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
      {!sure && (
        <span className="ml-1.5 inline-flex min-h-[36px] items-center align-middle">
          <InfoTip label="Dar de baja este horario">
            <p>Saca este horario de la grilla: <strong>deja de repetirse todas las semanas</strong> y se borran sus clases futuras.</p>
            <p>Las clases que ya tienen gente anotada no se borran: cancelalas una por una desde la agenda si hace falta. Para suspender un solo día, usá «Cancelar esta clase».</p>
          </InfoTip>
        </span>
      )}
      <Notice state={state.message ? state : endState} />
    </div>
  )
}

export function RoomForm({ action, values }: { action: Action; values?: { name: string; capacity: number; active: boolean } }) {
  const [state, formAction] = useActionForm(action, {})
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

const OTHER = '__other'

/** Tipo de equipo: se guarda en inglés (bike, rower…) pero se elige en castellano */
function EquipmentKindField({
  label,
  name,
  defaultValue,
  allowNone,
  error,
  hint,
}: {
  label: string
  name: string
  defaultValue: string
  allowNone?: boolean
  error?: string
  hint?: string
}) {
  const known = !defaultValue || isKnownEquipmentKind(defaultValue)
  const [choice, setChoice] = useState(known ? defaultValue.toLowerCase() : OTHER)
  const [other, setOther] = useState(known ? '' : defaultValue)
  return (
    <div className="space-y-2">
      <Field label={label} name={name} error={error} hint={hint}>
        <select id={name} name={choice === OTHER ? undefined : name} value={choice} onChange={(e) => setChoice(e.target.value)} className={inputClass}>
          {allowNone && <option value="">No usa equipo</option>}
          {EQUIPMENT_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
          <option value={OTHER}>Otro…</option>
        </select>
      </Field>
      {choice === OTHER && (
        <input
          name={name}
          value={other}
          onChange={(e) => setOther(e.target.value)}
          placeholder="Ej. trx"
          aria-label={`${label}: otro tipo`}
          className={inputClass}
        />
      )}
    </div>
  )
}

export function EquipmentForm({ action }: { action: Action }) {
  const [state, formAction] = useActionForm(action, {})
  const err = state.fieldErrors ?? {}
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2" noValidate>
      <div className="w-40">
        <EquipmentKindField label="Tipo" name="kind" defaultValue="bike" error={err.kind} />
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
  const [state, formAction] = useActionForm(action, {})
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
          <EquipmentKindField
            label="Usa equipo asignado"
            name="equipmentKind"
            defaultValue={values?.equipmentKind ?? ''}
            allowNone
            hint="Ej. Bici para spinning: cada socio elige su bici."
          />
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
