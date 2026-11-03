'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Check, Gift, Loader2, Trophy, Users } from 'lucide-react'
import { useMember } from '@/features/member/MemberProvider'
import { fmtAmount, fmtDay, METRICS, retentionErrorText, type MemberChallenge } from '@/features/engagement/retention'

const card = 'rounded-3xl border border-zinc-800 bg-zinc-950 p-5'
const btnPrimary =
  'btn-tac inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#edcc36] px-5 text-sm font-bold text-black disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white'

export function ChallengesScreen() {
  const { supabase, org, family, activeMemberId, setActiveMemberId } = useMember()
  const [list, setList] = useState<MemberChallenge[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const reload = useCallback(() => setAttempt((a) => a + 1), [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('member_challenges', { p_member: activeMemberId })
        if (cancelled) return
        if (error) {
          setError('No pudimos cargar los retos. Probá de nuevo en un rato.')
          return
        }
        setList((data ?? []) as unknown as MemberChallenge[])
        setError(null)
      } catch {
        if (!cancelled) setError('Sin conexión. Revisá tu internet y probá de nuevo.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, activeMemberId, attempt])

  async function toggle(c: MemberChallenge) {
    setBusy(c.id)
    setError(null)
    const { error } = await supabase.rpc(c.joined ? 'challenge_leave' : 'challenge_join', { p_challenge: c.id, p_member: activeMemberId })
    setBusy(null)
    if (error) {
      setError(retentionErrorText(error) ?? 'No se pudo. Probá de nuevo.')
      return
    }
    reload()
  }

  return (
    <div className="space-y-4">
      <Link href={`/${org.slug}/app/yo` as Route} className="inline-flex min-h-[44px] items-center gap-1 text-sm text-zinc-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver
      </Link>
      <h1 className="text-2xl font-extrabold text-white">Retos</h1>

      {family.length > 1 && (
        <div className="flex gap-1.5 rounded-2xl border border-zinc-800 bg-zinc-950 p-1.5" role="group" aria-label="Para quién">
          {family.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActiveMemberId(f.id)}
              aria-pressed={f.id === activeMemberId}
              className={`min-h-[44px] flex-1 rounded-xl px-2.5 text-xs font-semibold ${
                f.id === activeMemberId ? 'bg-[#edcc36] text-black' : 'bg-zinc-900/60 text-zinc-400 hover:text-white'
              }`}
            >
              {f.isMe ? 'Yo' : f.firstName}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">
          {error}{' '}
          <button type="button" onClick={reload} className="font-semibold underline">
            Reintentar
          </button>
        </p>
      )}

      {list === null && !error ? (
        <div className="grid place-items-center py-12 text-zinc-500">
          <Loader2 className="h-6 w-6 animate-spin" aria-label="Cargando" />
        </div>
      ) : list && list.length === 0 ? (
        <div className={`${card} text-center`}>
          <Trophy className="mx-auto h-8 w-8 text-zinc-600" aria-hidden="true" />
          <p className="mt-2 text-sm text-zinc-400">Por ahora no hay retos. Cuando el gimnasio lance uno, lo vas a ver acá.</p>
        </div>
      ) : (
        list?.map((c) => {
          const progress = Number(c.progress ?? 0)
          const goal = Number(c.goal)
          const pct = Math.min(100, Math.round((100 * progress) / goal))
          return (
            <section key={c.id} className={card} aria-labelledby={`ch-${c.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id={`ch-${c.id}`} className="text-lg font-extrabold text-white">
                    {c.title}
                  </h2>
                  <p className="text-xs text-zinc-400">
                    {c.phase === 'upcoming' ? 'Empieza el ' : c.phase === 'ended' ? 'Terminó el ' : 'Hasta el '}
                    {fmtDay(c.phase === 'upcoming' ? c.starts_on : c.ends_on)} · Meta: {fmtAmount(goal, c.metric)}
                  </p>
                </div>
                {c.reward_days > 0 && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#edcc36]/40 bg-[#edcc36]/10 px-2.5 py-1 text-[11px] font-semibold text-[#f5e38a]">
                    <Gift className="h-3.5 w-3.5" aria-hidden="true" /> +{c.reward_days} días
                  </span>
                )}
              </div>
              {c.description && <p className="mt-2 text-sm text-zinc-300">{c.description}</p>}
              <p className="mt-1 text-xs text-zinc-500">{METRICS[c.metric].help}</p>

              {c.joined ? (
                <div className="mt-4 space-y-1.5">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-semibold text-white">{fmtAmount(progress, c.metric)}</span>
                    <span className="tabular-nums text-zinc-400">{pct}%</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Avance del reto">
                    <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-400' : 'bg-[#edcc36]'}`} style={{ width: `${Math.max(pct, 2)}%` }} />
                  </div>
                  {c.phase === 'ended' ? (
                    <p className="text-sm text-zinc-300">
                      {c.completed
                        ? c.reward_days > 0
                          ? c.reward_status === 'pending'
                            ? `¡Lo cumpliste! 🎉 Los ${c.reward_days} días se suman cuando renueves tu plan.`
                            : `¡Lo cumpliste! 🎉 Te sumamos ${c.reward_days} días al plan.`
                          : '¡Lo cumpliste! 🎉'
                        : c.status === 'settled'
                          ? 'Esta vez no llegaste. ¡El próximo sale!'
                          : 'Terminó: en unas horas se cierran los resultados.'}
                    </p>
                  ) : pct >= 100 ? (
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-300">
                      <Check className="h-4 w-4" aria-hidden="true" /> ¡Meta cumplida! El premio llega al cerrar el reto.
                    </p>
                  ) : (
                    <p className="text-sm text-zinc-400">Te faltan {fmtAmount(Math.max(goal - progress, 0), c.metric)}.</p>
                  )}
                </div>
              ) : null}

              {c.ranking && c.ranking.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" /> Ranking · {c.participants} anotados
                  </p>
                  <ol className="space-y-1 text-sm">
                    {c.ranking.map((r) => (
                      <li
                        key={`${r.pos}-${r.name}`}
                        className={`flex justify-between gap-2 rounded-lg px-2 py-1 ${r.me ? 'bg-[#edcc36]/10 font-semibold text-white' : 'text-zinc-300'}`}
                      >
                        <span>
                          {r.pos}. {r.name}
                          {r.me ? ' (vos)' : ''}
                        </span>
                        <span className="tabular-nums">{fmtAmount(Number(r.progress), c.metric)}</span>
                      </li>
                    ))}
                  </ol>
                  {c.my_pos && c.my_pos > 10 && <p className="mt-1 text-xs text-zinc-400">Vas en el puesto {c.my_pos}.</p>}
                </div>
              )}

              {c.status === 'active' && c.phase !== 'ended' && (
                <div className="mt-4">
                  {c.joined ? (
                    <button
                      type="button"
                      onClick={() => void toggle(c)}
                      disabled={busy === c.id}
                      className="min-h-[44px] text-xs text-zinc-500 underline hover:text-zinc-300 disabled:opacity-60"
                    >
                      Salir del reto
                    </button>
                  ) : (
                    <button type="button" onClick={() => void toggle(c)} disabled={busy === c.id} className={`${btnPrimary} w-full`}>
                      {busy === c.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trophy className="h-4 w-4" aria-hidden="true" />}
                      Anotarme
                    </button>
                  )}
                </div>
              )}
            </section>
          )
        })
      )}
    </div>
  )
}
