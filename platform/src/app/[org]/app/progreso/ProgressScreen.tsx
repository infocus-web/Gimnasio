'use client'

import { useCallback, useEffect, useState } from 'react'
import { StrengthProgress } from '@/components/workout/StrengthProgress'
import { useMember } from '@/features/member/MemberProvider'
import { useProgram } from '@/features/member/useProgram'
import type { LoggedSet, PrescribedExercise } from '@/types/platform'

export function ProgressScreen() {
  const { supabase, activeMemberId } = useMember()
  const { program, loading: loadingProgram, error: programError, reload: reloadProgram } = useProgram()
  const [sets, setSets] = useState<LoggedSet[]>([])
  const [extraNames, setExtraNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const since = new Date(Date.now() - 120 * 24 * 3600 * 1000).toISOString()
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('set_logs')
          .select('exercise_id, set_number, reps, weight_kg, rpe, exercises(name), workout_logs!inner(member_id, performed_at)')
          .eq('workout_logs.member_id', activeMemberId)
          .gte('workout_logs.performed_at', since)
          .order('id')
          .limit(2000)
        if (cancelled) return
        if (error) {
          setError('No pudimos cargar tu progreso.')
          return
        }
        const names: Record<string, string> = {}
        setSets(
          (data ?? []).map((s) => {
            const name = (s.exercises as { name?: string } | null)?.name
            if (name) names[s.exercise_id] = name
            return {
              exerciseId: s.exercise_id,
              setNumber: s.set_number,
              reps: s.reps ?? 0,
              weightKg: Number(s.weight_kg ?? 0),
              rpe: s.rpe ?? undefined,
              performedAt: (s.workout_logs as unknown as { performed_at: string } | null)?.performed_at,
            }
          }),
        )
        setExtraNames(names)
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

  const retry = useCallback(() => {
    setAttempt((a) => a + 1)
    if (programError) void reloadProgram()
  }, [programError, reloadProgram])

  const shownError = error ?? programError
  if (shownError && !loading && !loadingProgram) {
    return (
      <div role="alert" className="space-y-3 rounded-3xl border border-red-500/40 bg-zinc-950 p-6 text-center">
        <p className="text-sm text-red-200">{shownError}</p>
        <button
          type="button"
          onClick={retry}
          className="min-h-[44px] w-full rounded-xl border border-[#edcc36]/40 bg-zinc-900 px-4 text-sm font-semibold text-[#edcc36] hover:bg-[#edcc36] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
        >
          Reintentar
        </button>
      </div>
    )
  }

  // Ejercicios: los de la rutina + cualquier otro que tenga series registradas
  const exercises: PrescribedExercise[] = []
  const seen = new Set<string>()
  for (const d of program?.days ?? []) {
    for (const e of d.exercises) {
      if (!seen.has(e.id)) {
        seen.add(e.id)
        exercises.push(e)
      }
    }
  }
  for (const s of sets) {
    if (seen.has(s.exerciseId)) continue
    seen.add(s.exerciseId)
    exercises.push({
      id: s.exerciseId,
      name: extraNames[s.exerciseId] ?? 'Ejercicio',
      targetSets: 0,
      targetReps: '',
      restSeconds: 0,
    })
  }

  return <StrengthProgress exercises={exercises} loggedSets={sets} isLoading={loading || loadingProgram} />
}
