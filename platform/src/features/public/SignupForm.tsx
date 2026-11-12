'use client'

import { startTransition, useActionState, useState } from 'react'
import { Check, Gift, Loader2 } from 'lucide-react'
import type { SignupState } from './signup-actions'
import type { FriendPromo, ReferralInfo } from './referral-types'

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

/** "Traé a un amigo/a": código del socio que te invitó + qué beneficio elegís. */
function FriendBox({
  slug,
  referral,
  setReferral,
  promo,
  setPromo,
  error,
}: {
  slug: string
  referral: ReferralInfo | null
  setReferral: (r: ReferralInfo | null) => void
  promo: FriendPromo | null
  setPromo: (p: FriendPromo | null) => void
  error?: string
}) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [bad, setBad] = useState(false)

  const check = async () => {
    const c = code.trim()
    if (!c) return
    setChecking(true)
    setBad(false)
    try {
      const res = await fetch(`/${slug}/referido?code=${encodeURIComponent(c)}`, { cache: 'no-store' })
      const r = (await res.json()) as ReferralInfo
      if (r.valid) {
        setReferral(r)
        setPromo(null)
      } else setBad(true)
    } catch {
      setBad(true)
    }
    setChecking(false)
  }

  if (!referral?.valid) {
    return (
      <div className="rounded-lg border border-white/12 bg-[#141414] p-4">
        {!open ? (
          <button type="button" onClick={() => setOpen(true)} className="flex min-h-[44px] items-center gap-2 text-left font-semibold text-brand">
            <Gift className="h-5 w-5 shrink-0" aria-hidden="true" /> ¿Te invitó un amigo/a que ya entrena acá? Ingresá su código
          </button>
        ) : (
          <div>
            <label htmlFor="ref-code" className="text-sm font-semibold text-white/80">Código de tu amigo/a</label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="ref-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void check()
                  }
                }}
                placeholder="Ej. JUAN4821"
                maxLength={20}
                className={input.replace('mt-1.5 ', '') + ' uppercase'}
              />
              <button
                type="button"
                onClick={() => void check()}
                disabled={checking}
                className="min-h-[48px] shrink-0 rounded-md border border-brand px-4 font-bold text-brand hover:bg-brand/10 disabled:opacity-60"
              >
                {checking ? 'Buscando…' : 'Usar'}
              </button>
            </div>
            {bad && <p className="mt-1.5 text-sm text-red-300">Ese código no existe o el socio no tiene el plan al día.</p>}
          </div>
        )}
      </div>
    )
  }

  const p = referral.promos!
  const acts = referral.referrer_activities ?? []
  const options: { value: FriendPromo; title: string; text: string }[] = []
  if (p.cross)
    options.push({
      value: 'cross',
      title: 'Actividades cruzadas',
      text: `Cada uno paga su plan y además pueden ir a las clases de la actividad del otro${acts.length ? ` (vos sumás ${acts.join(', ')})` : ''}, mientras los dos tengan el plan al día.`,
    })
  if (p.duo)
    options.push({
      value: 'duo',
      title: `De a dos: ${p.duo}% off para los dos`,
      text: `Vos y ${referral.referrer} pagan su plan con ${p.duo}% de descuento todos los meses, mientras los dos sigan entrenando.`,
    })
  if (p.welcome)
    options.push({
      value: 'welcome',
      title: `Bienvenida: ${p.welcome.pct}% off tu primer mes`,
      text: `Pagás tu primer mes con ${p.welcome.pct}% de descuento y los dos suman ${p.welcome.days} días gratis.`,
    })

  return (
    <fieldset className="rounded-lg border border-brand/50 bg-brand/5 p-5">
      <input type="hidden" name="refCode" value={referral.code} />
      <legend className="sr-only">Promo Traé a un amigo/a</legend>
      <p className="flex items-center gap-2 font-display text-xl font-bold text-white">
        <Gift className="h-5 w-5 text-brand" aria-hidden="true" /> Te invitó {referral.referrer}
      </p>
      <p className="mt-1 text-sm text-white/60">Elegí tu beneficio (uno). La promo es para personas que nunca estuvieron inscriptas en el gimnasio.</p>
      {options.length === 0 ? (
        <p className="mt-3 text-white/70">Ahora no hay promos activas. Podés inscribirte igual.</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {options.map((o) => {
            const on = promo === o.value
            return (
              <label
                key={o.value}
                className={`flex cursor-pointer gap-3 rounded-lg border p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${
                  on ? 'border-brand bg-brand/10' : 'border-white/12 bg-black/40 hover:border-white/30'
                }`}
              >
                <input type="radio" name="promo" value={o.value} checked={on} onChange={() => setPromo(o.value)} className="mt-1 h-5 w-5 shrink-0 accent-[#edcc36]" />
                <span>
                  <span className="block font-bold text-white">{o.title}</span>
                  <span className="mt-0.5 block text-sm text-white/65">{o.text}</span>
                </span>
              </label>
            )
          })}
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      <button
        type="button"
        onClick={() => {
          setReferral(null)
          setPromo(null)
        }}
        className="mt-3 min-h-[40px] text-sm font-semibold text-white/50 underline-offset-4 hover:text-white hover:underline"
      >
        Inscribirme sin promo
      </button>
    </fieldset>
  )
}

export function SignupForm({
  action,
  plans,
  initialPlan,
  slug,
  initialReferral,
  accountEmail,
  profileDone = false,
}: {
  action: (prev: SignupState, form: FormData) => Promise<SignupState>
  plans: SignupPlan[]
  initialPlan: string | null
  slug: string
  initialReferral: ReferralInfo | null
  /** Email de la cuenta con la que entró (la inscripción queda a nombre de esa cuenta) */
  accountEmail: string
  /** Ya completó sus datos y su foto (paso 1): acá solo elige el plan y paga */
  profileDone?: boolean
}) {
  const [state, submit, pending] = useActionState(action, {})
  const [plan, setPlan] = useState(initialPlan)
  const fe = state.fieldErrors ?? {}
  const chosen = plans.find((p) => p.id === plan)
  const [referral, setReferral] = useState<ReferralInfo | null>(initialReferral?.valid ? initialReferral : null)
  const [promo, setPromo] = useState<FriendPromo | null>(null)
  const pct = promo === 'duo' ? (referral?.promos?.duo ?? 0) : promo === 'welcome' ? (referral?.promos?.welcome?.pct ?? 0) : 0
  const final = (cents: number) => Math.max(Math.round((cents * (100 - pct)) / 100), 1)

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
      <FriendBox slug={slug} referral={referral} setReferral={setReferral} promo={promo} setPromo={setPromo} error={fe.promo} />

      <fieldset>
        <legend className="font-display text-2xl font-bold tracking-[-0.02em] text-white">{profileDone ? 'Elegí tu plan' : '1. Elegí tu plan'}</legend>
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
                  {pct > 0 && <span className="text-base font-semibold tabular-nums text-white/40 line-through">{money(p.price_cents, p.currency)}</span>}
                  <span className="font-display text-3xl font-bold tabular-nums text-white">{money(final(p.price_cents), p.currency)}</span>
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

      {!profileDone && (
        <>
        <fieldset className="space-y-4">
          <legend className="font-display text-2xl font-bold tracking-[-0.02em] text-white">2. Tus datos</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" name="firstName" autoComplete="given-name" maxLength={60} required error={fe.firstName} />
            <Field label="Apellido" name="lastName" autoComplete="family-name" maxLength={60} required error={fe.lastName} />
            <Field label="DNI" name="document" inputMode="numeric" maxLength={12} required error={fe.document} hint="Solo números. Con el DNI te identificamos en recepción." />
            <Field label="Fecha de nacimiento (opcional)" name="birthDate" type="date" error={fe.birthDate} />
            <Field label="Celular" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={40} required placeholder="11 2345-6789" error={fe.phone} />
          </div>
          <p className="text-sm text-white/55">
            Tu cuenta: <strong className="text-white/85">{accountEmail}</strong>. Con este email y tu contraseña entrás a la app.
          </p>
          {fe.email && <p className="text-sm text-red-300">{fe.email}</p>}
        </fieldset>

        <div>
          <label className="flex cursor-pointer items-start gap-3 text-[15px] text-white/75">
            <input type="checkbox" name="terms" className="mt-0.5 h-5 w-5 shrink-0 accent-[#edcc36]" />
            Declaro estar en condiciones de salud para hacer actividad física y me comprometo a presentar el apto médico en recepción.
          </label>
          {fe.terms && <p className="mt-1.5 pl-8 text-sm text-red-300">{fe.terms}</p>}
        </div>
        </>
      )}

      {profileDone && (fe.firstName || fe.lastName || fe.document || fe.phone || fe.birthDate || fe.email) && (
        <p role="alert" className="rounded-md border border-red-400/40 bg-red-950/60 px-4 py-3 text-red-100">
          {fe.document ?? fe.phone ?? fe.firstName ?? fe.lastName ?? fe.birthDate ?? fe.email}{' '}
          <a href="?datos=1" className="font-semibold underline">
            Corregir mis datos
          </a>
        </p>
      )}

      {state.error && (
        <p role="alert" className="rounded-md border border-red-400/40 bg-red-950/60 px-4 py-3 text-red-100">
          {state.error}
        </p>
      )}

      <Submit pending={pending} label={chosen ? `Pagar ${money(final(chosen.price_cents), chosen.currency)} con Mercado Pago` : 'Pagar con Mercado Pago'} />
    </form>
  )
}
