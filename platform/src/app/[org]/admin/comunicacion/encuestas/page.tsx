import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { MessageCircle } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { Card } from '@/features/admin/ui'
import { fmtDate } from '@/features/admin/format'
import { normalizeArPhone, whatsappLink } from '@/features/admin/whatsapp'
import { createClient } from '@/lib/supabase/server'
import { NpsToggle } from '@/features/engagement/NpsToggle'
import { setNpsEnabled } from '@/features/engagement/retention-actions'
import type { NpsReport } from '@/features/engagement/retention'

export const metadata: Metadata = { title: 'Encuestas' }

const PERIODS = [30, 90, 365] as const

function npsTone(n: number | null) {
  if (n === null) return 'text-zinc-400'
  if (n >= 50) return 'text-emerald-300'
  if (n >= 0) return 'text-[#edcc36]'
  return 'text-red-300'
}

function scoreTone(s: number) {
  if (s >= 9) return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
  if (s >= 7) return 'border-zinc-600 bg-zinc-800 text-zinc-200'
  return 'border-red-500/40 bg-red-500/15 text-red-200'
}

export default async function EncuestasPage({ params, searchParams }: PageProps<'/[org]/admin/comunicacion/encuestas'>) {
  const { org: slug } = await params
  const sp = await searchParams
  const ctx = await getAdminContext(slug)
  if (!ctx || !ctx.can('members.write')) return null
  const days = PERIODS.includes(Number(sp.dias) as (typeof PERIODS)[number]) ? Number(sp.dias) : 90
  const filter = sp.ver === 'detractores' ? 'detractors' : sp.ver === 'promotores' ? 'promoters' : 'all'

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('nps_report', { p_org: ctx.org.id, p_days: days })
  if (error || !data) {
    return (
      <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
        No pudimos cargar las encuestas. Recargá la página en un rato.
      </p>
    )
  }
  const r = data as unknown as NpsReport
  const canManage = ctx.can('automations.manage') || ctx.can('org.manage')
  const list = r.responses.filter((x) => (filter === 'detractors' ? x.score <= 6 : filter === 'promoters' ? x.score >= 9 : true))
  const base = `/${slug}/admin/comunicacion/encuestas`
  const pct = (n: number) => (r.answered ? Math.round((100 * n) / r.answered) : 0)

  return (
    <div className="space-y-5">
      <Card title="Encuesta de satisfacción (NPS)" action={<NpsToggle enabled={r.enabled} canManage={canManage} action={setNpsEnabled.bind(null, slug)} />}>
        <p className="text-sm text-zinc-400">
          En la app, el socio responde <em>&quot;Del 0 al 10, ¿cuánto recomendarías {ctx.org.name} a un amigo?&quot;</em> y puede dejar un
          comentario. Se le pregunta a los 30 días del alta y después una vez por trimestre. El NPS es el % que pone 9 o 10 menos el % que pone
          de 0 a 6 (va de −100 a 100; arriba de 50 es muy bueno).
        </p>
      </Card>

      <nav aria-label="Período" className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={`${base}?dias=${p}` as Route}
            aria-current={p === days ? 'page' : undefined}
            className={`min-h-[40px] rounded-full border px-4 py-2 text-sm font-semibold ${
              p === days ? 'border-[#edcc36] bg-[#edcc36] text-black' : 'border-zinc-700 text-zinc-300 hover:text-white'
            }`}
          >
            {p === 365 ? 'Último año' : `Últimos ${p} días`}
          </Link>
        ))}
      </nav>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#444] bg-[#2c2c2c] p-4">
          <p className="text-xs text-zinc-400">NPS</p>
          <p className={`text-3xl font-extrabold tabular-nums ${npsTone(r.nps)}`}>{r.nps ?? '—'}</p>
          <p className="text-xs text-zinc-500">{r.answered} respuestas · promedio {r.average ?? '—'}</p>
        </div>
        <div className="rounded-2xl border border-[#444] bg-[#2c2c2c] p-4">
          <p className="text-xs text-zinc-400">Promotores (9–10)</p>
          <p className="text-3xl font-extrabold tabular-nums text-emerald-300">{pct(r.promoters)}%</p>
          <p className="text-xs text-zinc-500">{r.promoters} socios</p>
        </div>
        <div className="rounded-2xl border border-[#444] bg-[#2c2c2c] p-4">
          <p className="text-xs text-zinc-400">Neutros (7–8)</p>
          <p className="text-3xl font-extrabold tabular-nums text-zinc-200">{pct(r.passives)}%</p>
          <p className="text-xs text-zinc-500">{r.passives} socios</p>
        </div>
        <div className="rounded-2xl border border-[#444] bg-[#2c2c2c] p-4">
          <p className="text-xs text-zinc-400">Detractores (0–6)</p>
          <p className="text-3xl font-extrabold tabular-nums text-red-300">{pct(r.detractors)}%</p>
          <p className="text-xs text-zinc-500">
            {r.detractors} socios · {r.skipped} dijeron &quot;ahora no&quot;
          </p>
        </div>
      </div>

      {r.by_month.length > 1 && (
        <Card title="Evolución por mes">
          <ul className="flex flex-wrap gap-2">
            {r.by_month.map((m) => (
              <li key={m.month} className="min-w-[88px] rounded-xl border border-[#444] px-3 py-2 text-center">
                <p className="text-xs text-zinc-400">
                  {new Intl.DateTimeFormat('es-AR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${m.month}-15T12:00:00Z`))}
                </p>
                <p className={`text-lg font-bold tabular-nums ${npsTone(m.nps)}`}>{m.nps ?? '—'}</p>
                <p className="text-[11px] text-zinc-500">{m.answered} resp.</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title="Respuestas"
        action={
          <div className="flex flex-wrap gap-1.5 text-xs">
            {(
              [
                ['all', 'Todas', ''],
                ['detractors', 'Detractores', 'detractores'],
                ['promoters', 'Promotores', 'promotores'],
              ] as const
            ).map(([k, label, q]) => (
              <Link
                key={k}
                href={`${base}?dias=${days}${q ? `&ver=${q}` : ''}` as Route}
                aria-current={filter === k ? 'page' : undefined}
                className={`min-h-[32px] rounded-full border px-3 py-1.5 font-semibold ${filter === k ? 'border-[#edcc36] text-[#edcc36]' : 'border-zinc-700 text-zinc-400 hover:text-white'}`}
              >
                {label}
              </Link>
            ))}
          </div>
        }
      >
        {list.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
            {r.answered === 0 ? 'Todavía no hay respuestas en este período.' : 'No hay respuestas con ese filtro.'}
          </p>
        ) : (
          <ul className="divide-y divide-[#3a3a3a]">
            {list.map((x) => {
              const phone = normalizeArPhone(x.phone)
              const nombre = x.full_name.split(' ')[0] ?? ''
              const text =
                x.score <= 6
                  ? `Hola ${nombre}, vimos tu respuesta en la encuesta de ${ctx.org.name}. Gracias por decirnos. ¿Nos contás qué podemos mejorar?`
                  : `Hola ${nombre}, ¡gracias por tu respuesta en la encuesta de ${ctx.org.name}!`
              return (
                <li key={x.id} className="flex items-start gap-3 py-3">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-base font-extrabold tabular-nums ${scoreTone(x.score)}`}>
                    {x.score}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <Link href={`/${slug}/admin/socios/${x.member_id}` as Route} className="font-semibold text-white hover:text-[#edcc36]">
                        {x.full_name}
                      </Link>
                      <span className="text-xs text-zinc-500">
                        {fmtDate(x.created_at)} · {x.campaign === 'd30' ? 'a los 30 días' : 'trimestral'}
                      </span>
                    </p>
                    {x.comment ? <p className="mt-0.5 whitespace-pre-line text-sm text-zinc-300">“{x.comment}”</p> : <p className="text-xs text-zinc-500">Sin comentario</p>}
                  </div>
                  {phone && (
                    <a
                      href={whatsappLink(phone, text)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Escribirle por WhatsApp a ${x.full_name}`}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-zinc-700 text-emerald-300 hover:border-emerald-500/60"
                    >
                      <MessageCircle className="h-5 w-5" aria-hidden="true" />
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
