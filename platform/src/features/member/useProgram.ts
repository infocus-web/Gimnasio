'use client'

import { useCallback, useEffect, useState } from 'react'
import type { PrescribedExercise } from '@/types/platform'
import { useMember } from './MemberProvider'

export interface ProgramDay {
  workoutId: string
  dayIndex: number
  name: string
  exercises: PrescribedExercise[]
}

export interface ActiveProgram {
  assignmentId: string
  programName: string
  days: ProgramDay[]
}

/** Programa activo asignado por el entrenador al socio activo. */
export function useProgram() {
  const { supabase, activeMemberId } = useMember()
  const [program, setProgram] = useState<ActiveProgram | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data: assignment, error: e1 } = await supabase
      .from('program_assignments')
      .select('id, program_id, workout_programs(name)')
      .eq('member_id', activeMemberId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (e1) {
      setError('No pudimos cargar tu rutina.')
      setLoading(false)
      return
    }
    if (!assignment) {
      setProgram(null)
      setLoading(false)
      return
    }
    const { data: workouts, error: e2 } = await supabase
      .from('program_workouts')
      .select(
        'id, day_index, name, program_exercises(id, position, target_sets, target_reps, target_weight_kg, rest_seconds, notes, exercise_id, exercises(name, muscle_group, video_url))',
      )
      .eq('program_id', assignment.program_id)
      .order('day_index')
    if (e2) {
      setError('No pudimos cargar tu rutina.')
      setLoading(false)
      return
    }
    setProgram({
      assignmentId: assignment.id,
      programName: assignment.workout_programs?.name ?? 'Mi rutina',
      days: (workouts ?? []).map((w) => ({
        workoutId: w.id,
        dayIndex: w.day_index,
        name: w.name,
        exercises: [...(w.program_exercises ?? [])]
          .sort((a, b) => a.position - b.position)
          .map((pe) => ({
            // id = exercise_id: así el registro de series y el progreso se agrupan por ejercicio real
            id: pe.exercise_id,
            name: pe.exercises?.name ?? 'Ejercicio',
            muscleGroup: pe.exercises?.muscle_group ?? undefined,
            videoUrl: pe.exercises?.video_url ?? undefined,
            targetSets: pe.target_sets ?? 3,
            targetReps: pe.target_reps ?? '10',
            targetWeightKg: pe.target_weight_kg,
            restSeconds: pe.rest_seconds ?? 60,
            notes: pe.notes ?? undefined,
          })),
      })),
    })
    setLoading(false)
  }, [supabase, activeMemberId])

  useEffect(() => {
    void load()
  }, [load])

  return { program, loading, error }
}
