import type { Metadata } from 'next'
import { Clock, X } from 'lucide-react'
import { getAdminContext, ROLE_LABELS } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { cancelInvitation, inviteStaff, resendInvitation, updateStaff } from '@/features/admin/actions'
import { fmtDate } from '@/features/admin/format'
import { InviteStaffForm, StaffRowForm } from '@/features/admin/TeamForms'
import { InviteButton } from '@/features/admin/MemberPanels'
import { Card } from '@/features/admin/ui'

export const metadata: Metadata = { title: 'Equipo' }

export default async function TeamPage({ params }: PageProps<'/[org]/admin/equipo'>) {
  const { org: slug } = await params
  const ctx = (await getAdminContext(slug))!
  if (!ctx.can('staff.manage')) return <p className="text-sm text-zinc-400">Solo el dueño o un administrador gestiona el equipo.</p>

  const supabase = await createClient()
  const [{ data: staff }, { data: invites }] = await Promise.all([
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
  ])

  const isOwner = ctx.staff.role === 'owner'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Equipo</h1>
        <p className="text-sm text-zinc-400">Profesores, recepción y administradores del gimnasio.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5">
          <Card title="Integrantes">
            <ul className="divide-y divide-zinc-900">
              {(staff ?? []).map((s) => {
                const locked = s.role === 'owner' || s.id === ctx.staff.id || (s.role === 'admin' && !isOwner)
                return (
                  <li key={s.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className={`truncate font-semibold ${s.active ? 'text-white' : 'text-zinc-500 line-through'}`}>
                        {s.display_name}
                        {s.id === ctx.staff.id && <span className="ml-2 text-xs font-normal text-zinc-500">(vos)</span>}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {ROLE_LABELS[s.role] ?? s.role} · desde {fmtDate(s.created_at)}
                      </p>
                    </div>
                    {!locked && (
                      <StaffRowForm
                        action={updateStaff.bind(null, slug, s.id)}
                        role={s.role}
                        active={s.active}
                        allowAdmin={isOwner}
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>

          {invites && invites.length > 0 && (
            <Card title="Invitaciones pendientes">
              <ul className="divide-y divide-zinc-900">
                {invites.map((i) => (
                  <li key={i.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">{i.display_name}</p>
                      <p className="flex items-center gap-1 truncate text-xs text-zinc-500">
                        <Clock className="h-3 w-3" aria-hidden="true" /> {ROLE_LABELS[i.role]} · {i.email}
                      </p>
                    </div>
                    <div className="flex items-start gap-2">
                      <InviteButton action={resendInvitation.bind(null, slug, i.email)} label="Reenviar" />
                      <form action={cancelInvitation.bind(null, slug, i.id)}>
                        <button
                          type="submit"
                          aria-label={`Cancelar invitación de ${i.display_name}`}
                          className="grid min-h-[44px] min-w-[44px] place-items-center rounded-xl border border-zinc-800 text-zinc-400 hover:border-red-500/50 hover:text-red-300"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <Card title="Invitar al equipo">
          <InviteStaffForm action={inviteStaff.bind(null, slug)} allowAdmin={isOwner} />
          <p className="mt-4 text-xs text-zinc-500">
            Le llega un email para entrar. Si esa persona ya tiene cuenta (por ejemplo, es socia), queda habilitada al
            instante.
          </p>
        </Card>
      </div>
    </div>
  )
}
