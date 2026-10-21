'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, ExternalLink, MessageCircle } from 'lucide-react'
import type { ActionState } from '@/features/admin/errors'
import { Field, inputClass, Notice, SubmitButton, useActionForm } from '@/features/admin/ui'
import { normalizeArPhone, whatsappLink } from '@/features/admin/whatsapp'
import type { PassActionState } from './actions'
import { passShareText, type PassKind } from './labels'

const btn =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-zinc-700 px-3 text-sm font-semibold text-zinc-200 hover:border-[#edcc36]/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]'

/** Botones para mandar el pase: WhatsApp (si hay celular), copiar link y abrir la página del pase. */
export function PassShare({
  link,
  phone,
  holderName,
  gymName,
  validUntil,
  timezone,
  kind,
  compact = false,
}: {
  link: string
  phone: string | null
  holderName: string
  gymName: string
  validUntil: string
  timezone: string
  kind: PassKind
  compact?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const wa = normalizeArPhone(phone)
  const text = passShareText({ holderName, gymName, link, validUntil, timezone, kind })
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={wa ? whatsappLink(wa, text) : `https://wa.me/?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`${btn} border-emerald-500/40 text-emerald-200`}
      >
        <MessageCircle className="h-4 w-4" aria-hidden="true" /> {compact ? 'WhatsApp' : wa ? 'Enviar por WhatsApp' : 'Compartir por WhatsApp'}
      </a>
      <button
        type="button"
        className={btn}
        onClick={() => {
          navigator.clipboard
            ?.writeText(link)
            .then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            })
            .catch(() => {})
        }}
      >
        {copied ? <Check className="h-4 w-4 text-emerald-300" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        {copied ? 'Copiado' : 'Copiar link'}
      </button>
      <a href={link} target="_blank" rel="noopener noreferrer" className={btn}>
        <ExternalLink className="h-4 w-4" aria-hidden="true" /> Ver QR
      </a>
    </div>
  )
}

/** Recepción: "Pase de prueba" o "Pase por día" para alguien que no es socio. */
export function IssuePassForm({
  action,
  baseUrl,
  gymName,
  timezone,
}: {
  action: (prev: ActionState, form: FormData) => Promise<PassActionState>
  baseUrl: string
  gymName: string
  timezone: string
}) {
  const [state, formAction] = useActionForm(action, {})
  const err = state.fieldErrors ?? {}
  const pass = (state as PassActionState).pass
  const [kind, setKind] = useState<'trial' | 'day'>('day')
  const [last, setLast] = useState<{ name: string; phone: string; kind: PassKind } | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const link = pass ? `${baseUrl}/pase/${pass.code}` : null

  useEffect(() => {
    if (!pass?.qr) return
    let alive = true
    QRCode.toDataURL(pass.qr, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
      .then((u) => alive && setQr(u))
      .catch(() => alive && setQr(null))
    return () => {
      alive = false
    }
  }, [pass?.qr])

  return (
    <div className="space-y-4">
      <form
        action={(fd) => {
          setLast({ name: String(fd.get('name') ?? ''), phone: String(fd.get('phone') ?? ''), kind })
          formAction(fd)
        }}
        className="space-y-4"
        noValidate
      >
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-1 text-xs font-medium text-zinc-400">Tipo de pase</legend>
          {(
            [
              ['day', 'Pase por día'],
              ['trial', 'Pase de prueba'],
            ] as const
          ).map(([v, label]) => (
            <label
              key={v}
              className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-zinc-800 px-3 text-sm text-zinc-200 has-[:checked]:border-[#edcc36]/70 has-[:checked]:bg-[#edcc36]/10"
            >
              <input type="radio" name="kind" value={v} checked={kind === v} onChange={() => setKind(v)} className="h-4 w-4 accent-[#edcc36]" />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre y apellido *" name="name" error={err.name}>
            <input name="name" autoComplete="off" className={inputClass} placeholder="Ej. Juan Pérez" />
          </Field>
          <Field label="Celular (para mandarle el pase)" name="phone" hint="Ej. 11 5555-1234">
            <input name="phone" inputMode="tel" autoComplete="off" className={inputClass} />
          </Field>
          <Field label="DNI" name="document">
            <input name="document" inputMode="numeric" autoComplete="off" className={inputClass} />
          </Field>
          <Field label="Email" name="email" error={err.email}>
            <input name="email" type="email" autoComplete="off" className={inputClass} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-[auto_120px]">
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-zinc-400">Válido por</legend>
            <div className="flex flex-wrap gap-2">
              {[1, 3, 7].map((d) => (
                <label
                  key={d}
                  className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-zinc-800 px-3 text-sm text-zinc-200 has-[:checked]:border-[#edcc36]/70 has-[:checked]:bg-[#edcc36]/10"
                >
                  <input type="radio" name="days" value={d} defaultChecked={d === (kind === 'trial' ? 3 : 1)} key={`${kind}-${d}`} className="h-4 w-4 accent-[#edcc36]" />
                  {d === 1 ? 'Hoy' : `${d} días`}
                </label>
              ))}
            </div>
            {err.days && <p className="mt-1 text-xs text-red-300">{err.days}</p>}
          </fieldset>
          <Field label="Entradas" name="entries" error={err.entries} hint="Veces que puede pasar">
            <input name="entries" type="number" min={1} max={60} defaultValue={1} key={kind} className={inputClass} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Precio cobrado ($)" name="price" error={err.price} hint="Vacío = sin cargo">
            <input name="price" inputMode="decimal" autoComplete="off" className={inputClass} placeholder="0" />
          </Field>
          <Field label="Cómo pagó" name="method" error={err.method}>
            <select name="method" defaultValue="" className={inputClass}>
              <option value="">—</option>
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
              <option value="mercadopago">Mercado Pago</option>
              <option value="card_terminal">Posnet</option>
              <option value="other">Otro</option>
            </select>
          </Field>
        </div>
        <p className="text-xs text-zinc-500">
          El cobro queda anotado en el pase. Todavía no se suma solo a la caja de Pagos.
        </p>
        <Notice state={state} />
        <div className="flex justify-end">
          <SubmitButton>Crear pase</SubmitButton>
        </div>
      </form>

      {state.ok && pass && link && last && (
        <div className="flex flex-col gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:flex-row sm:items-center">
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`QR del pase de ${last.name}`} className="h-36 w-36 shrink-0 rounded-xl bg-white p-1" />
          )}
          <div className="min-w-0 space-y-2">
            <p className="text-sm text-zinc-200">
              Pase de <strong className="text-white">{last.name}</strong> · código <span className="font-mono font-bold text-[#edcc36]">{pass.code}</span>
            </p>
            <p className="text-xs text-zinc-400">Puede pasar por el molinete mostrando este QR (que le saque una foto) o mandale el link: ahí lo tiene siempre a mano.</p>
            <PassShare
              link={link}
              phone={last.phone || null}
              holderName={last.name}
              gymName={gymName}
              validUntil={pass.validUntil}
              timezone={timezone}
              kind={last.kind}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/** Reglas de acceso del gimnasio (dueño / administrador). */
export function AccessSettingsForm({
  action,
  values,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>
  values: { guests: number; medical: boolean; stay: number; capacity: number }
}) {
  const [state, formAction] = useActionForm(action, {})
  const err = state.fieldErrors ?? {}
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-zinc-800 p-3">
        <input type="checkbox" name="medical" defaultChecked={values.medical} className="mt-0.5 h-5 w-5 shrink-0 accent-[#edcc36]" />
        <span>
          <span className="block text-sm font-semibold text-white">Pedir apto físico vigente para entrar por el molinete</span>
          <span className="block text-xs text-zinc-400">
            Si el socio no tiene apto cargado o está vencido, la tablet le dice “Tu apto físico está vencido. Pasá por recepción.”
            En recepción se le puede dar la entrada igual.
          </span>
        </span>
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Pases de invitado por socio, por mes" name="guests" error={err.guests} hint="0 = los socios no pueden invitar">
          <input name="guests" type="number" min={0} max={10} defaultValue={values.guests} className={inputClass} />
        </Field>
        <Field label="Capacidad del gimnasio (personas)" name="capacity" error={err.capacity} hint="Desde el 80 % se muestra “Lleno”">
          <input name="capacity" type="number" min={1} max={2000} defaultValue={values.capacity} className={inputClass} />
        </Field>
        <Field label="Cuánto se queda alguien en promedio (min)" name="stay" error={err.stay} hint="Para calcular cuántos hay adentro">
          <input name="stay" type="number" min={15} max={300} defaultValue={values.stay} className={inputClass} />
        </Field>
      </div>
      <Notice state={state} />
      <div className="flex justify-end">
        <SubmitButton>Guardar reglas</SubmitButton>
      </div>
    </form>
  )
}
