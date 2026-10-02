'use client'

import { useEffect, useState } from 'react'
import { useMember } from './MemberProvider'

export interface PreviousSet {
  setNumber: number
  reps: number | null
  weightKg: number | null
}

export interface PreviousExercise {
  performedAt: string
  sets: PreviousSet[]
}

export interface PreviousPerformance {
  /** Última vez que hizo cada ejercicio (en cualquier día de la rutina) */
  byExercise: Record<string, PreviousExercise>
  /** Duración (min) de la última vez que hizo ESTE día de la rutina */
  lastDurationMin: number | null
}

const EMPTY: PreviousPerformance = { byExercise: {}, lastDurationMin: null }

/**
 * "La vez pasada hiciste…": lee los últimos entrenamientos del socio activo.
 * `refreshKey` cambia al terminar un entrenamiento para volver a leer.
 */
export function usePreviousPerformance(workoutId: string | null, refreshKey = 0) {
  const { supabase, activeMemberId } = useMember()
  const [data, setData] = useState<PreviousPerformance>(EMPTY)

  useEffect(() => {
    let cancelled = false
    void supabase
      .from('workout_logs')
      .select('id, performed_at, duration_min, workout_id, set_logs(exercise_id, set_number, reps, weight_kg)')
      .eq('member_id', activeMemberId)
      .order('performed_at', { ascending: false })
      .limit(40)
      .then(({ data: logs }) => {
        if (cancelled || !logs) return
        const byExercise: Record<string, PreviousExercise> = {}
        let lastDurationMin: number | null = null
        for (const log of logs) {
          if (lastDurationMin === null && workoutId && log.workout_id === workoutId && log.duration_min) {
            lastDurationMin = log.duration_min
          }
          const sets = (log.set_logs ?? []) as { exercise_id: string; set_number: number; reps: number | null; weight_kg: number | null }[]
          for (const s of sets) {
            // Los logs vienen del más nuevo al más viejo: el primero que aparece es "la vez pasada"
            const prev = byExercise[s.exercise_id]
            if (prev && prev.performedAt !== log.performed_at) continue
            const entry = prev ?? (byExercise[s.exercise_id] = { performedAt: log.performed_at, sets: [] })
            entry.sets.push({ setNumber: s.set_number, reps: s.reps, weightKg: s.weight_kg == null ? null : Number(s.weight_kg) })
          }
        }
        for (const e of Object.values(byExercise)) e.sets.sort((a, b) => a.setNumber - b.setNumber)
        setData({ byExercise, lastDurationMin })
      })
    return () => {
      cancelled = true
    }
  }, [supabase, activeMemberId, workoutId, refreshKey])

  return data
}

/** "60 kg × 10 · 60 × 8 · 62,5 × 6" */
export function formatPreviousSets(sets: PreviousSet[]) {
  return sets
    .map((s, i) => {
      const w = s.weightKg ? `${String(s.weightKg).replace('.', ',')}${i === 0 ? ' kg' : ''}` : 'PC'
      return `${w} × ${s.reps ?? '–'}`
    })
    .join(' · ')
}

export function formatAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  const weeks = Math.floor(days / 7)
  return weeks === 1 ? 'hace 1 semana' : `hace ${weeks} semanas`
}
