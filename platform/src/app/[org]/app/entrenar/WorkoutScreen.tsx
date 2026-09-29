'use client'

import { useRef, useState } from 'react'
import { Dumbbell, Play } from 'lucide-react'
import { ActiveWorkout } from '@/components/workout/ActiveWorkout'
import { useMember } from '@/features/member/MemberProvider'
import { useProgram } from '@/features/member/useProgram'
import type { LoggedSet } from '@/types/platform'

export function WorkoutScreen() {
  const { supabase, org, activeMemberId } = useMember()
  const { program, loading, error } = useProgram()
  const todayIso = ((new Date().getDay() + 6) % 7) + 1
  const [dayIdx, setDayIdx] = useState<number | null>(null)
  const [running, setRunning] = useState(false)
  const [loggedSets, setLoggedSets] = useState<LoggedSet[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const workoutLogId = useRef<string | null>(null)

  if (loading) {
    return <div className="h-48 animate-pulse rounded-3xl border border-zinc-800 bg-zinc-950" aria-busy="true" />
  }
  if (error) {
    return <p role="alert" className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{error}</p>
  }
  if (!program || program.days.length === 0) {
    return (
      <div className="space-y-2 rounded-3xl border border-zinc-800 bg-zinc-950 p-6 text-center">
        <Dumbbell className="mx-auto h-8 w-8 text-[#edcc36]" aria-hidden="true" />
        <h1 className="text-lg font-bold text-white">Todavía no tenés una rutina asignada</h1>
        <p className="text-sm text-zinc-400">Tu profe te la asigna desde su panel. Consultalo en el gimnasio.</p>
      </div>
    )
  }

  const selected =
    program.days[dayIdx ?? Math.max(0, program.days.findIndex((d) => d.dayIndex === todayIso))] ?? program.days[0]!

  const logSet = async (set: LoggedSet) => {
    setLoggedSets((prev) => [...prev.filter((s) => !(s.exerciseId === set.exerciseId && s.setNumber === set.setNumber)), set])
    setSaveError(null)
    try {
      if (!workoutLogId.current) {
        const { data, error } = await supabase
          .from('workout_logs')
          .insert({ org_id: org.id, member_id: activeMemberId, assignment_id: program.assignmentId, workout_id: selected.workoutId })
          .select('id')
          .single()
        if (error) throw error
        workoutLogId.current = data.id
      }
      const { error } = await supabase.from('set_logs').upsert(
        {
          org_id: org.id,
          workout_log_id: workoutLogId.current,
          exercise_id: set.exerciseId,
          set_number: set.setNumber,
          reps: set.reps,
          weight_kg: set.weightKg,
          rpe: set.rpe ?? null,
        },
        { onConflict: 'workout_log_id,exercise_id,set_number' },
      )
      if (error) throw error
    } catch {
      setSaveError('No se pudo guardar la última serie. Revisá tu conexión: quedó anotada en pantalla.')
    }
  }

  if (running) {
    return (
      <>
        <ActiveWorkout
          exercises={selected.exercises}
          loggedSets={loggedSets}
          onLogSet={logSet}
          onFinishWorkout={() => setRunning(false)}
          onExit={() => setRunning(false)}
        />
        {saveError && (
          <p role="alert" className="fixed inset-x-4 top-4 z-[60] rounded-2xl border border-red-500/50 bg-black p-3 text-sm text-red-200">
            {saveError}
          </p>
        )}
      </>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#edcc36]">Rutina asignada</p>
        <h1 className="text-2xl font-extrabold text-white">{program.programName}</h1>
      </div>

      {program.days.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Día de la rutina">
          {program.days.map((d, i) => (
            <button
              key={d.workoutId}
              type="button"
              role="tab"
              aria-selected={d.workoutId === selected.workoutId}
              onClick={() => setDayIdx(i)}
              className={`min-h-[44px] shrink-0 rounded-xl border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36] ${
                d.workoutId === selected.workoutId
                  ? 'border-[#edcc36] bg-[#edcc36] text-black'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-300'
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}

      <ul className="space-y-2">
        {selected.exercises.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{e.name}</p>
              <p className="text-xs text-zinc-400">
                {e.targetSets} × {e.targetReps}
                {e.targetWeightKg ? ` · ${e.targetWeightKg} kg` : ''} · descanso {e.restSeconds}s
              </p>
            </div>
            {e.muscleGroup && (
              <span className="shrink-0 rounded-lg border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300">{e.muscleGroup}</span>
            )}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => {
          workoutLogId.current = null
          setLoggedSets([])
          setRunning(true)
        }}
        className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-[#edcc36] text-base font-extrabold text-black shadow-[0_0_25px_-3px_rgba(237,204,54,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <Play className="h-5 w-5" aria-hidden="true" />
        Empezar entrenamiento
      </button>
    </div>
  )
}
