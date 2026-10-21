'use client'

import { useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import type { ActionState } from './errors'
import { Notice, SubmitButton, useActionForm } from './ui'

/** Acción de servidor ya "bindeada". Las viejas que devuelven void cuentan como ok. */
type Bare = (prev: ActionState) => Promise<ActionState | void>

function useBare(action: Bare) {
  return useActionForm(async (prev: ActionState) => (await action(prev)) ?? { ok: true }, {})
}

const TRIGGER: Record<'link' | 'ghost' | 'icon' | 'danger', string> = {
  link: 'inline-flex min-h-[36px] items-center gap-1 text-xs text-zinc-500 hover:text-red-300',
  ghost:
    'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-semibold text-zinc-200 hover:border-[#edcc36]/60 hover:text-white',
  danger: 'inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-red-500/30 px-4 text-sm font-semibold text-red-300 hover:bg-red-500/10',
  icon: 'grid h-9 w-9 place-items-center rounded-lg border border-zinc-800 text-zinc-500 hover:border-red-500/50 hover:text-red-300',
}

/**
 * Botón destructivo en dos pasos (mismo patrón que DeviceButtons):
 * primer toque muestra "¿Seguro? <texto> · Sí, … / Cancelar".
 */
export function ConfirmAction({
  action,
  children,
  confirmText,
  yesLabel,
  ariaLabel,
  variant = 'link',
  className,
}: {
  action: Bare
  children: React.ReactNode
  /** Qué pasa si confirma, corto y concreto */
  confirmText: string
  yesLabel: string
  ariaLabel?: string
  variant?: keyof typeof TRIGGER
  className?: string
}) {
  const [state, submit] = useBare(action)
  const [sure, setSure] = useState(false)
  useEffect(() => {
    if (state.ok) setSure(false)
  }, [state])
  return (
    <div className={className ?? 'space-y-2'}>
      {sure ? (
        <form action={submit} className="flex flex-wrap items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-2">
          <span className="text-xs text-zinc-300">
            <strong className="text-white">¿Seguro?</strong> {confirmText}
          </span>
          <SubmitButton variant="ghost">{yesLabel}</SubmitButton>
          <button type="button" onClick={() => setSure(false)} className="min-h-[44px] px-3 text-sm text-zinc-400 hover:text-white">
            Cancelar
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setSure(true)} aria-label={ariaLabel} className={TRIGGER[variant]}>
          {children}
        </button>
      )}
      {!state.ok && <Notice state={state} />}
    </div>
  )
}

/** Botón chico (ícono / píldora) que envía su form: muestra spinner mientras procesa */
export function PendingButton({
  children,
  className,
  ariaLabel,
  ariaPressed,
  title,
  disabled,
  iconOnly,
}: {
  children: React.ReactNode
  className: string
  ariaLabel?: string
  ariaPressed?: boolean
  title?: string
  disabled?: boolean
  /** Botón de solo ícono: el spinner reemplaza al ícono en vez de sumarse */
  iconOnly?: boolean
}) {
  const { pending } = useFormStatus()
  if (iconOnly) {
    return (
      <button type="submit" disabled={pending || disabled} aria-label={ariaLabel} aria-pressed={ariaPressed} title={title} aria-busy={pending} className={`${className} disabled:opacity-60`}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : children}
      </button>
    )
  }
  return (
    <button type="submit" disabled={pending || disabled} aria-label={ariaLabel} aria-pressed={ariaPressed} title={title} aria-busy={pending} className={`${className} disabled:opacity-60`}>
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  )
}

/** Error corto debajo de un botón compacto */
export function InlineError({ state }: { state: ActionState }) {
  if (state.ok || !state.message) return null
  return (
    <span role="alert" className="block max-w-[16rem] text-xs text-red-300">
      {state.message}
    </span>
  )
}

/** Un botón compacto que dispara una acción sin confirmación (spinner + error) */
export function ActionButton({
  action,
  children,
  className,
  ariaLabel,
  ariaPressed,
  title,
  disabled,
  iconOnly,
}: {
  action: Bare
  children: React.ReactNode
  className: string
  ariaLabel?: string
  ariaPressed?: boolean
  title?: string
  disabled?: boolean
  iconOnly?: boolean
}) {
  const [state, submit] = useBare(action)
  return (
    <form action={submit} className="inline-flex flex-col items-start gap-1">
      <PendingButton className={className} ariaLabel={ariaLabel} ariaPressed={ariaPressed} title={title} disabled={disabled} iconOnly={iconOnly}>
        {children}
      </PendingButton>
      <InlineError state={state} />
    </form>
  )
}
