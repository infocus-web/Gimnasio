import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { Clock, X, Lock, ChevronDown } from 'lucide-react'
import { getAdminContext, ROLE_LABELS } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cancelInvitation, inviteStaff, resendInvitation, setTrainerSalesAccess, setTrainerScheduleAccess, updateStaff } from '@/features/admin/actions'
import { ActionButton } from '@/features/admin/ConfirmAction'
import { createStaffAccount, deleteStaff, resetStaffPassword, setStaffBlocked } from '@/features/admin/staff-account-actions'
import { fmtDate } from '@/features/admin/format'
import { InfoTip } from '@/components/InfoTip'
import { CreateStaffAccountForm, InviteStaffForm, StaffAccountActions, StaffRowForm } from '@/features/admin/TeamForms'
import { InviteButton } from '@/features/admin/MemberPanels'
import { ConfirmAction } from '@/features/admin/ConfirmAction'
import { approveStaffRequest, rejectStaffRequest } from '@/features/admin/padron-actions'
import { RequestCard, ShareLink, type RequestRow } from '@/features/admin/PadronReview'
import { fmtDateTime } from '@/features/admin/format'

export const metadata: Metadata = { title: 'Equipo' }

/** Tarjeta compacta de esta pantalla: cabecera baja, sin rellenos de más */
function Panel({ title, badge, hint, children }: { title: string; badge?: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#3a3a3a] bg-[#2a2a2a]">
      <div className="flex min-h-[44px] flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-[#3a3a3a] px-4 py-2">
        <h2 className="text-sm font-bold text-white">{title}</h2>
        {badge && (
          <span className="rounded-full bg-[#edcc36]/15 px-2 py-0.5 text-[11px] font-semibold text-[#edcc36]">{badge}</span>
        )}
        {hint && <p className="ml-auto text-[11px] text-zinc-500">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

// Interruptor de permiso compacto: etiqueta + switch (verde = activado). Tocarlo lo cambia.
const SWITCH_BUTTON =
  'group inline-flex h-8 items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 pl-3 pr-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white'

function SwitchVisual({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-zinc-700'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </span>
  )
}

export default async function TeamPage({ params }: PageProps<'/[org]/admin/equipo'>) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx) return null // sin sesión de staff: el layout ya muestra el aviso
  if (!ctx.can('staff.manage')) return <p className="text-sm text-zinc-400">Solo el dueño o un administrador gestiona el equipo.</p>

  const supabase = await createClient()
  const [{ data: staff }, { data: invites }, { data: requests }, { data: overrides }, { data: salesOverrides }] = await Promise.all([
    supabase
      .from('staff')
      .select('id, display_name, role, active, user_id, created_at')
      .eq('org_id', ctx.org.id)
      .order('active', { ascending: false })
      .order('display_name'),
    supabase
      .from('staff_invitations')
      .select('id, email, role, display_name, created_at')
      .eq('org_id', ctx.org.id)
      .is('accepted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('staff_requests')
      .select('id, first_name, last_name, document_id, phone, email, requested_role, message, created_at')
      .eq('org_id', ctx.org.id)
      .eq('status', 'pending')
      .order('created_at'),
    // Profes a los que se les sacó el manejo de su agenda (0040)
    supabase.from('staff_permission_overrides').select('staff_id, granted').eq('permission', 'schedule.own'),
    // Profes habilitados para vender en el mostrador (0047)
    supabase.from('staff_permission_overrides').select('staff_id, granted').eq('permission', 'sales.write'),
  ])
  const scheduleBlocked = new Set((overrides ?? []).filter((o) => !o.granted).map((o) => o.staff_id))
  const canSell = new Set((salesOverrides ?? []).filter((o) => o.granted).map((o) => o.staff_id))
  const h = await headers()
  const padronUrl = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}/${slug}/padron`

  const isOwner = ctx.staff.role === 'owner'
  const keyMissing = !process.env.SUPABASE_SECRET_KEY

  // El email vive en auth.users (no en staff): se lee con la clave secreta, solo del lado del servidor
  const emails = new Map<string, string>()
  if (!keyMissing) {
    const admin = createAdminClient()
    await Promise.all(
      (staff ?? [])
        .filter((s) => s.user_id)
        .map(async (s) => {
          const { data } = await admin.auth.admin.getUserById(s.user_id!)
          if (data?.user?.email) emails.set(s.user_id!, data.user.email)
        }),
    )
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-xl font-extrabold text-white">Equipo</h1>
        <p className="text-xs text-zinc-500">
          Entran por <strong className="font-semibold text-zinc-300">/equipo</strong> · link «Acceso equipo» al pie de la web
        </p>
      </header>

      {keyMissing && (
        <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          Falta cargar <code>SUPABASE_SECRET_KEY</code> en Vercel: hasta entonces no se pueden crear cuentas, cambiar contraseñas,
          bloquear accesos ni enviar invitaciones.
        </p>
      )}

      <Panel
        title="Padrón del equipo"
        badge={requests?.length ? `${requests.length} para aprobar` : undefined}
        hint="Compartilo con los profes: completan sus datos y vos los aprobás acá"
      >
        <div className="p-3">
          <ShareLink url={padronUrl} />
        </div>
        {requests && requests.length > 0 && (
          <ul className="divide-y divide-zinc-800/70 border-t border-zinc-800/70 px-4">
            {requests.map((r) => (
              <RequestCard
                key={r.id}
                r={r as RequestRow}
                allowAdmin={isOwner}
                approve={approveStaffRequest.bind(null, slug, r.id)}
                reject={rejectStaffRequest.bind(null, slug, r.id)}
                when={fmtDateTime(r.created_at)}
              />
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Panel title="Integrantes" badge={`${(staff ?? []).filter((x) => x.active).length}`}>
            <ul className="divide-y divide-zinc-800/70 px-4">
              {(staff ?? []).map((s) => {
                const locked = s.role === 'owner' || s.id === ctx.staff.id || (s.role === 'admin' && !isOwner)
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                    <div className="min-w-0 flex-1 basis-44" title={`En el equipo desde ${fmtDate(s.created_at)}`}>
                      <p className={`flex items-center gap-1.5 truncate text-sm font-semibold ${s.active ? 'text-white' : 'text-zinc-500'}`}>
                        <span className="truncate">{s.display_name}</span>
                        {s.id === ctx.staff.id && <span className="text-xs font-normal text-zinc-500">(vos)</span>}
                        {!s.active && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded border border-red-500/30 px-1 text-[10px] font-semibold uppercase text-red-300">
                            <Lock className="h-2.5 w-2.5" aria-hidden="true" /> Bloqueado
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-zinc-500">
                        {locked || !s.active ? `${ROLE_LABELS[s.role] ?? s.role} · ` : ''}
                        {(s.user_id && emails.get(s.user_id)) || `desde ${fmtDate(s.created_at)}`}
                      </p>
                    </div>
                    {s.role === 'trainer' && s.active && (
                      <div className="flex items-center gap-1.5">
                        <ActionButton
                          action={setTrainerScheduleAccess.bind(null, slug, s.id, scheduleBlocked.has(s.id))}
                          ariaPressed={!scheduleBlocked.has(s.id)}
                          ariaLabel={`${s.display_name} maneja su agenda`}
                          title="Maneja su agenda: horarios, cupos, anotar socios y cancelar sus clases"
                          className={SWITCH_BUTTON}
                        >
                          Agenda <SwitchVisual on={!scheduleBlocked.has(s.id)} />
                        </ActionButton>
                        <ActionButton
                          action={setTrainerSalesAccess.bind(null, slug, s.id, !canSell.has(s.id))}
                          ariaPressed={canSell.has(s.id)}
                          ariaLabel={`${s.display_name} puede vender en el mostrador`}
                          title="Vende productos en el mostrador (no ve la caja ni los pagos)"
                          className={SWITCH_BUTTON}
                        >
                          Ventas <SwitchVisual on={canSell.has(s.id)} />
                        </ActionButton>
                        <InfoTip label="Permisos del profesor">
                          <p><strong>Agenda:</strong> maneja sus horarios y cupos, anota socios y cancela sus clases.</p>
                          <p><strong>Ventas:</strong> vende productos en el mostrador. No ve la caja ni los pagos.</p>
                          <p>Verde = activado. Tocá el interruptor para cambiarlo.</p>
                        </InfoTip>
                      </div>
                    )}
                    {!locked && (
                      <div className="flex items-center gap-1">
                        {s.active && <StaffRowForm action={updateStaff.bind(null, slug, s.id)} role={s.role} allowAdmin={isOwner} />}
                        <StaffAccountActions
                          name={s.display_name}
                          active={s.active}
                          resetAction={resetStaffPassword.bind(null, slug, s.id)}
                          blockAction={setStaffBlocked.bind(null, slug, s.id, s.active)}
                          deleteAction={deleteStaff.bind(null, slug, s.id)}
                        />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </Panel>

          {invites && invites.length > 0 && (
            <Panel title="Invitaciones pendientes" badge={`${invites.length}`}>
              <ul className="divide-y divide-zinc-800/70 px-4">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{i.display_name}</p>
                      <p className="flex items-center gap-1 truncate text-xs text-zinc-500">
                        <Clock className="h-3 w-3" aria-hidden="true" /> {ROLE_LABELS[i.role]} · {i.email}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <InviteButton action={resendInvitation.bind(null, slug, i.email)} label="Reenviar" />
                      <ConfirmAction
                        action={cancelInvitation.bind(null, slug, i.id)}
                        variant="icon"
                        ariaLabel={`Cancelar invitación de ${i.display_name}`}
                        confirmText="El link del mail deja de funcionar."
                        yesLabel="Sí, cancelar invitación"
                        className="flex flex-col items-end gap-1"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </ConfirmAction>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <Panel title="Sumar al equipo">
          <div className="space-y-3 p-4">
            <CreateStaffAccountForm action={createStaffAccount.bind(null, slug)} allowAdmin={isOwner} />
            <details className="group border-t border-zinc-800/70 pt-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-zinc-400 hover:text-white">
                O invitar por email (entra sin contraseña)
                <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="pt-3">
                <InviteStaffForm action={inviteStaff.bind(null, slug)} allowAdmin={isOwner} />
              </div>
            </details>
          </div>
        </Panel>
      </div>
    </div>
  )
}
