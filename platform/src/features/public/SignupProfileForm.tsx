'use client'

import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { WebcamCapture } from '@/features/admin/WebcamCapture'
import type { ProfileState } from './signup-actions'

const input =
  'mt-1.5 block w-full min-h-[48px] rounded-md border border-white/15 bg-[#141414] px-3.5 text-base text-white placeholder:text-white/30 focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 aria-[invalid=true]:border-red-400'

function Field({
  label,
  name,
  error,
  hint,
  ...rest
}: {
  label: string
  name: string
  error?: string
  hint?: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `p-${name}`
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

export interface ProfileDefaults {
  firstName: string
  lastName: string
  document: string
  phone: string
  birthDate: string
  photoSrc: string | null
}

/** Paso 1 de la inscripción online: tus datos y tu foto de socio (con la cámara del celular). */
export function SignupProfileForm({
  action,
  defaults,
  accountEmail,
  submitLabel = 'Seguir: elegir mi plan',
}: {
  action: (prev: ProfileState, form: FormData) => Promise<ProfileState>
  defaults: ProfileDefaults | null
  accountEmail: string
  /** Texto del botón (en /soy-socio no se elige plan) */
  submitLabel?: string
}) {
  const [state, submit, pending] = useActionState(action, {})
  const fe = state.fieldErrors ?? {}
  const formRef = useRef<HTMLFormElement>(null)
  const errorList = Object.values(fe).filter(Boolean) as string[]

  // Si algo no pasa la validación, llevar al socio al primer campo con error (si no, desde el botón parece que "no hace nada")
  useEffect(() => {
    if (!state.fieldErrors && !state.error) return
    const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-error="true"], [role="alert"]')
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (first instanceof HTMLInputElement) first.focus({ preventScroll: true })
  }, [state])

  return (
    <form
      ref={formRef}
      // Se envía a mano (no con action=) para que React no vacíe el formulario si hay un error
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        startTransition(() => submit(data))
      }}
      className="mt-10 space-y-10"
      noValidate
    >
      <fieldset className="space-y-4">
        <legend className="font-display text-2xl font-bold tracking-[-0.02em] text-white">Contanos quién sos</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Nombre"
            name="firstName"
            autoComplete="given-name"
            maxLength={60}
            required
            defaultValue={defaults?.firstName}
            error={fe.firstName}
          />
          <Field
            label="Apellido"
            name="lastName"
            autoComplete="family-name"
            maxLength={60}
            required
            defaultValue={defaults?.lastName}
            error={fe.lastName}
          />
          <Field
            label="DNI"
            name="document"
            inputMode="numeric"
            maxLength={12}
            required
            defaultValue={defaults?.document}
            error={fe.document}
            hint="Solo números."
          />
          <Field
            label="Celular"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={40}
            required
            placeholder="11 2345-6789"
            defaultValue={defaults?.phone}
            error={fe.phone}
            hint="Para avisarte de tus clases y tu plan."
          />
          <BirthDateField defaultValue={defaults?.birthDate} error={fe.birthDate} />
        </div>
        <p className="text-sm text-white/55">
          Tu cuenta: <strong className="text-white/85">{accountEmail}</strong>
        </p>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-display text-2xl font-bold tracking-[-0.02em] text-white">Tu foto de socio</legend>
        <p className="text-white/65">Una foto de frente, con buena luz. Así te reconocemos en la entrada.</p>
        <WebcamCapture selfie autoStart={false} current={defaults?.photoSrc ?? null} />
        {fe.photo && (
          <p data-error="true" className="text-center text-sm text-red-300">
            {fe.photo}
          </p>
        )}
      </fieldset>

      <div>
        <label className="flex cursor-pointer items-start gap-3 text-[15px] text-white/75">
          <input type="checkbox" name="terms" className="mt-0.5 h-5 w-5 shrink-0 accent-[#edcc36]" />
          Declaro estar en condiciones de salud para hacer actividad física y me comprometo a presentar el apto médico en recepción.
        </label>
        {fe.terms && (
          <p data-error="true" className="mt-1.5 pl-8 text-sm text-red-300">
            {fe.terms}
          </p>
        )}
      </div>

      {errorList.length > 0 && (
        <div className="rounded-md border border-red-400/40 bg-red-950/60 px-4 py-3 text-red-100">
          <p className="font-semibold">Revisá estos datos y volvé a tocar el botón:</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[15px]">
            {errorList.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {state.error && (
        <p role="alert" className="rounded-md border border-red-400/40 bg-red-950/60 px-4 py-3 text-red-100">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-md bg-brand px-5 text-lg font-bold text-black transition-colors hover:bg-[#f5db5c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-70"
      >
        {pending ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Guardando…
          </>
        ) : (
          submitLabel
        )}
      </button>
    </form>
  )
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

/**
 * Fecha de nacimiento con tres listas (día / mes / año): el calendario del celular obliga a
 * retroceder mes por mes hasta el año de nacimiento. Manda "birthDate" como AAAA-MM-DD.
 */
function BirthDateField({ defaultValue, error }: { defaultValue?: string; error?: string }) {
  const [y0, m0, d0] = (defaultValue ?? '').split('-')
  const [day, setDay] = useState(d0 ? String(Number(d0)) : '')
  const [month, setMonth] = useState(m0 ? String(Number(m0)) : '')
  const [year, setYear] = useState(y0 ?? '')
  const thisYear = new Date().getFullYear()
  const years = Array.from({ length: 95 }, (_, i) => thisYear - 12 - i)
  const daysInMonth = year && month ? new Date(Number(year), Number(month), 0).getDate() : 31
  const value =
    day && month && year && Number(day) <= daysInMonth ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` : ''
  const incomplete = (day || month || year) && !value
  const select = `${input} pr-2`
  return (
    <div>
      <p id="p-birthDate-l" className="text-sm font-semibold text-white/80">
        Fecha de nacimiento (opcional)
      </p>
      <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2" role="group" aria-labelledby="p-birthDate-l">
        <select aria-label="Día" value={day} onChange={(e) => setDay(e.target.value)} aria-invalid={!!error} className={select}>
          <option value="">Día</option>
          {Array.from({ length: daysInMonth }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
        <select aria-label="Mes" value={month} onChange={(e) => setMonth(e.target.value)} aria-invalid={!!error} className={select}>
          <option value="">Mes</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select aria-label="Año" value={year} onChange={(e) => setYear(e.target.value)} aria-invalid={!!error} className={select}>
          <option value="">Año</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <input type="hidden" name="birthDate" value={value} />
      {(error || incomplete) && (
        <p data-error="true" className="mt-1.5 text-sm text-red-300">
          {error ?? 'Completá día, mes y año (o dejalo vacío).'}
        </p>
      )}
    </div>
  )
}
