import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata, Route } from 'next'
import { ArrowLeft, Smartphone, UserPlus, Crown, Info } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { assignPlan, inviteMemberToApp, updateMember } from '@/features/admin/actions'
import { recordPayment } from '@/features/admin/billing-actions'
import { assignTrainer } from '@/features/admin/coach-actions'
import { TrainerSelectForm } from '@/features/admin/CoachForms'
import { METHOD_LABELS, PaymentForm } from '@/features/admin/PaymentForms'
import { fmtDate, fmtDateTime, formatMoney, planState, PLAN_STATE_UI, todayYMD } from '@/features/admin/format'
import { MemberForm } from '@/features/admin/MemberForm'
import { AssignPlanForm, InviteButton } from '@/features/admin/MemberPanels'
import { Card } from '@/features/admin/ui'

export const metadata: Metadata = { title: 'Ficha de socio' }

export default async function MemberDetailPage({ params, searchParams }: PageProps<'/[org]/admin/socios/[memberId]'>) {
  const { org: slug, memberId } = await params
  const sp = await searchParams
  const aviso = typeof sp.aviso === 'string' ? sp.aviso.slice(0, 300) : null

  const ctx = (await getAdminContext(slug))!
  if (!ctx.can('members.read')) return <p className="text-sm text-zinc-400">No tenés permiso para ver socios.</p>

  const supabase = await createClient()
  const { data: m } = await supabase
    .from('member_directory')
    .select('*')
    .eq('id', memberId)
    .eq('org_id', ctx.org.id)
    .maybeSingle()
  if (!m) notFound()

  const [{ data: staffList }, { data: tc }] = await Promise.all([
    supabase.from('staff').select('id, display_name, role').eq('org_id', ctx.org.id).eq('active', true).order('display_name'),
    supabase.from('trainer_clients').select('trainer_id').eq('member_id', memberId).maybeSingle(),
  ])
  const [family, checkins, plans, payments] = await Promise.all([
    m.billing_account_id
      ? supabase
          .from('member_directory')
          .select('id, first_name, last_name, is_payer, has_app, status')
          .eq('billing_account_id', m.billing_account_id)
          .neq('status', 'archived')
          .order('is_payer', { ascending: false })
          .order('first_name')
      : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string; is_payer: boolean; has_app: boolean; status: string }[] }),
    supabase
      .from('checkins')
      .select('id, created_at, allowed, reason, method')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('membership_plans')
      .select('id, name, price_cents, currency, max_members')
      .eq('org_id', ctx.org.id)
      .eq('active', true)
      .order('sort')
      .order('price_cents'),
    m.billing_account_id && ctx.can('billing.read')
      ? supabase
          .from('payment_ledger')
          .select('id, paid_at, amount_cents, currency, provider, status, plan_name, note')
          .eq('billing_account_id', m.billing_account_id)
          .order('paid_at', { ascending: false })
          .limit(12)
      : Promise.resolve({ data: [] as { id: string | null; paid_at: string | null; amount_cents: number | null; currency: string | null; provider: string | null; status: string | null; plan_name: string | null; note: string | null }[] }),
  ])

  const st = PLAN_STATE_UI[planState(m as { membership_status: string | null; current_period_end: string | null; status: string })]
  const payer = (family.data ?? []).find((f) => f.is_payer)
  const canWrite = ctx.can('members.write')
  const canBill = ctx.can('billing.write')
  const planOptions = (plans.data ?? []).map((p) => ({
    id: p.id,
    label: `${p.name} · ${formatMoney(p.price_cents, p.currency)}${p.max_members > 1 ? ` · hasta ${p.max_members}` : ''}`,
  }))

  return (
    <div className="space-y-5">
      <Link href={`/${slug}/admin/socios` as Route} className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Socios
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold text-white">
          {m.first_name} {m.last_name}
        </h1>
        <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${st.className}`}>{st.label}</span>
        {m.status === 'archived' && (
          <span className="rounded-md border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">Archivado</span>
        )}
      </div>

      {aviso && (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-[#edcc36]/30 bg-[#edcc36]/10 p-3 text-sm text-zinc-100">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#edcc36]" aria-hidden="true" /> {aviso}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card title="Datos">
            <MemberForm
              mode="edit"
              readOnly={!canWrite}
              action={updateMember.bind(null, slug, memberId)}
              values={{
                firstName: m.first_name ?? '',
                lastName: m.last_name ?? '',
                email: m.email,
                phone: m.phone,
                documentId: m.document_id,
                birthDate: m.birth_date,
                medicalNotes: m.medical_notes,
                status: m.status ?? 'active',
              }}
            />
          </Card>

          <Card title="Plan">
            <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-zinc-500">Plan</dt>
                <dd className="font-semibold text-white">{m.plan_name ?? 'Sin plan'}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Vence</dt>
                <dd className="font-semibold tabular-nums text-white">{fmtDate(m.current_period_end)}</dd>
              </div>
              {m.credits_remaining != null && (
                <div>
                  <dt className="text-xs text-zinc-500">Clases restantes</dt>
                  <dd className="font-semibold tabular-nums text-white">{m.credits_remaining}</dd>
                </div>
              )}
            </dl>
            {m.is_payer || !m.billing_account_id ? (
              canBill ? (
                <AssignPlanForm
                  action={assignPlan.bind(null, slug, memberId)}
                  plans={planOptions}
                  today={todayYMD(ctx.org.timezone)}
                  currentPlanId={m.plan_id}
                />
              ) : null
            ) : payer ? (
              <p className="text-sm text-zinc-400">
                El plan lo maneja el titular del grupo:{' '}
                <Link href={`/${slug}/admin/socios/${payer.id}` as Route} className="font-semibold text-[#edcc36]">
                  {payer.first_name} {payer.last_name}
                </Link>
              </p>
            ) : null}
          </Card>
          {canBill && (
            <div id="cobrar" className="scroll-mt-24">
              <Card title="Registrar cobro">
                {m.is_payer || !m.billing_account_id ? null : (
                  <p className="mb-3 text-xs text-zinc-500">El cobro se imputa a la cuenta del titular del grupo familiar.</p>
                )}
                <PaymentForm
                  action={recordPayment.bind(null, slug, memberId)}
                  plans={(plans.data ?? []).map((p) => ({ id: p.id, label: `${p.name} · ${formatMoney(p.price_cents, p.currency)}`, priceCents: p.price_cents }))}
                  currentPlanId={m.plan_id}
                />
              </Card>
            </div>
          )}

          {ctx.can('billing.read') && (
            <Card title="Pagos">
              {payments.data?.length ? (
                <ul className="divide-y divide-zinc-900 text-sm">
                  {payments.data.map((p) => (
                    <li key={p.id} className={`flex items-center justify-between gap-3 py-2 ${p.status === 'succeeded' ? '' : 'opacity-50'}`}>
                      <span className="min-w-0">
                        <span className="tabular-nums text-zinc-200">{fmtDate(p.paid_at)}</span>
                        <span className="block truncate text-xs text-zinc-500">
                          {[p.plan_name, METHOD_LABELS[p.provider ?? ''] ?? p.provider, p.status !== 'succeeded' && 'anulado', p.note].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className={`tabular-nums font-semibold ${p.status === 'succeeded' ? 'text-white' : 'line-through text-zinc-500'}`}>
                        {formatMoney(Number(p.amount_cents), p.currency ?? 'ARS')}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">Todavía no hay pagos registrados.</p>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card title="Profesor a cargo">
            {canWrite ? (
              <TrainerSelectForm
                action={assignTrainer.bind(null, slug, memberId)}
                trainers={(staffList ?? []).map((t) => ({ id: t.id, name: t.display_name }))}
                current={tc?.trainer_id ?? null}
              />
            ) : (
              <p className="text-sm text-zinc-400">
                {(staffList ?? []).find((t) => t.id === tc?.trainer_id)?.display_name ?? 'Sin profesor asignado'}
              </p>
            )}
            <p className="mt-2 text-xs text-zinc-500">El profe ve su progreso y le asigna rutinas.</p>
          </Card>

          <Card title="Acceso a la app">
            {m.has_app ? (
              <p className="flex items-center gap-2 text-sm text-emerald-200">
                <Smartphone className="h-4 w-4" aria-hidden="true" /> Tiene cuenta y puede entrar a la app.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-zinc-400">
                  {m.email ? (
                    <>
                      Todavía no entró. La invitación le llega a <strong className="text-white">{m.email}</strong>.
                    </>
                  ) : (
                    'Cargale un email en Datos para poder invitarlo.'
                  )}
                </p>
                {canWrite && m.email && <InviteButton action={inviteMemberToApp.bind(null, slug, memberId)} />}
              </div>
            )}
          </Card>

          <Card
            title="Grupo familiar"
            action={
              canWrite && m.is_payer ? (
                <Link
                  href={`/${slug}/admin/socios/nuevo?titular=${memberId}` as Route}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#edcc36]"
                >
                  <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Agregar integrante
                </Link>
              ) : undefined
            }
          >
            {(family.data ?? []).length > 1 ? (
              <ul className="divide-y divide-zinc-900">
                {(family.data ?? []).map((f) => (
                  <li key={f.id}>
                    <Link
                      href={`/${slug}/admin/socios/${f.id}` as Route}
                      aria-current={f.id === memberId ? 'page' : undefined}
                      className={`flex items-center justify-between gap-2 py-2 text-sm ${f.id === memberId ? 'text-[#edcc36]' : 'text-zinc-200 hover:text-white'}`}
                    >
                      <span className="truncate">
                        {f.first_name} {f.last_name}
                      </span>
                      {f.is_payer && (
                        <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                          <Crown className="h-3 w-3" aria-hidden="true" /> Titular
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500">
                {m.is_payer ? 'Sin integrantes. Con un plan familiar podés sumar hijos o pareja.' : 'No pertenece a un grupo familiar.'}
              </p>
            )}
          </Card>

          <Card title="Últimas entradas">
            {checkins.data?.length ? (
              <ul className="space-y-1.5 text-sm">
                {checkins.data.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2">
                    <span className="tabular-nums text-zinc-300">{fmtDateTime(c.created_at)}</span>
                    <span className={c.allowed ? 'text-emerald-300' : 'text-red-300'}>{c.allowed ? 'Ingresó' : 'Rechazado'}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500">Sin entradas registradas.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
