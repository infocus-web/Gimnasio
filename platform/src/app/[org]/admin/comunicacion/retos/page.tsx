import type { Metadata } from 'next'
import { Trophy } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { Card } from '@/features/admin/ui'
import { ActionButton, ConfirmAction } from '@/features/admin/ConfirmAction'
import { todayYMD } from '@/features/admin/format'
import { createClient } from '@/lib/supabase/server'
import { ChallengeForm } from '@/features/engagement/ChallengeForm'
import { cancelChallenge, saveChallenge, settleChallenge } from '@/features/engagement/retention-actions'
import { fmtAmount, fmtDay, METRICS, type AdminChallenge } from '@/features/engagement/retention'

export const metadata: Metadata = { title: 'Retos' }

const PHASE: Record<AdminChallenge['phase'], { label: string; tone: string }> = {
  live: { label: 'En curso', tone: 'border-emerald-500/40 text-emerald-200' },
  upcoming: { label: 'Próximo', tone: 'border-sky-500/40 text-sky-200' },
  to_settle: { label: 'Terminado · falta cerrar', tone: 'border-amber-500/40 text-amber-200' },
  settled: { label: 'Cerrado', tone: 'border-zinc-600 text-zinc-300' },
  canceled: { label: 'Cancelado', tone: 'border-zinc-700 text-zinc-500' },
}

export default async function RetosPage({ params }: PageProps<'/[org]/admin/comunicacion/retos'>) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx || !ctx.can('members.write')) return null
  const canManage = ctx.can('automations.manage') || ctx.can('org.manage')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('challenge_admin_list', { p_org: ctx.org.id })
  if (error) {
    return (
      <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
        No pudimos cargar los retos. Recargá la página en un rato.
      </p>
    )
  }
  const list = (data ?? []) as unknown as AdminChallenge[]
  const today = todayYMD(ctx.org.timezone)
  const monthStart = `${today.slice(0, 8)}01`
  const [y, m] = today.split('-').map(Number) as [number, number]
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
      <Card title="Nuevo reto">
        {canManage ? (
          <>
            <p className="mb-4 text-sm text-zinc-400">
              Los socios se anotan desde la app (Yo → Retos), ven su avance y el ranking. Se mide con datos reales: entradas al gimnasio,
              entrenamientos registrados, kilos o clases. Al terminar, los que llegaron a la meta reciben los días de premio solos.
            </p>
            <ChallengeForm action={saveChallenge.bind(null, slug, null)} monthStart={monthStart} monthEnd={monthEnd} />
          </>
        ) : (
          <p className="text-sm text-zinc-400">Los retos los crea el dueño o un administrador.</p>
        )}
      </Card>

      <Card title="Retos">
        {list.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">Todavía no creaste retos.</p>
        ) : (
          <ul className="space-y-3">
            {list.map((c) => (
              <li key={c.id} className="rounded-2xl border border-[#444] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-white">{c.title}</p>
                    <p className="text-xs text-zinc-400">
                      {METRICS[c.metric].label}: meta {fmtAmount(Number(c.goal), c.metric)} · {fmtDay(c.starts_on)} al {fmtDay(c.ends_on)}
                      {c.reward_days > 0 ? ` · premio +${c.reward_days} días` : ''}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${PHASE[c.phase].tone}`}>{PHASE[c.phase].label}</span>
                </div>
                <p className="mt-2 text-sm text-zinc-300">
                  <strong className="text-white">{c.participants}</strong> anotados ·{' '}
                  <strong className="text-white">{c.reached}</strong> {c.phase === 'settled' ? 'cumplieron' : 'ya llegaron a la meta'}
                </p>
                {c.top && c.top.length > 0 && (
                  <ol className="mt-2 space-y-1 text-sm">
                    {c.top.map((t) => (
                      <li key={`${t.pos}-${t.name}`} className="flex justify-between gap-2">
                        <span className="text-zinc-300">
                          {t.pos === 1 && <Trophy className="mr-1 inline h-3.5 w-3.5 text-[#edcc36]" aria-hidden="true" />}
                          {t.pos}. {t.name}
                        </span>
                        <span className="tabular-nums text-zinc-200">{fmtAmount(Number(t.progress), c.metric)}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {canManage && (c.phase === 'live' || c.phase === 'upcoming' || c.phase === 'to_settle') && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {c.phase === 'to_settle' && (
                      <ActionButton
                        action={settleChallenge.bind(null, slug, c.id)}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#edcc36] px-3 text-sm font-bold text-black"
                      >
                        Cerrar y premiar ahora
                      </ActionButton>
                    )}
                    {c.phase !== 'to_settle' && (
                      <ConfirmAction
                        action={cancelChallenge.bind(null, slug, c.id)}
                        confirmText="Se cancela y deja de verse en la app. No se entregan premios."
                        yesLabel="Sí, cancelar"
                        variant="link"
                      >
                        Cancelar reto
                      </ConfirmAction>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-zinc-500">Hoy es {fmtDay(today)}. Los retos terminados se cierran solos todas las noches.</p>
      </Card>
    </div>
  )
}
