import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { Ticket, UserPlus, Users } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/site-url'
import { Card } from '@/features/admin/ui'
import { ConfirmAction } from '@/features/admin/ConfirmAction'
import { InfoTip } from '@/components/InfoTip'
import { fmtDateTime, formatMoney } from '@/features/admin/format'
import { AccessSettingsForm, IssuePassForm, PassShare } from '@/features/access-plus/DayPassForms'
import { issueDayPass, revokeDayPass, saveAccessSettings } from '@/features/access-plus/actions'
import { PASS_KIND, PASS_STATUS, passStatus, type PassStatus } from '@/features/access-plus/labels'

export const metadata: Metadata = { title: 'Pases e invitados' }

const FILTERS: { key: string; label: string; match: PassStatus[] }[] = [
  { key: 'vigentes', label: 'Vigentes', match: ['valid', 'upcoming'] },
  { key: 'usados', label: 'Usados', match: ['used'] },
  { key: 'vencidos', label: 'Vencidos', match: ['expired'] },
  { key: 'anulados', label: 'Anulados', match: ['revoked'] },
  { key: 'todos', label: 'Todos', match: ['valid', 'upcoming', 'used', 'expired', 'revoked'] },
]

const PAY: Record<string, string> = { cash: 'efectivo', transfer: 'transferencia', mercadopago: 'Mercado Pago', card_terminal: 'posnet', other: 'otro' }

export default async function PassesPage({ params, searchParams }: PageProps<'/[org]/admin/pases'>) {
  const { org: slug } = await params
  const sp = await searchParams
  const ctx = await getAdminContext(slug)
  if (!ctx) return null // sin sesión de staff: el layout ya muestra el aviso
  if (!ctx.can('checkins.manage') && !ctx.can('org.manage')) {
    return <p className="text-sm text-zinc-400">Tu rol no tiene acceso a los pases.</p>
  }
  const canIssue = ctx.can('checkins.manage')
  const canRules = ctx.can('org.manage')
  const canNewMember = ctx.can('members.write')
  const tz = ctx.org.timezone
  const filter = FILTERS.find((f) => f.key === sp.ver) ?? FILTERS[0]!

  const supabase = await createClient()
  const [{ data: passes, error }, { data: settings }] = await Promise.all([
    supabase
      .from('day_passes')
      .select('id, code, kind, holder_name, holder_phone, holder_email, holder_document, invited_by_member, valid_from, valid_until, max_entries, entries_used, price_cents, payment_method, created_at, revoked_at')
      .eq('org_id', ctx.org.id)
      .order('created_at', { ascending: false })
      .limit(300),
    supabase.from('access_settings').select('*').eq('org_id', ctx.org.id).maybeSingle(),
  ])
  const inviterIds = [...new Set((passes ?? []).map((p) => p.invited_by_member).filter((x): x is string => !!x))]
  const { data: inviters } = inviterIds.length
    ? await supabase.from('members').select('id, first_name, last_name').in('id', inviterIds)
    : { data: [] as { id: string; first_name: string; last_name: string }[] }
  const inviterName = new Map((inviters ?? []).map((m) => [m.id, `${m.first_name} ${m.last_name}`.trim()]))

  const now = Date.now()
  const rows = (passes ?? []).map((p) => ({ ...p, status: passStatus(p, now) }))
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, rows.filter((r) => f.match.includes(r.status)).length]))
  const shown = rows.filter((r) => filter.match.includes(r.status))
  const base = `${await siteUrl()}/${slug}`

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Pases e invitados</h1>
        <p className="text-sm text-zinc-400">
          Pases para quien no es socio: entra con un QR por el molinete o por recepción, sin bajarse la app.
        </p>
      </div>

      {canIssue && (
        <Card title="Emitir pase">
          <IssuePassForm action={issueDayPass.bind(null, slug)} baseUrl={base} gymName={ctx.org.name} timezone={tz} />
        </Card>
      )}

      <Card title="Pases">
        <nav aria-label="Filtrar pases" className="-mx-1 mb-3 flex gap-1 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={`/${slug}/admin/pases?ver=${f.key}` as Route}
              aria-current={f.key === filter.key ? 'page' : undefined}
              className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm ${
                f.key === filter.key ? 'bg-[#edcc36] font-bold text-black' : 'border border-zinc-800 text-zinc-300 hover:border-zinc-600'
              }`}
            >
              {f.label}
              <span className={`text-xs ${f.key === filter.key ? 'text-black/70' : 'text-zinc-500'}`}>{counts[f.key]}</span>
            </Link>
          ))}
        </nav>

        {error ? (
          <p role="alert" className="text-sm text-red-300">
            No pudimos cargar los pases. Recargá la página.
          </p>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-zinc-500">
            <Ticket className="h-8 w-8 text-zinc-700" aria-hidden="true" />
            {filter.key === 'vigentes' ? 'No hay pases vigentes. Creá uno arriba o esperá que un socio invite a alguien.' : 'No hay pases en esta lista.'}
          </div>
        ) : (
          <ul className="divide-y divide-zinc-900">
            {shown.map((p) => {
              const st = PASS_STATUS[p.status]
              const [first, ...rest] = p.holder_name.split(' ')
              const convert = `/${slug}/admin/socios/nuevo?${new URLSearchParams({
                nombre: first ?? '',
                apellido: rest.join(' '),
                ...(p.holder_document ? { dni: p.holder_document } : {}),
                ...(p.holder_phone ? { telefono: p.holder_phone } : {}),
                ...(p.holder_email ? { email: p.holder_email } : {}),
              }).toString()}`
              return (
                <li key={p.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-white">
                        {p.holder_name}
                        <span className="ml-2 font-mono text-xs text-zinc-500">{p.code}</span>
                      </p>
                      <p className="text-xs text-zinc-400">
                        {[
                          PASS_KIND[p.kind],
                          p.invited_by_member && `invitado por ${inviterName.get(p.invited_by_member) ?? 'un socio'}`,
                          `válido hasta ${fmtDateTime(p.valid_until, tz)}`,
                          `${p.entries_used}/${p.max_entries} ${p.max_entries === 1 ? 'entrada' : 'entradas'}`,
                          p.price_cents ? `${formatMoney(p.price_cents)}${p.payment_method ? ` (${PAY[p.payment_method] ?? p.payment_method})` : ''}` : null,
                          p.holder_document && `DNI ${p.holder_document}`,
                          p.holder_phone,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold ${st.className}`}>{st.label}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(p.status === 'valid' || p.status === 'upcoming') && (
                      <PassShare
                        link={`${base}/pase/${p.code}`}
                        phone={p.holder_phone}
                        holderName={p.holder_name}
                        gymName={ctx.org.name}
                        validUntil={p.valid_until}
                        timezone={tz}
                        kind={p.kind}
                        compact
                      />
                    )}
                    {canNewMember && p.status !== 'revoked' && (
                      <Link
                        href={convert as Route}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#edcc36]/40 px-3 text-sm font-semibold text-[#edcc36] hover:bg-[#edcc36]/10"
                      >
                        <UserPlus className="h-4 w-4" aria-hidden="true" /> Convertir en socio
                      </Link>
                    )}
                    {canNewMember && p.status !== 'revoked' && (
                      <InfoTip label="Convertir en socio">
                        <p>Abre el alta de socio nuevo con los datos de este invitado ya cargados (nombre, DNI, teléfono, email).</p>
                        <p>Revisalos, elegí el plan si querés y guardá. <strong>No registra ningún cobro</strong>: eso se hace aparte, desde la ficha del socio.</p>
                      </InfoTip>
                    )}
                    {canIssue && !p.revoked_at && p.status !== 'expired' && (
                      <ConfirmAction
                        action={revokeDayPass.bind(null, slug, p.id)}
                        confirmText="El QR deja de funcionar."
                        yesLabel="Sí, anular"
                        variant="danger"
                        className="space-y-2"
                      >
                        Anular
                      </ConfirmAction>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {canRules && (
        <Card title="Reglas de acceso">
          <p className="mb-4 flex items-start gap-2 text-sm text-zinc-400">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#edcc36]" aria-hidden="true" />
            Se aplican en el molinete de musculación. El horario de cada plan se configura en Pagos → Planes.
          </p>
          <AccessSettingsForm
            action={saveAccessSettings.bind(null, slug)}
            values={{
              guests: settings?.guest_passes_per_month ?? 1,
              medical: settings?.require_medical_cert ?? false,
              stay: settings?.avg_stay_minutes ?? 75,
              capacity: settings?.capacity ?? 60,
            }}
          />
        </Card>
      )}
    </div>
  )
}
