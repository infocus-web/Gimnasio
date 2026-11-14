'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useFormStatus } from 'react-dom'
import { RefreshCw, ListChecks, ShieldCheck, Pause, Play, Trash2, Link2, UserX, ScanFace, Copy, Check, Monitor, KeyRound, Tablet, DoorOpen, ChevronDown, AlertTriangle, Search, Loader2 } from 'lucide-react'
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
            {typeof state.values?.pairCode === 'string' && (
              <div>
                <p>En la tablet tocá <strong className="text-white">“Tengo un código”</strong> y escribí:</p>
                <p className="mt-1 font-mono text-3xl font-extrabold tracking-[0.3em] text-white">
                  {state.values.pairCode.slice(0, 3)} {state.values.pairCode.slice(3)}
                </p>
                <p className="text-xs text-[#f5e38a]/70">Vale 15 minutos y una sola vez.</p>
              </div>
            )}
            <p>O escaneá este código con la cámara de la tablet, o abrí el link en su navegador:</p>
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

export interface UnlinkedUser {
  pin: number
  name: string
  link: WithForm
  forget: Bare
}

/** Personas cargadas a mano en el lector sin socio: cajón plegable con buscador y lista con scroll */
export function UnlinkedUsersDrawer({ users }: { users: UnlinkedUser[] }) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const matches = (u: UnlinkedUser) => !needle || (u.name || 'sin nombre').toLowerCase().includes(needle) || String(u.pin).includes(needle)
  const visible = users.filter(matches).length
  return (
    <details className="group rounded-xl border border-amber-500/30 bg-amber-500/[0.03]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm text-amber-100 hover:bg-amber-500/5">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <strong className="font-semibold">{users.length === 1 ? '1 persona' : `${users.length} personas`} sin vincular</strong>
          <span className="text-amber-100/70"> · entran sin control de pagos</span>
        </span>
        <span className="hidden text-xs text-amber-200/70 sm:inline group-open:hidden">Ver y vincular</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-amber-300 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>

      <div className="space-y-2 border-t border-amber-500/20 p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre o N°"
              aria-label="Buscar persona del lector"
              className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 pl-8 pr-3 text-sm text-white placeholder:text-zinc-600 focus-visible:border-[#edcc36] focus-visible:outline-none"
            />
          </div>
          <span className="shrink-0 text-xs tabular-nums text-zinc-500">
            {visible === users.length ? users.length : `${visible} de ${users.length}`}
          </span>
          <InfoTip label="Personas sin vincular">
            <p>Fueron cargadas a mano en el lector y no están unidas a ningún socio, así que entran aunque deban.</p>
            <p><strong>Vincular:</strong> escribí el DNI del socio. Conserva su cara, palma o huella y desde ahí el sistema controla sus pagos.</p>
            <p><strong>Borrar:</strong> la saca del aparato; ya no puede entrar. No toca a ningún socio del sistema.</p>
          </InfoTip>
        </div>

        <ul className="max-h-[360px] divide-y divide-zinc-800/70 overflow-y-auto overscroll-contain rounded-lg border border-zinc-800 bg-black/20">
          {users.map((u) => (
            <UnlinkedUserRow key={u.pin} {...u} hidden={!matches(u)} />
          ))}
          {visible === 0 && <li className="px-3 py-6 text-center text-xs text-zinc-500">Nadie coincide con «{q}».</li>}
        </ul>
      </div>
    </details>
  )
}

function RowSubmit({ children, className, title }: { children: React.ReactNode; className: string; title?: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} title={title} className={`${className} disabled:opacity-60`}>
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  )
}

export function UnlinkedUserRow({ pin, name, link, forget, hidden }: UnlinkedUser & { hidden?: boolean }) {
  const [ls, doLink] = useActionForm(link)
  const [fs, doForget] = useActionForm(forget)
  const shown = fs.message ? fs : ls
  return (
    <li className={hidden ? 'hidden' : 'px-3 py-2'}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 basis-32 truncate text-sm text-white">
          {name || 'Sin nombre'} <span className="font-mono text-[11px] text-zinc-500">N° {pin}</span>
        </p>
        <form action={doLink} className="flex items-center gap-1.5">
          <label className="sr-only" htmlFor={`dni-${pin}`}>DNI del socio para {name || `N° ${pin}`}</label>
          <input
            id={`dni-${pin}`}
            name="dni"
            inputMode="numeric"
            placeholder="DNI"
            className="h-8 w-28 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 text-xs text-white placeholder:text-zinc-600 focus-visible:border-[#edcc36] focus-visible:outline-none"
          />
          <RowSubmit
            title="Vincular con el socio de ese DNI"
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-700 px-2.5 text-xs font-semibold text-zinc-200 hover:border-[#edcc36]/60 hover:text-white"
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" /> Vincular
          </RowSubmit>
        </form>
        <form action={doForget}>
          <RowSubmit
            title="Borrar del lector (ya no puede entrar)"
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-zinc-500 hover:bg-red-500/10 hover:text-red-300"
          >
            <UserX className="h-3.5 w-3.5" aria-hidden="true" /> Borrar
          </RowSubmit>
        </form>
      </div>
      {ls.fieldErrors?.dni && <p className="mt-1 text-xs text-red-300">{ls.fieldErrors.dni}</p>}
      {shown.message && (
        <div className="mt-2">
          <Notice state={shown} />
        </div>
      )}
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
