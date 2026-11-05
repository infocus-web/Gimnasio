'use client'

import type { ActionState } from '@/features/admin/errors'
import { Notice, SubmitButton, inputClass, useActionForm } from '@/features/admin/ui'

export interface FriendPromoSettings {
  cross_enabled: boolean
  duo_enabled: boolean
  duo_discount_pct: number
  welcome_enabled: boolean
  welcome_discount_pct: number
}

function Promo({
  name,
  on,
  title,
  children,
}: {
  name: string
  on: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-zinc-800 p-4 has-[input[type=checkbox]:checked]:border-[#edcc36]/50">
      <label className="flex min-h-[40px] cursor-pointer items-center gap-3">
        <input type="checkbox" name={name} defaultChecked={on} className="h-5 w-5 shrink-0 accent-[#edcc36]" />
        <span className="font-bold text-white">{title}</span>
      </label>
      <div className="mt-1 pl-8 text-sm text-zinc-400">{children}</div>
    </div>
  )
}

function Pct({ name, value, error, label }: { name: string; value: number; error?: string; label: string }) {
  return (
    <span className="mt-2 flex flex-wrap items-center gap-2">
      <label htmlFor={name} className="text-zinc-300">{label}</label>
      <span className="relative w-24">
        <input id={name} name={name} type="number" min={0} max={100} defaultValue={value} className={`${inputClass} pr-7 text-right`} />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">%</span>
      </span>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </span>
  )
}

/** Las 3 promos de "Traé a un amigo/a". El amigo/a elige una al inscribirse online con el link del socio. */
export function FriendPromoForm({
  action,
  settings,
  rewardDays,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  settings: FriendPromoSettings
  rewardDays: number
}) {
  const [state, formAction] = useActionForm(action, {})
  const fe = state.fieldErrors ?? {}
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <p className="text-sm text-zinc-400">
        Cada socio comparte su link desde la app (Yo → Invitá a un amigo). Si se inscribe online una persona <strong className="text-zinc-200">nueva</strong>{' '}
        (sin ficha en el gimnasio), elige uno de estos beneficios:
      </p>
      <Promo name="cross" on={settings.cross_enabled} title="1 · Actividades cruzadas">
        Cada uno paga su plan y además puede reservar las clases de la actividad del otro, mientras los dos tengan el plan al día. Musculación no se cruza.
      </Promo>
      <Promo name="duo" on={settings.duo_enabled} title="2 · Precio de a dos">
        Los dos pagan su plan con descuento todos los meses (online), mientras los dos sigan con el plan al día.
        <Pct name="duoPct" value={settings.duo_discount_pct} error={fe.duoPct} label="Descuento para cada uno:" />
      </Promo>
      <Promo name="welcome" on={settings.welcome_enabled} title="3 · Bienvenida">
        El amigo/a paga su primer mes con descuento y, al pagar, los dos suman {rewardDays} días gratis (los días se cambian en Reglas).
        <Pct name="welcomePct" value={settings.welcome_discount_pct} error={fe.welcomePct} label="Descuento del primer mes:" />
      </Promo>
      <Notice state={state} />
      <div className="flex justify-end">
        <SubmitButton>Guardar promos</SubmitButton>
      </div>
    </form>
  )
}
