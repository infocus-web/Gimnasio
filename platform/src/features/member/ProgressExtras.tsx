'use client'

import { useEffect, useState } from 'react'
import { ClipboardCheck, Scale } from 'lucide-react'
import { ASSESSMENT_COLUMNS, AssessmentView, toAssessmentRow, type AssessmentRow } from '@/components/assessment/AssessmentView'
import { useMember } from './MemberProvider'

interface Metric {
  measured_at: string
  weight_kg: number | null
  body_fat_pct: number | null
  measurements: Record<string, number | undefined>
  source: string
}

const card = 'rounded-3xl border border-zinc-800 bg-zinc-950 p-5'

function fmt(iso: string) {
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'short' }).format(new Date(iso))
}

function Delta({ now, before, unit, lowerIsBetter }: { now: number | null; before: number | null; unit: string; lowerIsBetter?: boolean }) {
  if (now === null || before === null) return null
  const d = Math.round((now - before) * 10) / 10
  if (!d) return null
  const good = lowerIsBetter ? d < 0 : d > 0
  return (
    <span className={`text-xs font-semibold ${good ? 'text-emerald-300' : 'text-zinc-400'}`}>
      {d > 0 ? '+' : ''}
      {String(d).replace('.', ',')} {unit}
    </span>
  )
}

/** Progreso: Evolution Check (si el profe lo cargó) y mediciones de balanza / medidas */
export function ProgressExtras() {
  const { supabase, activeMemberId } = useMember()
  const [checks, setChecks] = useState<AssessmentRow[]>([])
  const [metrics, setMetrics] = useState<Metric[]>([])

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      supabase.from('fitness_assessments').select(ASSESSMENT_COLUMNS).eq('member_id', activeMemberId).order('assessed_at', { ascending: false }).limit(2),
      supabase
        .from('body_metrics')
        .select('measured_at, weight_kg, body_fat_pct, measurements, source')
        .eq('member_id', activeMemberId)
        .order('measured_at', { ascending: false })
        .limit(12),
    ]).then(([a, m]) => {
      if (cancelled) return
      setChecks((a.data ?? []).map((r) => toAssessmentRow(r as unknown as Record<string, unknown>)))
      setMetrics(
        (m.data ?? []).map((r) => ({
          measured_at: r.measured_at,
          weight_kg: r.weight_kg === null ? null : Number(r.weight_kg),
          body_fat_pct: r.body_fat_pct === null ? null : Number(r.body_fat_pct),
          measurements: (r.measurements ?? {}) as Record<string, number | undefined>,
          source: r.source,
        })),
      )
    })
    return () => {
      cancelled = true
    }
  }, [supabase, activeMemberId])

  const [latest, previous] = checks
  const withWeight = metrics.filter((m) => m.weight_kg !== null || m.body_fat_pct !== null)
  const last = withWeight[0]
  const first = withWeight[withWeight.length - 1]

  if (!latest && !last) return null

  return (
    <div className="mb-4 space-y-4">
      {latest && (
        <section className={card} aria-labelledby="check-title">
          <h2 id="check-title" className="mb-3 flex items-center gap-2 text-base font-extrabold text-white">
            <ClipboardCheck className="h-5 w-5 text-[#edcc36]" aria-hidden="true" /> Mi Evolution Check
          </h2>
          <AssessmentView latest={latest} previous={previous ?? null} compact />
        </section>
      )}
      {last && (
        <section className={card} aria-labelledby="scale-title">
          <h2 id="scale-title" className="mb-3 flex items-center gap-2 text-base font-extrabold text-white">
            <Scale className="h-5 w-5 text-[#edcc36]" aria-hidden="true" /> Composición corporal
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {last.weight_kg !== null && (
              <div>
                <p className="text-xs text-zinc-400">Peso</p>
                <p className="text-2xl font-extrabold tabular-nums text-white">{String(last.weight_kg).replace('.', ',')} kg</p>
                {first !== last && <Delta now={last.weight_kg} before={first?.weight_kg ?? null} unit="kg" />}
              </div>
            )}
            {last.body_fat_pct !== null && (
              <div>
                <p className="text-xs text-zinc-400">Grasa</p>
                <p className="text-2xl font-extrabold tabular-nums text-white">{String(last.body_fat_pct).replace('.', ',')}%</p>
                {first !== last && <Delta now={last.body_fat_pct} before={first?.body_fat_pct ?? null} unit="%" lowerIsBetter />}
              </div>
            )}
            {last.measurements.muscle_kg !== undefined && (
              <div>
                <p className="text-xs text-zinc-400">Masa muscular</p>
                <p className="text-xl font-bold tabular-nums text-white">{String(last.measurements.muscle_kg).replace('.', ',')} kg</p>
                {first !== last && <Delta now={last.measurements.muscle_kg ?? null} before={first?.measurements.muscle_kg ?? null} unit="kg" />}
              </div>
            )}
            {last.measurements.visceral_fat !== undefined && (
              <div>
                <p className="text-xs text-zinc-400">Grasa visceral</p>
                <p className="text-xl font-bold tabular-nums text-white">{String(last.measurements.visceral_fat).replace('.', ',')}</p>
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Última medición: {fmt(last.measured_at)}
            {first !== last && first ? ` · cambios desde el ${fmt(first.measured_at)}` : ''}
          </p>
        </section>
      )}
    </div>
  )
}
