import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { ArrowLeft } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { createMember } from '@/features/admin/actions'
import { todayYMD, formatMoney } from '@/features/admin/format'
import { MemberForm } from '@/features/admin/MemberForm'

export const metadata: Metadata = { title: 'Nuevo socio' }

export default async function NewMemberPage({ params, searchParams }: PageProps<'/[org]/admin/socios/nuevo'>) {
  const { org: slug } = await params
  const sp = await searchParams
  const payerParam = typeof sp.titular === 'string' ? sp.titular : null

  const ctx = (await getAdminContext(slug))!
  if (!ctx.can('members.write')) return <p className="text-sm text-zinc-400">No tenés permiso para cargar socios.</p>

  const supabase = await createClient()
  const [{ data: plans }, payer] = await Promise.all([
    supabase
      .from('membership_plans')
      .select('id, name, price_cents, currency, max_members')
      .eq('org_id', ctx.org.id)
      .eq('active', true)
      .order('sort')
      .order('price_cents'),
    payerParam
      ? supabase
          .from('member_directory')
          .select('id, first_name, last_name, email, plan_name, is_payer')
          .eq('id', payerParam)
          .eq('org_id', ctx.org.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const payerRow = payer.data && payer.data.is_payer ? payer.data : null

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link
        href={(payerRow ? `/${slug}/admin/socios/${payerRow.id}` : `/${slug}/admin/socios`) as Route}
        className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold text-white">{payerRow ? 'Nuevo integrante' : 'Nuevo socio'}</h1>
        {payerRow && (
          <p className="text-sm text-zinc-400">
            Grupo familiar de{' '}
            <strong className="text-white">
              {payerRow.first_name} {payerRow.last_name}
            </strong>
            {payerRow.plan_name ? ` · ${payerRow.plan_name}` : ' · sin plan vigente'}
          </p>
        )}
      </div>
      <MemberForm
        mode="create"
        action={createMember.bind(null, slug)}
        payer={payerRow ? { id: payerRow.id!, email: payerRow.email } : null}
        plans={(plans ?? []).map((p) => ({
          id: p.id,
          label: `${p.name} · ${formatMoney(p.price_cents, p.currency)}${p.max_members > 1 ? ` · hasta ${p.max_members} personas` : ''}`,
        }))}
        today={todayYMD(ctx.org.timezone)}
      />
    </div>
  )
}
