'use client'

import { Fingerprint, ScanFace, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { FamilyMember, MembershipSummary } from '@/types/platform'

/**
 * Pase sin QR: el socio entra con la cara/palma/huella en el lector ZKTeco.
 * Acá solo ve si su acceso está habilitado y qué hacer si no.
 * Misma regla que el lector: se bloquea el día que vence o si queda debiendo.
 */
export function AccessStatusCard({
  membership,
  member,
  family,
  activeMemberId,
  onSelectMember,
  onPay,
  loading,
}: {
  membership: MembershipSummary | null
  member?: FamilyMember
  family: FamilyMember[]
  activeMemberId: string
  onSelectMember: (id: string) => void
  onPay: () => void
  loading: boolean
}) {
  if (loading || !membership) {
    return <div className="h-64 animate-pulse rounded-3xl border border-zinc-800 bg-zinc-950" aria-busy="true" />
  }

  const ends = new Date(membership.currentPeriodEnd)
  const endsLabel = ends.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const allowed = (membership.status === 'active' || membership.status === 'trialing') && ends.getTime() > Date.now()
  const noPlan = membership.planName === 'Sin membresía'
  const daysLeft = Math.ceil((ends.getTime() - Date.now()) / 86_400_000)

  const reason = noPlan
    ? 'No tenés un plan activo.'
    : membership.status === 'past_due'
      ? 'Tenés un pago pendiente.'
      : membership.status === 'paused'
        ? 'Tu plan está pausado.'
        : `Tu plan venció el ${endsLabel}.`

  return (
    <div className="space-y-4">
      {family.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Socio">
          {family.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={f.id === activeMemberId}
              onClick={() => onSelectMember(f.id)}
              className={`min-h-[44px] shrink-0 rounded-xl border px-4 text-sm font-semibold ${
                f.id === activeMemberId ? 'border-[#edcc36] bg-[#edcc36] text-black' : 'border-zinc-800 bg-zinc-950 text-zinc-300'
              }`}
            >
              {f.firstName}
            </button>
          ))}
        </div>
      )}

      <section
        className={`rounded-3xl border p-6 text-center ${
          allowed
            ? 'border-[#edcc36]/60 bg-zinc-950 shadow-[0_0_30px_-8px_rgba(237,204,54,0.35)]'
            : 'border-red-500/50 bg-red-950/20'
        }`}
        aria-live="polite"
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          {member ? `${member.firstName} ${member.lastName}` : 'Tu acceso'}
        </p>

        {allowed ? (
          <>
            <ShieldCheck className="mx-auto mt-4 h-16 w-16 text-[#edcc36]" aria-hidden="true" />
            <h1 className="mt-3 text-2xl font-extrabold text-white">Acceso habilitado</h1>
            <p className="mt-1 text-sm text-zinc-300">
              {membership.planName} · hasta el {endsLabel}
              {daysLeft <= 5 ? ` (${daysLeft === 1 ? 'vence mañana' : `quedan ${daysLeft} días`})` : ''}
            </p>
          </>
        ) : (
          <>
            <ShieldAlert className="mx-auto mt-4 h-16 w-16 text-red-400" aria-hidden="true" />
            <h1 className="mt-3 text-2xl font-extrabold text-white">Acceso bloqueado</h1>
            <p className="mt-1 text-sm text-red-200">{reason} El molinete no te va a dejar pasar hasta que lo regularices.</p>
            <button
              type="button"
              onClick={onPay}
              className="mt-4 min-h-[48px] w-full rounded-2xl bg-[#edcc36] px-4 text-base font-extrabold text-black"
            >
              Cómo pagar
            </button>
          </>
        )}
      </section>

      <section className="space-y-3 rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-300">Cómo entrar</h2>
        <div className="flex items-start gap-3">
          <ScanFace className="mt-0.5 h-6 w-6 shrink-0 text-[#edcc36]" aria-hidden="true" />
          <p className="text-sm text-zinc-300">
            Parate frente al lector del molinete y mirá a la pantalla. También podés usar la palma de la mano.
          </p>
        </div>
        <div className="flex items-start gap-3">
          <Fingerprint className="mt-0.5 h-6 w-6 shrink-0 text-[#edcc36]" aria-hidden="true" />
          <p className="text-sm text-zinc-300">
            ¿Todavía no registraste tu cara? Pedilo en el gimnasio: se hace una sola vez y tarda un minuto.
          </p>
        </div>
      </section>
    </div>
  )
}
