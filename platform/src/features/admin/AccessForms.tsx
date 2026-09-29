'use client'

import { useState } from 'react'
import { RefreshCw, ListChecks, ShieldCheck, Pause, Play, Trash2, Link2, UserX, ScanFace, Copy, Check } from 'lucide-react'
import type { ActionState } from './errors'
import { Field, Notice, SubmitButton, inputClass, useActionForm } from './ui'

type Bare = (prev: ActionState) => Promise<ActionState>
type WithForm = (prev: ActionState, form: FormData) => Promise<ActionState>

export function CopyValue({ value }: { value: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        })
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-black px-2 py-1 font-mono text-sm text-white hover:border-[#edcc36]/60"
    >
      {value}
      {done ? <Check className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />}
      <span className="sr-only">Copiar</span>
    </button>
  )
}

export function RegisterDeviceForm({ action, detected }: { action: WithForm; detected: string[] }) {
  const [state, submit] = useActionForm(action)
  const [serial, setSerial] = useState('')
  return (
    <form action={submit} className="space-y-3">
      {detected.length > 0 && (
        <div className="rounded-xl border border-[#edcc36]/30 bg-[#edcc36]/10 p-3 text-sm text-[#f5e38a]">
          <p className="mb-2">Detectamos un lector conectándose desde tu misma red. Tocalo para usarlo:</p>
          <div className="flex flex-wrap gap-2">
            {detected.map((sn) => (
              <button
                key={sn}
                type="button"
                onClick={() => setSerial(sn)}
                className="rounded-lg border border-[#edcc36]/50 px-2 py-1 font-mono text-xs text-white hover:bg-[#edcc36]/20"
              >
                {sn}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Número de serie (S/N)" name="serial" error={state.fieldErrors?.serial} hint="Menú del lector → Info del sistema → Info del dispositivo">
          <input
            id="serial"
            name="serial"
            value={serial}
            onChange={(e) => setSerial(e.target.value.toUpperCase())}
            autoComplete="off"
            placeholder="Ej. CKJQ204560123"
            className={`${inputClass} font-mono`}
          />
        </Field>
        <Field label="Nombre" name="name" hint="Para reconocerlo: Molinete, Puerta sala, etc.">
          <input id="name" name="name" placeholder="Molinete entrada" className={inputClass} />
        </Field>
      </div>
      <SubmitButton>Registrar lector</SubmitButton>
      <Notice state={state} />
    </form>
  )
}

export function DeviceButtons({
  active,
  pendingIp,
  actions,
}: {
  active: boolean
  pendingIp: string | null
  actions: { resync: Bare; query: Bare; confirmIp: Bare; toggle: Bare; remove: Bare }
}) {
  const [s1, resync] = useActionForm(actions.resync)
  const [s2, query] = useActionForm(actions.query)
  const [s3, confirmIp] = useActionForm(actions.confirmIp)
  const [s4, toggle] = useActionForm(actions.toggle)
  const [s5, remove] = useActionForm(actions.remove)
  const [sure, setSure] = useState(false)
  const shown = [s5, s4, s3, s2, s1].find((s) => s.message) ?? {}
  return (
    <div className="space-y-2">
      {pendingIp && (
        <form action={confirmIp} className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          <span className="flex-1">
            El lector se está conectando desde otra dirección de internet (<span className="font-mono">{pendingIp}</span>) y lo frenamos por seguridad.
            Si cambiaste de proveedor de internet o se reinició el módem, confirmalo.
          </span>
          <SubmitButton>
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Es mi internet, confirmar
          </SubmitButton>
        </form>
      )}
      <div className="flex flex-wrap gap-2">
        <form action={resync}>
          <SubmitButton variant="ghost">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Reenviar todo
          </SubmitButton>
        </form>
        <form action={query}>
          <SubmitButton variant="ghost">
            <ListChecks className="h-4 w-4" aria-hidden="true" /> Leer usuarios del lector
          </SubmitButton>
        </form>
        <form action={toggle}>
          <SubmitButton variant="ghost">
            {active ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
            {active ? 'Pausar' : 'Activar'}
          </SubmitButton>
        </form>
        {sure ? (
          <form action={remove} className="flex gap-2">
            <SubmitButton variant="ghost">
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Sí, eliminar
            </SubmitButton>
            <button type="button" onClick={() => setSure(false)} className="min-h-[44px] px-3 text-sm text-zinc-400">
              Cancelar
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setSure(true)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-red-500/30 px-4 text-sm font-semibold text-red-300 hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Eliminar
          </button>
        )}
      </div>
      <Notice state={shown} />
    </div>
  )
}

export function UnlinkedUserRow({ pin, name, link, forget }: { pin: number; name: string; link: WithForm; forget: Bare }) {
  const [ls, doLink] = useActionForm(link)
  const [fs, doForget] = useActionForm(forget)
  const shown = fs.message ? fs : ls
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-white">
          {name || 'Sin nombre'} <span className="font-mono text-xs text-zinc-500">· N° {pin}</span>
        </p>
        <form action={doForget}>
          <SubmitButton variant="ghost">
            <UserX className="h-4 w-4" aria-hidden="true" /> Borrar del lector
          </SubmitButton>
        </form>
      </div>
      <form action={doLink} className="flex flex-wrap items-start gap-2">
        <label className="sr-only" htmlFor={`dni-${pin}`}>DNI del socio</label>
        <input id={`dni-${pin}`} name="dni" inputMode="numeric" placeholder="DNI del socio" className={`${inputClass} w-44`} />
        <SubmitButton variant="ghost">
          <Link2 className="h-4 w-4" aria-hidden="true" /> Vincular a socio
        </SubmitButton>
        {ls.fieldErrors?.dni && <span className="w-full text-xs text-red-300">{ls.fieldErrors.dni}</span>}
      </form>
      <Notice state={shown} />
    </li>
  )
}

export function EnrollForm({ action, devices }: { action: WithForm; devices: { id: string; name: string }[] }) {
  const [state, submit] = useActionForm(action)
  return (
    <form action={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {devices.length > 1 ? (
          <Field label="Lector" name="deviceId" error={state.fieldErrors?.deviceId}>
            <select id="deviceId" name="deviceId" className={inputClass} defaultValue={devices[0]?.id}>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <input type="hidden" name="deviceId" value={devices[0]?.id ?? ''} />
        )}
        <Field label="Qué registrar" name="bioType">
          <select id="bioType" name="bioType" className={inputClass} defaultValue="9">
            <option value="9">Cara</option>
            <option value="8">Palma</option>
            <option value="1">Huella</option>
          </select>
        </Field>
      </div>
      <label className="flex items-start gap-2 text-sm text-zinc-300">
        <input type="checkbox" name="consent" className="mt-1 h-4 w-4 accent-[#edcc36]" />
        <span>
          El socio aceptó que se registre su cara/palma/huella solo para entrar al gimnasio (se guarda como código, no como foto, y se borra si se da de baja).
        </span>
      </label>
      {state.fieldErrors?.consent && <p className="text-xs text-red-300">{state.fieldErrors.consent}</p>}
      <SubmitButton>
        <ScanFace className="h-4 w-4" aria-hidden="true" /> Registrar en el lector
      </SubmitButton>
      <Notice state={state} />
    </form>
  )
}
