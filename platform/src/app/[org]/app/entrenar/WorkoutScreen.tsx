'use client'

import { useEffect, useRef, useState } from 'react'
import { Dumbbell, Play, PlayCircle, Timer, Trophy, X } from 'lucide-react'
import { ActiveWorkout } from '@/components/workout/ActiveWorkout'
import { VideoEmbed } from '@/components/workout/VideoEmbed'
import { useMember } from '@/features/member/MemberProvider'
import { useProgram } from '@/features/member/useProgram'
import { formatAgo, formatPreviousSets, usePreviousPerformance } from '@/features/member/usePreviousPerformance'
import type { LoggedSet } from '@/types/platform'

export function WorkoutScreen() {
  const { supabase, org, activeMemberId } = useMember()
  const { program, loading, error } = useProgram()
  const [dayIdx, setDayIdx] = useState<number | null>(null)
  const [lastWorkoutId, setLastWorkoutId] = useState<string | null>(null)
  const logPromise = useRef<Promise<string> | null>(null)
  const startedAt = useRef<number | null>(null)

  // Día sugerido: el siguiente al último que entrenó (rotación Día 1 → 2 → 3 → 1)
  useEffect(() => {
    if (!program?.assignmentId) return
    let cancelled = false
    void supabase
      .from('workout_logs')
      .select('workout_id')
      .eq('member_id', activeMemberId)
      .eq('assignment_id', program.assignmentId)
      .not('workout_id', 'is', null)
      .order('performed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setLastWorkoutId(data?.workout_id ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [supabase, activeMemberId, program?.assignmentId])
  const [running, setRunning] = useState(false)
  const [loggedSets, setLoggedSets] = useState<LoggedSet[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const workoutLogId = useRef<string | null>(null)
  const [video, setVideo] = useState<{ name: string; url: string; notes?: string } | null>(null)
  const [summary, setSummary] = useState<{ minutes: number; lastMin: number | null; sets: number } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Día elegido (o el sugerido). Se calcula antes de los "return" porque lo usa un hook.
  const days = program?.days ?? []
  const lastIdx = days.findIndex((d) => d.workoutId === lastWorkoutId)
  const suggestedIdx = lastIdx >= 0 ? (lastIdx + 1) % days.length : 0
  const selected = days[dayIdx ?? suggestedIdx] ?? days[0]
  const previous = usePreviousPerformance(selected?.workoutId ?? null, refreshKey)

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

  if (!selected) return null

  const logSet = async (set: LoggedSet) => {
    setLoggedSets((prev) => [...prev.filter((s) => !(s.exerciseId === set.exerciseId && s.setNumber === set.setNumber)), set])
    setSaveError(null)
    try {
      if (!workoutLogId.current) {
        // Un solo registro por entrenamiento aunque se guarden dos series muy rápido
        logPromise.current ??= (async () => {
          const { data, error } = await supabase
            .from('workout_logs')
            .insert({ org_id: org.id, member_id: activeMemberId, assignment_id: program.assignmentId, workout_id: selected.workoutId })
            .select('id')
            .single()
          if (error) {
            logPromise.current = null
            throw error
          }
          return data.id
        })()
        workoutLogId.current = await logPromise.current
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
          previous={previous.byExercise}
          startedAt={startedAt.current}
          lastDurationMin={previous.lastDurationMin}
          onFinishWorkout={() => {
            // Guarda la duración, muestra el resumen y deja listo para el próximo entrenamiento
            if (workoutLogId.current && startedAt.current) {
              const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000))
              setSummary({ minutes, lastMin: previous.lastDurationMin, sets: loggedSets.length })
              void supabase
                .from('workout_logs')
                .update({ duration_min: minutes })
                .eq('id', workoutLogId.current)
                .then(() => setRefreshKey((k) => k + 1))
            }
            if (workoutLogId.current) setLastWorkoutId(selected.workoutId)
            workoutLogId.current = null
            logPromise.current = null
            setLoggedSets([])
            setDayIdx(null)
            setRunning(false)
          }}
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
      {summary && (
        <div role="status" className="relative rounded-3xl border border-[#edcc36]/50 bg-[#edcc36]/10 p-4">
          <button
            type="button"
            onClick={() => setSummary(null)}
            aria-label="Cerrar resumen"
            className="absolute right-2 top-2 grid min-h-[44px] min-w-[44px] place-items-center rounded-xl text-zinc-400 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          <p className="flex items-center gap-2 font-bold text-white">
            <Trophy className="h-5 w-5 text-[#edcc36]" aria-hidden="true" /> ¡Entrenamiento terminado!
          </p>
          <p className="mt-1 text-sm text-zinc-300">
            {summary.sets} series en <strong className="text-white">{summary.minutes} min</strong>
            {summary.lastMin
              ? summary.minutes < summary.lastMin
                ? ` · ${summary.lastMin - summary.minutes} min menos que la vez pasada 💪`
                : summary.minutes === summary.lastMin
                  ? ' · mismo tiempo que la vez pasada'
                  : ` · la vez pasada fueron ${summary.lastMin} min`
              : ''}
          </p>
        </div>
      )}

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

      {previous.lastDurationMin ? (
        <p className="flex items-center gap-1.5 text-xs text-zinc-400">
          <Timer className="h-3.5 w-3.5 text-[#edcc36]" aria-hidden="true" /> La última vez que hiciste este día tardaste {previous.lastDurationMin} min
        </p>
      ) : null}

      <ul className="space-y-2">
        {selected.exercises.map((e) => {
          const prev = previous.byExercise[e.id]
          return (
            <li key={e.id} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{e.name}</p>
                <p className="text-xs text-zinc-400">
                  {e.targetSets} × {e.targetReps}
                  {e.targetWeightKg ? ` · ${e.targetWeightKg} kg` : ''} · descanso {e.restSeconds}s
                </p>
                {prev && (
                  <p className="mt-0.5 truncate text-xs text-zinc-300">
                    <span className="text-zinc-500">Última vez ({formatAgo(prev.performedAt)}):</span> {formatPreviousSets(prev.sets)}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {e.muscleGroup && (
                  <span className="hidden rounded-lg border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 sm:inline">{e.muscleGroup}</span>
                )}
                {e.videoUrl && (
                  <button
                    type="button"
                    onClick={() => setVideo({ name: e.name, url: e.videoUrl!, notes: e.notes })}
                    aria-label={`Ver video de ${e.name}`}
                    className="grid min-h-[44px] min-w-[44px] place-items-center rounded-xl border border-zinc-800 text-[#edcc36] hover:border-[#edcc36] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
                  >
                    <PlayCircle className="h-6 w-6" aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {video && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Video de ${video.name}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
          onClick={() => setVideo(null)}
        >
          <div className="w-full max-w-lg space-y-3 rounded-3xl border border-zinc-800 bg-zinc-950 p-5" onClick={(ev) => ev.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-2">
              <h2 className="truncate text-base font-bold text-white">{video.name}</h2>
              <button
                type="button"
                onClick={() => setVideo(null)}
                aria-label="Cerrar video"
                className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg text-zinc-400 hover:text-white"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="relative aspect-video overflow-hidden rounded-2xl border border-zinc-900 bg-black">
              <VideoEmbed url={video.url} title={video.name} />
            </div>
            {video.notes && <p className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-400">{video.notes}</p>}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          workoutLogId.current = null
          logPromise.current = null
          setLoggedSets([])
          setSummary(null)
          startedAt.current = Date.now()
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
