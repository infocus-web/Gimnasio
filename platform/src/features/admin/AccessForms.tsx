'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { RefreshCw, ListChecks, ShieldCheck, Pause, Play, Trash2, Link2, UserX, ScanFace, Copy, Check, Monitor, KeyRound, Tablet, DoorOpen, ChevronDown } from 'lucide-react'
import type { ActionState } from './errors'
import { Field, Notice, SubmitButton, inputClass, useActionForm } from './ui'
import { InfoTip } from '@/components/InfoTip'

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
          <InfoTip label="Es mi internet, confirmar">
            <p>Por seguridad, el sistema solo acepta al lector desde la dirección de internet que ya conoce.</p>
            <p>Si cambiaste de proveedor o se reinició el módem, la dirección cambia: confirmá que es tu conexión y el lector vuelve a funcionar.</p>
            <p><strong>Si no hiciste ningún cambio, no lo confirmes</strong> y avisanos.</p>
          </InfoTip>
        </form>
      )}
      <div className="flex flex-wrap gap-2">
        <form action={resync} className="flex items-center gap-1.5">
          <SubmitButton variant="ghost">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Reenviar todo
          </SubmitButton>
          <InfoTip label="Reenviar todo">
            <p>Le vuelve a mandar al lector la lista completa de socios: <strong>carga a los que están al día y saca a los vencidos o morosos</strong>.</p>
            <p>Usalo si el lector se reseteó o se cambió, o si notás que deja pasar a alguien que no debería (o frena a alguien que está al día).</p>
          </InfoTip>
        </form>
        <form action={query} className="flex items-center gap-1.5">
          <SubmitButton variant="ghost">
            <ListChecks className="h-4 w-4" aria-hidden="true" /> Leer usuarios del lector
          </SubmitButton>
          <InfoTip label="Leer usuarios del lector">
            <p>Le pide al lector la lista de personas que tiene guardadas y la trae acá. <strong>No cambia nada en el lector.</strong></p>
            <p>Sirve para encontrar gente cargada a mano en el aparato que no está vinculada a un socio (aparece abajo, en amarillo).</p>
          </InfoTip>
        </form>
        <form action={toggle} className="flex items-center gap-1.5">
          <SubmitButton variant="ghost">
            {active ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
            {active ? 'Pausar' : 'Activar'}
          </SubmitButton>
          <InfoTip label={active ? 'Pausar' : 'Activar'}>
            <p>
              <strong>Pausar</strong> desconecta el lector del sistema sin borrarlo: deja de recibir altas y bajas de socios y sus entradas no se
              registran acá. El aparato sigue funcionando con lo que ya tiene cargado.
            </p>
            <p><strong>Activar</strong> lo vuelve a conectar y lo pone al día solo con los cambios que hubo mientras estuvo pausado.</p>
          </InfoTip>
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
        <span className="flex items-center">
          <InfoTip label="Eliminar">
            <p>Saca el lector del sistema (te pide confirmar). Las entradas que ya registró se conservan.</p>
            <p>
              Ojo: <strong>no borra a las personas guardadas dentro del aparato</strong>. Si lo volvés a registrar, usá «Leer usuarios del lector» y
              después «Reenviar todo».
            </p>
          </InfoTip>
        </span>
      </div>
      <Notice state={shown} />
    </div>
  )
}

export function AgentPanel({
  serial,
  hasToken,
  online,
  seenLabel,
  mode,
  version,
  action,
}: {
  serial: string
  hasToken: boolean
  online: boolean
  seenLabel: string | null
  mode: string | null
  version: string | null
  action: Bare
}) {
  const [state, submit] = useActionForm(action)
  const [sure, setSure] = useState(false)
  return (
    <details open={state.secret ? true : undefined} className="group rounded-xl border border-zinc-800 px-3 [&[open]]:pb-3">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 text-sm font-semibold text-white [&::-webkit-details-marker]:hidden">
        <Monitor className="h-4 w-4 shrink-0 text-[#edcc36]" aria-hidden="true" />
        <span className="flex-1">Intermediario en la PC del gimnasio</span>
        <span className={`text-xs font-normal ${online ? 'text-emerald-300' : 'text-zinc-500'}`}>
          {!hasToken ? 'Sin configurar' : online ? 'Conectado' : 'Sin conexión'}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-2">
      <p className="text-xs text-zinc-400">
        Para lectores que se manejan por la red local (ej. MB360). Un programa en una PC del gimnasio carga y saca socios del lector y sube las
        entradas.
      </p>
      {hasToken && (
        <p className={`text-sm ${online ? 'text-emerald-300' : 'text-zinc-400'}`}>
          {online ? 'Conectado' : seenLabel ? `Sin conexión desde ${seenLabel}` : 'Clave generada, esperando que el programa se conecte'}
          {mode && ` · modo ${mode === 'sincronizar' ? 'sincronizar' : 'solo lectura'}`}
          {version && <span className="text-xs text-zinc-500"> · v{version}</span>}
        </p>
      )}
      {state.secret ? (
        <div className="space-y-2 rounded-lg border border-[#edcc36]/30 bg-[#edcc36]/10 p-3 text-sm text-[#f5e38a]">
          <p>Número de serie y clave para el archivo config.json:</p>
          <div className="flex flex-wrap gap-2">
            <CopyValue value={serial} />
            <CopyValue value={state.secret} />
          </div>
        </div>
      ) : hasToken && !sure ? (
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setSure(true)} className="min-h-[44px] text-sm text-zinc-400 underline">
            Generar una clave nueva
          </button>
          <InfoTip label="Clave del intermediario">
            <p>
              Genera el número de serie y la clave que van en el archivo <strong>config.json</strong> del programa intermediario, instalado en una PC
              del gimnasio.
            </p>
            <p>Ese programa carga y saca socios del lector por la red local y sube las entradas. Hace falta en lectores sin nube completa, como el MB360.</p>
            <p>Si generás una clave nueva, <strong>la anterior deja de funcionar</strong> y hay que actualizar el config.json en la PC.</p>
          </InfoTip>
        </div>
      ) : (
        <form action={submit} className="flex flex-wrap items-center gap-2">
          {hasToken && <span className="text-xs text-amber-200">La clave anterior deja de funcionar.</span>}
          <SubmitButton variant="ghost">
            <KeyRound className="h-4 w-4" aria-hidden="true" /> {hasToken ? 'Sí, generar otra' : 'Generar clave del intermediario'}
          </SubmitButton>
          <InfoTip label="Clave del intermediario">
            <p>
              Genera el número de serie y la clave que van en el archivo <strong>config.json</strong> del programa intermediario, instalado en una PC
              del gimnasio.
            </p>
            <p>Ese programa carga y saca socios del lector por la red local y sube las entradas. Hace falta en lectores sin nube completa, como el MB360.</p>
            <p>Si generás una clave nueva, <strong>la anterior deja de funcionar</strong> y hay que actualizar el config.json en la PC.</p>
          </InfoTip>
        </form>
      )}
      <Notice state={state} />
      </div>
    </details>
  )
}

export function KioskPanel({
  slug,
  paired,
  online,
  seenLabel,
  action,
}: {
  slug: string
  paired: boolean
  online: boolean
  seenLabel: string | null
  action: Bare
}) {
  const [state, submit] = useActionForm(action)
  const [sure, setSure] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  const link = state.secret && typeof window !== 'undefined' ? `${window.location.origin}/${slug}/molinete#k=${state.secret}` : null
  useEffect(() => {
    if (!link) return
    QRCode.toDataURL(link, { margin: 1, width: 240 }).then(setQr).catch(() => setQr(null))
  }, [link])
  return (
    <details open={link ? true : undefined} className="group rounded-xl border border-zinc-800 px-3 [&[open]]:pb-3">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 text-sm font-semibold text-white [&::-webkit-details-marker]:hidden">
        <Tablet className="h-4 w-4 shrink-0 text-[#edcc36]" aria-hidden="true" />
        <span className="flex-1">Tablet del molinete (entrada con QR)</span>
        <span className={`text-xs font-normal ${online ? 'text-emerald-300' : 'text-zinc-500'}`}>
          {!paired ? 'Sin vincular' : online ? 'Funcionando' : 'Sin conexión'}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-2">
      <p className="text-xs text-zinc-400">
        Una tablet o celular junto al molinete lee el QR de la app del socio y el intermediario abre el molinete. Solo pasan socios con plan de
        musculación al día.
      </p>
      {paired && (
        <p className={`text-sm ${online ? 'text-emerald-300' : 'text-zinc-400'}`}>
          {online ? 'Tablet funcionando' : seenLabel ? `Tablet sin conexión desde ${seenLabel}` : 'Vinculada, esperando que se abra en la tablet'}
        </p>
      )}
      {link ? (
        <div className="flex flex-wrap items-start gap-4 rounded-lg border border-[#edcc36]/30 bg-[#edcc36]/10 p-3 text-sm text-[#f5e38a]">
          {qr && <img src={qr} alt="Código para abrir el link en la tablet" width={160} height={160} className="rounded-lg bg-white p-1" />}
          <div className="min-w-0 flex-1 space-y-2">
            <p>Escaneá este código con la cámara de la tablet, o abrí el link en su navegador:</p>
            <p className="break-all font-mono text-xs text-white">{link}</p>
          </div>
        </div>
      ) : paired && !sure ? (
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setSure(true)} className="min-h-[44px] text-sm text-zinc-400 underline">
            Vincular otra tablet
          </button>
          <InfoTip label="Tablet del molinete">
            <p>Genera un código QR para abrir en una tablet o celular que queda junto al molinete.</p>
            <p>
              La tablet lee el QR de la app del socio y, si tiene plan de musculación al día, el intermediario abre el molinete. <strong>Necesita el
              intermediario funcionando.</strong>
            </p>
            <p>Si vinculás otra tablet, la anterior deja de funcionar.</p>
          </InfoTip>
        </div>
      ) : (
        <form action={submit} className="flex flex-wrap items-center gap-2">
          {paired && <span className="text-xs text-amber-200">La tablet anterior deja de funcionar.</span>}
          <SubmitButton variant="ghost">
            <Tablet className="h-4 w-4" aria-hidden="true" /> {paired ? 'Sí, vincular otra' : 'Vincular tablet del molinete'}
          </SubmitButton>
          <InfoTip label="Tablet del molinete">
            <p>Genera un código QR para abrir en una tablet o celular que queda junto al molinete.</p>
            <p>
              La tablet lee el QR de la app del socio y, si tiene plan de musculación al día, el intermediario abre el molinete. <strong>Necesita el
              intermediario funcionando.</strong>
            </p>
            <p>Si vinculás otra tablet, la anterior deja de funcionar.</p>
          </InfoTip>
        </form>
      )}
      <Notice state={state} />
      </div>
    </details>
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
        <form action={doForget} className="flex items-center gap-1.5">
          <SubmitButton variant="ghost">
            <UserX className="h-4 w-4" aria-hidden="true" /> Borrar del lector
          </SubmitButton>
          <InfoTip label="Borrar del lector">
            <p>Saca a esta persona del aparato: <strong>ya no puede entrar con su cara, palma o huella</strong>.</p>
            <p>No toca a ningún socio del sistema.</p>
          </InfoTip>
        </form>
      </div>
      <form action={doLink} className="flex flex-wrap items-start gap-2">
        <label className="sr-only" htmlFor={`dni-${pin}`}>DNI del socio</label>
        <input id={`dni-${pin}`} name="dni" inputMode="numeric" placeholder="DNI del socio" className={`${inputClass} w-44`} />
        <SubmitButton variant="ghost">
          <Link2 className="h-4 w-4" aria-hidden="true" /> Vincular a socio
        </SubmitButton>
        <span className="flex min-h-[44px] items-center">
          <InfoTip label="Vincular a socio">
            <p>Une a esta persona, que fue cargada a mano en el lector, con el socio de ese DNI. <strong>Conserva su cara, palma o huella.</strong></p>
            <p>Desde ese momento el sistema controla sus pagos: si se vence o debe, la saca del lector; cuando paga, la vuelve a cargar.</p>
          </InfoTip>
        </span>
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
      <span className="ml-1.5 inline-flex min-h-[44px] items-center align-middle">
        <InfoTip label="Registrar en el lector">
          <p>Carga al socio en el lector y lo pone en <strong>modo registro</strong>.</p>
          <p>El socio tiene que estar frente al aparato en ese momento para que tome su cara (o apoyar la palma o el dedo). Solo funciona si está al día.</p>
          <p>Se guarda como código, no como foto, y se borra solo si el socio se da de baja.</p>
        </InfoTip>
      </span>
      <Notice state={state} />
    </form>
  )
}

/** Botón "Abrir molinete": una vuelta, para recepción o el dueño. */
export function OpenTurnstileButton({ action, label = 'Abrir molinete' }: { action: Bare; label?: string }) {
  const [state, submit] = useActionForm(action)
  return (
    <form action={submit} className="space-y-2">
      <SubmitButton>
        <DoorOpen className="h-4 w-4" aria-hidden="true" /> {label}
      </SubmitButton>
      <Notice state={state} />
    </form>
  )
}
