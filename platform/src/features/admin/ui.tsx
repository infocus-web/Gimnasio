'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import type { ActionState } from './errors'

/**
 * useActionState + memoria de lo cargado: React vacía el formulario después de
 * cada envío; si la acción falla, devolvemos lo enviado para restaurarlo
 * (lo hace <KeepValues/>, que va dentro de <Notice/>).
 */
type FormAction = (prev: ActionState, form: FormData) => Promise<ActionState>
type BareAction = (prev: ActionState) => Promise<ActionState>

export function useActionForm(action: FormAction, initial?: ActionState): [ActionState, (form: FormData) => void, boolean]
export function useActionForm(action: BareAction, initial?: ActionState): [ActionState, (form: FormData) => void, boolean]
export function useActionForm(action: FormAction | BareAction, initial: ActionState = {}) {
  return useActionState(async (prev: ActionState, form: FormData) => {
    const result = await (action as FormAction)(prev, form)
    if (result.ok || !(form instanceof FormData)) return result
    const values: Record<string, string | string[]> = {}
    for (const [k, v] of form.entries()) {
      if (typeof v !== 'string') continue
      const cur = values[k]
      values[k] = cur === undefined ? v : Array.isArray(cur) ? [...cur, v] : [cur, v]
    }
    return { ...result, values }
  }, initial)
}

/** Vuelve a poner en el formulario lo que el usuario había cargado */
export function KeepValues({ values }: { values?: Record<string, string | string[]> }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const form = ref.current?.closest('form')
    if (!form || !values) return
    const apply = () => {
      for (const el of Array.from(form.elements)) {
        if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) continue
        if (!el.name || el.type === 'hidden' || el.type === 'file' || el.type === 'password') continue
        const v = values[el.name]
        if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
          const list = v === undefined ? [] : Array.isArray(v) ? v : [v]
          el.checked = list.includes(el.value)
        } else if (v !== undefined) {
          el.value = Array.isArray(v) ? (v[0] ?? '') : v
        }
      }
    }
    apply()
    const id = requestAnimationFrame(apply)   // por si React resetea después de este efecto
    return () => cancelAnimationFrame(id)
  }, [values])
  return <span ref={ref} hidden />
}

export const inputClass =
  'min-h-[44px] w-full rounded-xl border border-zinc-800 bg-black px-3 text-sm text-white placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36] disabled:opacity-50'

export function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string
  name: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1" htmlFor={name}>
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      {children}
      {error ? (
        <span id={`${name}-error`} className="block text-xs text-red-300">
          {error}
        </span>
      ) : hint ? (
        <span className="block text-xs text-zinc-500">{hint}</span>
      ) : null}
    </label>
  )
}

export function SubmitButton({ children, variant = 'primary' }: { children: React.ReactNode; variant?: 'primary' | 'ghost' }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={
        variant === 'primary'
          ? 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#edcc36] px-5 text-sm font-bold text-black disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white'
          : 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-semibold text-zinc-200 hover:border-[#edcc36]/60 hover:text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]'
      }
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
}

export function Notice({ state }: { state: ActionState | undefined }) {
  if (!state?.message) return state?.values ? <KeepValues values={state.values} /> : null
  const Icon = state.ok ? CheckCircle2 : AlertTriangle
  return (
    <p
      role={state.ok ? 'status' : 'alert'}
      className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
        state.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-red-500/30 bg-red-500/10 text-red-100'
      }`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{state.message}</span>
      {state.values && <KeepValues values={state.values} />}
    </p>
  )
}

export function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-300">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
