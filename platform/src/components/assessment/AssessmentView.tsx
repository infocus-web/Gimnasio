import { AREAS, scoreAssessment, type AreaKey, type AssessmentInput } from '@/features/assessment/scoring'

export interface AssessmentRow extends AssessmentInput {
  id: string
  assessed_at: string
  goal?: string | null
  notes?: string | null
}

const BAR: Record<string, string> = {
  Excelente: 'bg-emerald-400',
  Bien: 'bg-[#edcc36]',
  Regular: 'bg-orange-400',
  'A mejorar': 'bg-red-400',
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(iso),
  )
}

/**
 * Resultado del Evolution Check: edad fitness, puntaje por área (barras) y diferencia con la
 * evaluación anterior. Sin estado: sirve en el panel (servidor) y en la app del socio.
 */
export function AssessmentView({ latest, previous, compact = false }: { latest: AssessmentRow; previous?: AssessmentRow | null; compact?: boolean }) {
  const s = scoreAssessment(latest)
  const p = previous ? scoreAssessment(previous) : null
  const prevBy = new Map(p?.areas.map((a) => [a.key, a.score]) ?? [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-zinc-400">Evaluación del {fmtDate(latest.assessed_at)}</p>
          {s.overall !== null && (
            <p className="text-sm text-zinc-200">
              Puntaje general <span className="text-lg font-extrabold tabular-nums text-white">{s.overall}</span>
              <span className="text-zinc-500">/100</span> · {s.level}
              {p?.overall != null && p.overall !== s.overall && (
                <span className={`ml-1 font-semibold ${s.overall > p.overall ? 'text-emerald-300' : 'text-red-300'}`}>
                  ({s.overall > p.overall ? '+' : ''}
                  {s.overall - p.overall})
                </span>
              )}
            </p>
          )}
        </div>
        {s.fitnessAge !== null && (
          <div className="rounded-2xl border border-[#edcc36]/40 bg-[#edcc36]/10 px-4 py-2 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#f5e38a]">Edad fitness</p>
            <p className="text-2xl font-extrabold tabular-nums text-white">{s.fitnessAge}</p>
            <p className="text-[11px] text-zinc-400">
              edad real {latest.age_years}
              {p?.fitnessAge != null && p.fitnessAge !== s.fitnessAge ? ` · antes ${p.fitnessAge}` : ''}
            </p>
          </div>
        )}
      </div>

      <ul className="space-y-2.5">
        {s.areas.map((a) => {
          const before = prevBy.get(a.key)
          const diff = before === undefined ? null : a.score - before
          return (
            <li key={a.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold text-zinc-100">
                  {a.label}
                  {!compact && <span className="ml-1.5 text-xs font-normal text-zinc-500">{AREAS[a.key as AreaKey].tests}</span>}
                </span>
                <span className="shrink-0 tabular-nums text-zinc-300">
                  {a.score} · {a.level}
                  {diff ? <span className={diff > 0 ? 'text-emerald-300' : 'text-red-300'}> {diff > 0 ? `+${diff}` : diff}</span> : null}
                </span>
              </div>
              <div
                className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-800"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={a.score}
                aria-label={a.label}
              >
                <div className={`h-full rounded-full ${BAR[a.level]}`} style={{ width: `${Math.max(a.score, 3)}%` }} />
              </div>
            </li>
          )
        })}
      </ul>

      {s.focus.length > 0 && (
        <p className="rounded-xl border border-zinc-800 bg-black/30 p-3 text-xs text-zinc-300">
          <span className="font-semibold text-[#edcc36]">Para trabajar:</span> {s.focus.map((f) => AREAS[f.key].focus).join(' · ')}
        </p>
      )}
      {latest.goal && !compact && <p className="text-xs text-zinc-400">Objetivo: {latest.goal}</p>}
      {latest.notes && !compact && <p className="whitespace-pre-line text-xs italic text-zinc-400">“{latest.notes}”</p>}
      <p className="text-[11px] text-zinc-500">Es una referencia de entrenamiento, no un diagnóstico médico.</p>
    </div>
  )
}

/** Columnas que hay que pedir a la base para armar AssessmentRow */
export const ASSESSMENT_COLUMNS =
  'id, assessed_at, sex, age_years, weight_kg, height_cm, body_fat_pct, waist_cm, resting_hr, squats_1min, pushups, plank_s, sit_reach_cm, balance_s, step_hr, goal, notes'

export function toAssessmentRow(r: Record<string, unknown>): AssessmentRow {
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  return {
    id: String(r.id),
    assessed_at: String(r.assessed_at),
    sex: r.sex === 'F' ? 'F' : 'M',
    age_years: Number(r.age_years),
    weight_kg: n(r.weight_kg),
    height_cm: n(r.height_cm),
    body_fat_pct: n(r.body_fat_pct),
    waist_cm: n(r.waist_cm),
    resting_hr: n(r.resting_hr),
    squats_1min: n(r.squats_1min),
    pushups: n(r.pushups),
    plank_s: n(r.plank_s),
    sit_reach_cm: n(r.sit_reach_cm),
    balance_s: n(r.balance_s),
    step_hr: n(r.step_hr),
    goal: (r.goal as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  }
}
