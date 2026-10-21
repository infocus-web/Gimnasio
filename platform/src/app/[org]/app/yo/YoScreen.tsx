'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useCallback, useEffect, useState } from 'react'
import {
  Award,
  CalendarClock,
  Check,
  ChevronRight,
  Copy,
  Flame,
  Gift,
  Loader2,
  MessageCircle,
  Snowflake,
  Ticket,
  Users,
} from 'lucide-react'
import { useMember } from '@/features/member/MemberProvider'
import {
  badgesFrom,
  engagementErrorText,
  type Achievements,
  type MemberEngagement,
} from '@/features/engagement/shared'

const card = 'rounded-3xl border border-zinc-800 bg-zinc-950 p-5'
const btnGhost =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-semibold text-zinc-200 hover:border-[#edcc36]/60 hover:text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]'
const btnPrimary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#edcc36] px-5 text-sm font-bold text-black disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white'

function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function fmtYmd(ymd: string) {
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(new Date(`${ymd}T12:00:00Z`))
}
function fmtTs(ts: string | null) {
  if (!ts) return '—'
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ts))
}
/** Fecha local (Argentina) de un timestamp, YYYY-MM-DD */
function tsYmd(ts: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts))
}

export function YoScreen() {
  const { supabase, org, family, activeMemberId, setActiveMemberId } = useMember()
  const [ach, setAch] = useState<Achievements | null>(null)
  const [eng, setEng] = useState<MemberEngagement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const reload = useCallback(() => setAttempt((a) => a + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const [a, e] = await Promise.all([
          supabase.rpc('member_achievements', { p_member: activeMemberId }),
          supabase.rpc('member_engagement', { p_member: activeMemberId }),
        ])
        if (cancelled) return
        if (a.error || e.error) {
          setError('No pudimos cargar tu cuenta. Probá de nuevo en un rato.')
          return
        }
        setAch(a.data as unknown as Achievements)
        setEng(e.data as unknown as MemberEngagement)
        setError(null)
      } catch {
        if (!cancelled) setError('Sin conexión. Revisá tu internet y probá de nuevo.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, activeMemberId, attempt])

  const active = family.find((f) => f.id === activeMemberId) ?? family[0]

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Mi cuenta</h1>
          <p className="text-sm text-zinc-400">
            {active?.firstName} {active?.lastName}
            {active?.memberNumber ? ` · Socio N° ${active.memberNumber}` : ''}
          </p>
        </div>
      </div>

      {family.length > 1 && (
        <div role="group" aria-label="Ver la cuenta de" className="flex gap-1 rounded-2xl border border-zinc-800 bg-zinc-950 p-1">
          {family.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActiveMemberId(f.id)}
              aria-pressed={f.id === activeMemberId}
              className={`min-h-[44px] flex-1 rounded-xl px-2.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36] ${
                f.id === activeMemberId ? 'bg-[#edcc36] text-black' : 'bg-zinc-900/60 text-zinc-400 hover:text-white'
              }`}
            >
              {f.isMe ? 'Yo' : f.firstName}
            </button>
          ))}
        </div>
      )}

      <nav aria-label="Accesos" className="grid grid-cols-2 gap-3">
        {[
          { href: `/${org.slug}/app/horarios`, label: 'Concurrencia', sub: '¿Hay mucha gente?', Icon: Users },
          { href: `/${org.slug}/app/invitados`, label: 'Invitados', sub: 'Traé a alguien', Icon: Ticket },
        ].map(({ href, label, sub, Icon }) => (
          <Link
            key={href}
            href={href as Route}
            className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 hover:border-[#edcc36]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#edcc36]/10">
              <Icon className="h-5 w-5 text-[#edcc36]" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-white">{label}</span>
              <span className="block truncate text-xs text-zinc-500">{sub}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-zinc-600" aria-hidden="true" />
          </Link>
        ))}
      </nav>

      {error ? (
        <div role="alert" className="space-y-3 rounded-3xl border border-red-500/40 bg-zinc-950 p-6 text-center">
          <p className="text-sm text-red-200">{error}</p>
          <button type="button" onClick={reload} className={`${btnGhost} w-full`}>
            Reintentar
          </button>
        </div>
      ) : loading && !ach ? (
        <div className="space-y-4" aria-busy="true" aria-label="Cargando">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-3xl border border-zinc-900 bg-zinc-950" />
          ))}
        </div>
      ) : ach && eng ? (
        <>
          <AchievementsCard a={ach} />
          <ReferralCard eng={eng} orgSlug={org.slug} orgName={org.name} />
          <FreezeCard eng={eng} memberId={activeMemberId} onChange={reload} />
        </>
      ) : null}
    </div>
  )
}

function AchievementsCard({ a }: { a: Achievements }) {
  const badges = badgesFrom(a)
  const done = badges.filter((b) => b.achieved).length
  return (
    <section aria-labelledby="logros" className={card}>
      <div className="mb-4 flex items-center justify-between">
        <h2 id="logros" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-zinc-300">
          <Award className="h-4 w-4 text-[#edcc36]" aria-hidden="true" /> Logros
        </h2>
        <span className="text-xs text-zinc-500">
          {done} de {badges.length}
        </span>
      </div>
      <div className="mb-5 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-zinc-900/60 p-3">
          <Flame className={`mx-auto h-5 w-5 ${a.week_streak > 0 ? 'text-orange-400' : 'text-zinc-600'}`} aria-hidden="true" />
          <p className="mt-1 text-2xl font-extrabold tabular-nums text-white">{a.week_streak}</p>
          <p className="text-[11px] leading-tight text-zinc-400">{a.week_streak === 1 ? 'semana seguida' : 'semanas seguidas'}</p>
        </div>
        <div className="rounded-2xl bg-zinc-900/60 p-3">
          <p className="mt-6 text-2xl font-extrabold tabular-nums text-white">{a.this_month}</p>
          <p className="text-[11px] leading-tight text-zinc-400">entradas este mes</p>
        </div>
        <div className="rounded-2xl bg-zinc-900/60 p-3">
          <p className="mt-6 text-2xl font-extrabold tabular-nums text-white">{a.total}</p>
          <p className="text-[11px] leading-tight text-zinc-400">entradas en total</p>
        </div>
      </div>
      {a.week_streak > 0 && a.this_week === 0 && (
        <p className="mb-4 rounded-xl border border-orange-500/30 bg-orange-500/10 p-3 text-xs text-orange-100">
          Vení al menos una vez esta semana para no cortar tu racha de {a.week_streak} {a.week_streak === 1 ? 'semana' : 'semanas'}. 🔥
        </p>
      )}
      <ul className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
        {badges.map((b) => (
          <li
            key={b.key}
            className={`rounded-2xl border p-3 ${b.achieved ? 'border-[#edcc36]/40 bg-[#edcc36]/5' : 'border-zinc-800 bg-black'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className={`text-sm font-bold ${b.achieved ? 'text-[#edcc36]' : 'text-zinc-200'}`}>{b.title}</p>
              {b.achieved ? (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-[#edcc36]">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" /> Logrado
                </span>
              ) : (
                <span className="text-[11px] tabular-nums text-zinc-500">
                  {b.value}/{b.goal}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500">{b.description}</p>
            {!b.achieved && (
              <div
                role="progressbar"
                aria-label={`Progreso de ${b.title}`}
                aria-valuemin={0}
                aria-valuemax={b.goal}
                aria-valuenow={b.value}
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800"
              >
                <div className="h-full rounded-full bg-[#edcc36]" style={{ width: `${Math.round((b.value / b.goal) * 100)}%` }} />
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-zinc-600">Se cuentan los días con entrada registrada en el gimnasio.</p>
    </section>
  )
}

function ReferralCard({ eng, orgSlug, orgName }: { eng: MemberEngagement; orgSlug: string; orgName: string }) {
  const r = eng.referral
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState(process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? '')
  useEffect(() => {
    if (!origin) setOrigin(window.location.origin)
  }, [origin])
  if (!r.code) return null
  const link = `${origin}/${orgSlug}/padron?ref=${r.code}`
  const shareText = `¡Sumate a entrenar conmigo en ${orgName}! Anotate con mi código ${r.code} y los dos ganamos ${r.reward_days} días gratis: ${link}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      window.prompt('Copiá tu link:', link)
    }
  }
  return (
    <section aria-labelledby="referidos" className={card}>
      <h2 id="referidos" className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-zinc-300">
        <Gift className="h-4 w-4 text-[#edcc36]" aria-hidden="true" /> Invitá a un amigo
      </h2>
      <p className="mb-4 text-sm text-zinc-400">
        Si se inscribe con tu código y paga su primer mes, <strong className="text-white">los dos suman {r.reward_days} días gratis</strong>.
      </p>
      <div className="mb-3 rounded-2xl border border-dashed border-[#edcc36]/50 bg-[#edcc36]/5 p-4 text-center">
        <p className="text-[11px] uppercase tracking-wider text-zinc-400">Tu código</p>
        <p className="font-mono text-2xl font-extrabold tracking-widest text-[#edcc36]">{r.code}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={copy} className={btnGhost} aria-live="polite">
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied ? '¡Copiado!' : 'Copiar link'}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" /> WhatsApp
        </a>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-2xl bg-zinc-900/60 px-4 py-3">
        <span className="text-sm text-zinc-300">Días ganados</span>
        <span className="text-lg font-extrabold tabular-nums text-white">
          {r.days_earned}
          {r.days_pending > 0 && <span className="ml-2 text-xs font-normal text-amber-200">(+{r.days_pending} cuando renueves)</span>}
        </span>
      </div>
      {r.list.length > 0 ? (
        <ul className="mt-3 divide-y divide-zinc-900">
          {r.list.map((x, i) => (
            <li key={i} className="flex items-center justify-between py-2 text-sm">
              <span className="text-zinc-200">{x.name}</span>
              {x.status === 'rewarded' ? (
                <span className="text-xs text-emerald-300">+{x.days} días</span>
              ) : (
                <span className="text-xs text-amber-200">Esperando su primer pago</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">Todavía no tenés referidos. ¡Compartí tu link!</p>
      )}
    </section>
  )
}

function FreezeCard({ eng, memberId, onChange }: { eng: MemberEngagement; memberId: string; onChange: () => void }) {
  const { supabase } = useMember()
  const f = eng.freeze
  const [start, setStart] = useState(f.today)
  const [days, setDays] = useState(Math.min(Math.max(f.min_days, 7), Math.max(f.remaining, f.min_days)))
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const endYmd = f.period_end ? tsYmd(f.period_end) : null
  const maxStart = endYmd ? [addDays(f.today, 90), addDays(endYmd, -1)].sort()[0] : addDays(f.today, 90)
  const canFreeze = f.can_request && f.remaining >= f.min_days
  const open = f.list.filter((x) => x.status === 'scheduled' || x.status === 'active')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy('create')
    setMsg(null)
    const { error } = await supabase.rpc('member_freeze_create', { p_member: memberId, p_start: start, p_days: days })
    setBusy(null)
    if (error) {
      setMsg({ ok: false, text: engagementErrorText(error) ?? 'No se pudo congelar. Probá de nuevo.' })
      return
    }
    setMsg({ ok: true, text: `Listo: tu plan queda congelado del ${fmtYmd(start)} al ${fmtYmd(addDays(start, days - 1))}. Los días se suman al vencimiento.` })
    onChange()
  }
  const cancel = async (id: string) => {
    setBusy(id)
    setMsg(null)
    const { error } = await supabase.rpc('member_freeze_cancel', { p_freeze: id })
    setBusy(null)
    if (error) {
      setMsg({ ok: false, text: engagementErrorText(error) ?? 'No se pudo cancelar. Probá de nuevo.' })
      return
    }
    setMsg({ ok: true, text: 'Congelamiento cancelado. Te devolvimos los días.' })
    onChange()
  }

  return (
    <section aria-labelledby="congelar" className={card}>
      <h2 id="congelar" className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-zinc-300">
        <Snowflake className="h-4 w-4 text-sky-300" aria-hidden="true" /> Congelar por vacaciones
      </h2>
      <p className="mb-4 text-sm text-zinc-400">
        Pausá tu plan si te vas de viaje: los días congelados se suman al vencimiento. Mínimo {f.min_days} días, hasta{' '}
        {f.max_days_year} por año.
      </p>
      <div className="mb-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-2xl bg-zinc-900/60 p-3">
          <p className="text-2xl font-extrabold tabular-nums text-white">{f.remaining}</p>
          <p className="text-[11px] text-zinc-400">días disponibles este año</p>
        </div>
        <div className="rounded-2xl bg-zinc-900/60 p-3">
          <p className="text-sm font-bold text-white">{fmtTs(f.period_end)}</p>
          <p className="text-[11px] text-zinc-400">{f.membership_status === 'paused' ? 'vence (congelado ahora)' : 'tu plan vence'}</p>
        </div>
      </div>

      {open.length > 0 && (
        <ul className="mb-4 space-y-2">
          {open.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-500/30 bg-sky-500/5 p-3">
              <span className="flex items-center gap-2 text-sm text-sky-100">
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
                {x.status === 'active' ? 'Congelado' : 'Programado'}: {fmtYmd(x.starts_on)} al {fmtYmd(addDays(x.ends_on, -1))} ({x.days} días)
              </span>
              {x.status === 'scheduled' && f.is_payer && (
                <button type="button" onClick={() => cancel(x.id)} disabled={busy !== null} className={btnGhost}>
                  {busy === x.id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Cancelar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!f.period_end ? (
        <p className="text-sm text-zinc-500">Necesitás un plan vigente para poder congelarlo.</p>
      ) : !f.is_payer ? (
        <p className="text-sm text-zinc-500">Solo el titular de la cuenta puede congelar el plan.</p>
      ) : !f.can_request ? (
        <p className="text-sm text-zinc-500">
          {f.membership_status === 'paused' ? 'Tu plan ya está congelado.' : 'Tu plan ahora no se puede congelar. Consultá en recepción.'}
        </p>
      ) : !canFreeze ? (
        <p className="text-sm text-zinc-500">
          Te {f.remaining === 1 ? 'queda 1 día' : `quedan ${f.remaining} días`} este año: no alcanza para el mínimo de {f.min_days}.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-zinc-400">Desde</span>
              <input
                type="date"
                value={start}
                min={f.today}
                max={maxStart}
                onChange={(e) => setStart(e.target.value)}
                required
                className="min-h-[44px] w-full rounded-xl border border-zinc-800 bg-black px-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-zinc-400">Días</span>
              <input
                type="number"
                inputMode="numeric"
                value={days}
                min={f.min_days}
                max={f.remaining}
                onChange={(e) => setDays(Number(e.target.value))}
                required
                className="min-h-[44px] w-full rounded-xl border border-zinc-800 bg-black px-3 text-sm tabular-nums text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
              />
            </label>
          </div>
          {start && days >= f.min_days && days <= f.remaining && (
            <p className="text-xs text-zinc-400">
              No vas a poder entrar del {fmtYmd(start)} al {fmtYmd(addDays(start, days - 1))}. Volvés el {fmtYmd(addDays(start, days))}
              {endYmd ? ` y tu plan pasa a vencer el ${fmtYmd(addDays(endYmd, days))}` : ''}.
            </p>
          )}
          <button type="submit" disabled={busy !== null} className={`${btnPrimary} w-full`}>
            {busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Snowflake className="h-4 w-4" aria-hidden="true" />}
            Congelar mi plan
          </button>
        </form>
      )}
      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={`mt-3 rounded-xl border p-3 text-sm ${msg.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-red-500/30 bg-red-500/10 text-red-100'}`}>
          {msg.text}
        </p>
      )}
    </section>
  )
}
