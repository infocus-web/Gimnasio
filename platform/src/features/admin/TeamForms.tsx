'use client'

import { useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { UserPlus, KeyRound, Copy, Lock, Unlock, Trash2, Check, Loader2 } from 'lucide-react'
import { PendingButton } from './ConfirmAction'
import type { ActionState } from './errors'
import { Notice, useActionForm } from './ui'

const ROLE_OPTIONS = [
  { value: 'trainer', label: 'Profesor', hint: 'Ve sus clases y sus alumnos, asigna rutinas.' },
  { value: 'staff', label: 'Recepción', hint: 'Check-in, altas de socios y cobros.' },
  { value: 'buffet', label: 'Buffet', hint: 'Concesionario del buffet: solo carta, menú del día y pedidos.' },
  { value: 'admin', label: 'Administrador', hint: 'Todo, menos gestionar al dueño.' },
] as const

const SMALL_INPUT =
  'h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-white placeholder:text-zinc-600 focus-visible:border-[#edcc36] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]/20'

function MiniField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</span>
      {children}
      {error && <span className="block text-xs text-red-300">{error}</span>}
    </label>
  )
}

function SmallSubmit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#edcc36] px-4 text-xs font-bold text-black disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />}
      {children}
    </button>
  )
}

function RoleSelect({ allowAdmin }: { allowAdmin: boolean }) {
  return (
    <select name="role" defaultValue="trainer" className={SMALL_INPUT}>
      {ROLE_OPTIONS.filter((r) => allowAdmin || r.value !== 'admin').map((r) => (
        <option key={r.value} value={r.value} title={r.hint}>
          {r.label}
        </option>
      ))}
    </select>
  )
}

export function InviteStaffForm({
  action,
  allowAdmin,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  allowAdmin: boolean
}) {
  const [state, formAction] = useActionForm(action, {})
  const err = state.fieldErrors ?? {}
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <MiniField label="Nombre" error={err.displayName}>
          <input name="displayName" className={SMALL_INPUT} autoComplete="off" />
        </MiniField>
        <MiniField label="Email" error={err.email}>
          <input name="email" type="email" inputMode="email" className={SMALL_INPUT} autoComplete="off" />
        </MiniField>
        <MiniField label="Rol">
          <RoleSelect allowAdmin={allowAdmin} />
        </MiniField>
        <div className="flex items-end justify-end">
          <SmallSubmit>Enviar invitación</SmallSubmit>
        </div>
      </div>
      <Notice state={state} />
    </form>
  )
}

export function StaffRowForm({
  action,
  role,
  allowAdmin,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  role: string
  allowAdmin: boolean
}) {
  const [state, formAction, pending] = useActionForm(action, {})
  const [value, setValue] = useState(role)
  useEffect(() => setValue(role), [role])
  const changed = value !== role
  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <select
        name="role"
        aria-label="Rol"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 rounded-lg border border-zinc-800 bg-zinc-900 pl-2.5 pr-7 text-xs font-medium text-zinc-200 hover:border-zinc-600 focus-visible:border-[#edcc36] focus-visible:outline-none"
      >
        {ROLE_OPTIONS.filter((r) => allowAdmin || r.value !== 'admin' || role === 'admin').map((r) => (
          <option key={r.value} value={r.value} disabled={r.value === 'admin' && !allowAdmin}>
            {r.label}
          </option>
        ))}
      </select>
      {changed && (
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#edcc36] px-2.5 text-xs font-bold text-black disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
          Guardar
        </button>
      )}
      {state.message && !state.ok && (
        <span role="alert" className="text-xs text-red-300">
          {state.message}
        </span>
      )}
    </form>
  )
}

// ---------------------------------------------------------------------
// Cuentas con contraseña, bloqueo y baja
// ---------------------------------------------------------------------

/** Muestra la contraseña generada UNA sola vez, con botón de copiar */
export function SecretBox({ secret }: { secret?: string }) {
  const [copied, setCopied] = useState(false)
  if (!secret) return null
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#edcc36]/40 bg-[#edcc36]/10 p-3">
      <KeyRound className="h-4 w-4 text-[#edcc36]" aria-hidden="true" />
      <code className="select-all font-mono text-base font-bold tracking-wider text-white">{secret}</code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(secret)
          setCopied(true)
        }}
        className="ml-auto inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-zinc-700 px-2.5 text-xs text-zinc-200 hover:text-white"
      >
        <Copy className="h-3.5 w-3.5" aria-hidden="true" /> {copied ? 'Copiada' : 'Copiar'}
      </button>
      <p className="w-full text-xs text-zinc-400">No la vas a poder volver a ver: copiala ahora y pasásela en persona o por WhatsApp.</p>
    </div>
  )
}

export function CreateStaffAccountForm({
  action,
  allowAdmin,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  allowAdmin: boolean
}) {
  const [state, formAction] = useActionForm(action, {})
  const err = state.fieldErrors ?? {}
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <MiniField label="Nombre" error={err.displayName}>
          <input name="displayName" className={SMALL_INPUT} autoComplete="off" />
        </MiniField>
        <MiniField label="Email (usuario)" error={err.email}>
          <input name="email" type="email" inputMode="email" className={SMALL_INPUT} autoComplete="off" />
        </MiniField>
        <MiniField label="Rol">
          <RoleSelect allowAdmin={allowAdmin} />
        </MiniField>
        <MiniField label="Contraseña" error={err.password}>
          <input name="password" type="text" autoComplete="new-password" className={SMALL_INPUT} placeholder="Vacío = automática" />
        </MiniField>
      </div>
      <Notice state={state} />
      <SecretBox secret={state.secret} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-zinc-500">Al entrar por primera vez la tiene que cambiar.</p>
        <SmallSubmit>Crear cuenta</SmallSubmit>
      </div>
    </form>
  )
}


const ICON_BTN =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36] disabled:opacity-60'
const PANEL_BTN =
  'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold disabled:opacity-60'

function PanelSubmit({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${PANEL_BTN} ${danger ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-[#edcc36] text-black'}`}
    >
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
}

/** Acciones de la cuenta en íconos; las confirmaciones y avisos se abren en un panel flotante */
export function StaffAccountActions({
  name,
  active,
  resetAction,
  blockAction,
  deleteAction,
}: {
  name: string
  active: boolean
  resetAction: (prev: ActionState) => Promise<ActionState>
  blockAction: (prev: ActionState) => Promise<ActionState>
  deleteAction: (prev: ActionState, form: FormData) => Promise<ActionState>
}) {
  const [resetState, reset] = useActionForm(resetAction, {})
  const [blockState, block] = useActionForm(blockAction, {})
  const [delState, del] = useActionForm(deleteAction, {})
  const [sure, setSure] = useState<'reset' | 'block' | 'delete' | null>(null)
  const [closed, setClosed] = useState<ActionState | null>(null)
  const shown = delState.message ? delState : blockState.message ? blockState : resetState
  useEffect(() => {
    if (resetState.ok || blockState.ok) setSure(null)
  }, [resetState, blockState])
  const hasNews = Boolean(shown.message || resetState.secret) && closed !== shown
  const open = sure !== null || hasNews
  const close = () => {
    setSure(null)
    setClosed(shown)
  }

  return (
    <div className="relative flex items-center" onKeyDown={(e) => e.key === 'Escape' && close()}>
      <button type="button" onClick={() => setSure('reset')} className={ICON_BTN} title="Nueva contraseña" aria-label={`Nueva contraseña para ${name}`}>
        <KeyRound className="h-4 w-4" aria-hidden="true" />
      </button>
      {active ? (
        <button type="button" onClick={() => setSure('block')} className={ICON_BTN} title="Bloquear acceso" aria-label={`Bloquear a ${name}`}>
          <Lock className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : (
        <form action={block}>
          <PendingButton iconOnly className={`${ICON_BTN} text-emerald-300`} title="Desbloquear" ariaLabel={`Desbloquear a ${name}`}>
            <Unlock className="h-4 w-4" aria-hidden="true" />
          </PendingButton>
        </form>
      )}
      <button
        type="button"
        onClick={() => setSure('delete')}
        className={`${ICON_BTN} hover:bg-red-500/10 hover:text-red-300`}
        title="Eliminar del equipo"
        aria-label={`Eliminar a ${name} del equipo`}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`Acciones de ${name}`}
          className="absolute right-0 top-full z-30 mt-1.5 w-72 space-y-3 rounded-xl border border-zinc-800 bg-[#161616] p-3 text-xs text-zinc-300 shadow-2xl shadow-black/60"
        >
          {sure === 'reset' && (
            <form action={reset} className="space-y-3">
              <p>
                <strong className="text-white">¿Generar nueva contraseña?</strong> La actual de {name} deja de andar.
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={close} className={`${PANEL_BTN} text-zinc-400 hover:text-white`}>Cancelar</button>
                <PanelSubmit>Generar</PanelSubmit>
              </div>
            </form>
          )}
          {sure === 'block' && (
            <form action={block} className="space-y-3">
              <p>
                <strong className="text-white">¿Bloquear a {name}?</strong> No va a poder entrar al panel hasta que lo desbloquees. Conserva su historial.
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={close} className={`${PANEL_BTN} text-zinc-400 hover:text-white`}>Cancelar</button>
                <PanelSubmit danger>Bloquear</PanelSubmit>
              </div>
            </form>
          )}
          {sure === 'delete' && (
            <form action={del} className="space-y-3">
              <p>
                <strong className="text-white">¿Sacar a {name} del equipo?</strong> Escribí ELIMINAR para confirmar.
              </p>
              <label className="sr-only" htmlFor={`confirm-${name}`}>Escribí ELIMINAR</label>
              <input
                id={`confirm-${name}`}
                name="confirm"
                placeholder="ELIMINAR"
                autoComplete="off"
                autoFocus
                className="h-8 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 text-xs text-white placeholder:text-zinc-600 focus-visible:border-red-400 focus-visible:outline-none"
              />
              {delState.fieldErrors?.confirm && <p className="text-red-300">{delState.fieldErrors.confirm}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={close} className={`${PANEL_BTN} text-zinc-400 hover:text-white`}>Cancelar</button>
                <PanelSubmit danger>Eliminar</PanelSubmit>
              </div>
            </form>
          )}
          {sure === null && hasNews && (
            <>
              <Notice state={shown} />
              <SecretBox secret={resetState.secret} />
              <div className="flex justify-end">
                <button type="button" onClick={close} className={`${PANEL_BTN} text-zinc-400 hover:text-white`}>Cerrar</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
