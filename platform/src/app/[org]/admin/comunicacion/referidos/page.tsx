import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { getAdminContext } from '@/features/admin/context'
import { Card } from '@/features/admin/ui'
import { fmtDate } from '@/features/admin/format'
import { createClient } from '@/lib/supabase/server'
import { ReferralForm } from '@/features/engagement/ReferralForm'
import { applyReferral, endFriendPair, saveFriendPromo } from '@/features/engagement/actions'
import { FriendPromoForm, type FriendPromoSettings } from '@/features/engagement/FriendPromoForm'
import { ConfirmAction } from '@/features/admin/ConfirmAction'
import type { AdminData } from '@/features/engagement/shared'

export const metadata: Metadata = { title: 'Referidos' }

export default async function ReferidosPage({ params }: PageProps<'/[org]/admin/comunicacion/referidos'>) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx || !ctx.can('members.write')) return null

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('engagement_admin_get', { p_org: ctx.org.id })
  if (error || !data) {
    return (
      <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
        No pudimos cargar los referidos. Recargá la página en un rato.
      </p>
    )
  }
  const d = data as unknown as AdminData
  const tz = ctx.org.timezone
  const { data: fp } = await supabase.rpc('friend_promo_admin', { p_org: ctx.org.id })
  const promo = (fp ?? null) as {
    settings: FriendPromoSettings
    pairs: { id: string; kind: 'cross' | 'duo' | 'welcome'; created_at: string; ended_at: string | null; referrer_id: string; referrer: string; friend_id: string; friend: string; active: boolean }[]
  } | null
  const KIND = { cross: 'Actividades cruzadas', duo: 'Precio de a dos', welcome: 'Bienvenida' } as const
  const canManage = ctx.can('automations.manage') || ctx.can('org.manage')

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {promo && canManage && (
        <Card title="Traé a un amigo/a: promos">
          <FriendPromoForm action={saveFriendPromo.bind(null, slug)} settings={promo.settings} rewardDays={d.rules?.referral_reward_days ?? 15} />
        </Card>
      )}
      {promo && (
        <Card title="Parejas con promo">
          {promo.pairs.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
              Todavía nadie se inscribió con una promo de amigo/a.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-900">
              {promo.pairs.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span className="min-w-0">
                    <Link href={`/${slug}/admin/socios/${x.friend_id}` as Route} className="font-semibold text-white hover:text-[#edcc36]">
                      {x.friend}
                    </Link>
                    <span className="text-zinc-400"> invitado/a por </span>
                    <Link href={`/${slug}/admin/socios/${x.referrer_id}` as Route} className="text-zinc-200 hover:text-[#edcc36]">
                      {x.referrer}
                    </Link>
                    <span className="block text-xs text-zinc-500">
                      {KIND[x.kind]} · {fmtDate(x.created_at, tz)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {x.ended_at ? (
                      <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">Terminada</span>
                    ) : x.active ? (
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-200">Vigente</span>
                    ) : (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-200">
                        En pausa: alguno no tiene el plan al día
                      </span>
                    )}
                    {!x.ended_at && x.kind !== 'welcome' && canManage && (
                      <ConfirmAction
                        action={endFriendPair.bind(null, slug, x.id)}
                        confirmText="Dejan de tener el beneficio de la promo (los planes siguen igual)."
                        yesLabel="Sí, terminar"
                        variant="link"
                      >
                        Terminar
                      </ConfirmAction>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <Card title="Registrar referido">
        <ReferralForm members={d.new_members} action={applyReferral.bind(null, slug)} rewardDays={d.rules?.referral_reward_days ?? 15} />
      </Card>
      <Card title="Últimos referidos">
        {d.referrals.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
            Todavía no hay referidos registrados.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-900">
            {d.referrals.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span className="min-w-0">
                  <Link href={`/${slug}/admin/socios/${r.referred_id}` as Route} className="font-semibold text-white hover:text-[#edcc36]">
                    {r.referred}
                  </Link>
                  <span className="text-zinc-400"> recomendado por </span>
                  <Link href={`/${slug}/admin/socios/${r.referrer_id}` as Route} className="text-zinc-200 hover:text-[#edcc36]">
                    {r.referrer}
                  </Link>
                  <span className="block text-xs text-zinc-500">
                    {fmtDate(r.created_at, tz)} · código {r.code}
                  </span>
                </span>
                {r.status === 'rewarded' ? (
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-200">
                    +{r.reward_days} días a cada uno
                  </span>
                ) : (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-200">
                    Espera su primer pago
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
