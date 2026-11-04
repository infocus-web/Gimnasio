'use client'

import { startTransition, useActionState, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import type { SignupState } from './signup-actions'

export interface SignupPlan {
  id: string
  name: string
  description: string | null
  price_cents: number
  currency: string
  billing_interval: 'day' | 'week' | 'month' | 'year' | null
  interval_count: number
  kind: string
  class_credits: number | null
}

const PERIOD: Record<string, [string, string]> = {
  day: ['día', 'días'],
  week: ['semana', 'semanas'],
  month: ['mes', 'meses'],
  year: ['año', 'años'],
}

function money(cents: number, currency: string) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100)
}
function period(p: SignupPlan) {
  if (p.kind === 'class_pack' && p.class_credits) return `${p.class_credits} clases`
  if (!p.billing_interval) return ''
  const [one, many] = PERIOD[p.billing_interval] ?? ['', '']
  return p.interval_count > 1 ? `cada ${p.interval_count} ${many}` : `por ${one}`
}

const input =
  'mt-1.5 block w-full min-h-[48px] rounded-md border border-white/15 bg-[#141414] px-3.5 text-base text-white placeholder:text-white/30 focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 aria-[invalid=true]:border-red-400'

function Field({
  label,
  name,
  error,
  hint,
  ...rest
}: { label: string; name: string; error?: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `f-${name}`
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-white/80">
        {label}
      </label>
      <input id={id} name={name} aria-invalid={!!error} aria-describedby={error || hint ? `${id}-d` : undefined} className={input} {...rest} />
      {(error || hint) && (
        <p id={`${id}-d`} className={`mt-1.5 text-sm ${error ? 'text-red-300' : 'text-white/45'}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
}

function Submit({ label, pending }: { label: string; pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-md bg-brand px-5 text-lg font-bold text-black transition-colors hover:bg-[#f5db5c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-70"
    >
      {pending ? (
        <>
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Abriendo Mercado Pago…
        </>
      ) : (
        label
      )}
    </button>
  )
}

export function SignupForm({
  action,
  plans,
  initialPlan,
}: {
  action: (prev: SignupState, form: FormData) => Promise<SignupState>
  plans: SignupPlan[]
  initialPlan: string | null
}) {
  const [state, submit, pending] = useActionState(action, {})
  const [plan, setPlan] = useState(initialPlan)
  const fe = state.fieldErrors ?? {}
  const chosen = plans.find((p) => p.id === plan)

  return (
    <form
      // Se envía a mano (no con action=) para que React no vacíe el formulario si hay un error
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        startTransition(() => submit(data))
      }}
      className="mt-10 space-y-10"
      noValidate
    >
      <fieldset>
        <legend className="font-display text-2xl font-bold tracking-[-0.02em] text-white">1. Elegí tu plan</legend>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {plans.map((p) => {
            const on = p.id === plan
            return (
              <label
                key={p.id}
                className={`relative flex cursor-pointer flex-col rounded-lg border p-5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${
                  on ? 'border-brand bg-brand/10' : 'border-white/12 bg-[#141414] hover:border-white/30'
                }`}
              >
                <input type="radio" name="plan" value={p.id} checked={on} onChange={() => setPlan(p.id)} className="sr-only" />
                <span className="pr-8 font-display text-xl font-bold leading-tight text-white">{p.name}</span>
                {p.description && <span className="mt-1 text-sm text-white/55">{p.description}</span>}
                <span className="mt-4 flex items-baseline gap-1.5">
                  <span className="font-display text-3xl font-bold tabular-nums text-white">{money(p.price_cents, p.currency)}</span>
                  <span className="text-sm font-semibold text-white/50">{period(p)}</span>
                </span>
                <span
                  className={`absolute right-4 top-4 grid h-6 w-6 place-items-center rounded-full border ${on ? 'border-brand bg-brand text-black' : 'border-white/30'}`}
                  aria-hidden="true"
                >
                  {on && <Check className="h-4 w-4" />}
                </span>
              </label>
            )
          })}
        </div>
        {fe.plan && <p className="mt-2 text-sm text-red-300">{fe.plan}</p>}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-display text-2xl font-bold tracking-[-0.02em] text-white">2. Tus datos</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" name="firstName" autoComplete="given-name" maxLength={60} required error={fe.firstName} />
          <Field label="Apellido" name="lastName" autoComplete="family-name" maxLength={60} required error={fe.lastName} />
          <Field label="DNI" name="document" inputMode="numeric" maxLength={12} required error={fe.document} hint="Solo números. Con el DNI te identificamos en recepción." />
          <Field label="Fecha de nacimiento (opcional)" name="birthDate" type="date" error={fe.birthDate} />
          <Field label="Celular" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={40} required placeholder="11 2345-6789" error={fe.phone} />
          <Field label="Email" name="email" type="email" autoComplete="email" maxLength={200} required error={fe.email} hint="Acá te llega el acceso a la app." />
        </div>
      </fieldset>

      <div>
        <label className="flex cursor-pointer items-start gap-3 text-[15px] text-white/75">
          <input type="checkbox" name="terms" className="mt-0.5 h-5 w-5 shrink-0 accent-[#edcc36]" />
          Declaro estar en condiciones de salud para hacer actividad física y me comprometo a presentar el apto médico en recepción.
        </label>
        {fe.terms && <p className="mt-1.5 pl-8 text-sm text-red-300">{fe.terms}</p>}
      </div>

      {state.error && (
        <p role="alert" className="rounded-md border border-red-400/40 bg-red-950/60 px-4 py-3 text-red-100">
          {state.error}
        </p>
      )}

      <Submit pending={pending} label={chosen ? `Pagar ${money(chosen.price_cents, chosen.currency)} con Mercado Pago` : 'Pagar con Mercado Pago'} />
    </form>
  )
}
