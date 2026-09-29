'use client'

import { useEffect, useState } from 'react'
import { StrengthProgress } from '@/components/workout/StrengthProgress'
import { useMember } from '@/features/member/MemberProvider'
import { useProgram } from '@/features/member/useProgram'
import type { LoggedSet, PrescribedExercise } from '@/types/platform'

export function ProgressScreen() {
  const { supabase, activeMemberId } = useMember()
  const { program, loading: loadingProgram } = useProgram()
  const [sets, setSets] = useState<LoggedSet[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const since = new Date(Date.now() - 120 * 24 * 3600 * 1000).toISOString()
    void (async () => {
      const { data } = await supabase
        .from('set_logs')
        .select('exercise_id, set_number, reps, weight_kg, rpe, workout_logs!inner(member_id, performed_at)')
        .eq('workout_logs.member_id', activeMemberId)
        .gte('workout_logs.performed_at', since)
        .order('id')
        .limit(2000)
      if (cancelled) return
      setSets(
        (data ?? []).map((s) => ({
          exerciseId: s.exercise_id,
          setNumber: s.set_number,
          reps: s.reps ?? 0,
          weightKg: Number(s.weight_kg ?? 0),
          rpe: s.rpe ?? undefined,
        })),
      )
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, activeMemberId])

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

  return <StrengthProgress exercises={exercises} loggedSets={sets} isLoading={loading || loadingProgram} />
}
