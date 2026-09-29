'use client';

import { VideoEmbed } from './VideoEmbed';
import React, { useState, useEffect } from 'react';
import {
  Check,
  Video,
  X,
  Plus,
  Minus,
  Dumbbell,
  Clock,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Flame,
} from 'lucide-react';
import { PrescribedExercise, LoggedSet } from '../../types/platform';
import { PlateCalculator } from './PlateCalculator';
import { sound } from '../../utils/audio';

export interface ActiveWorkoutProps {
  exercises: PrescribedExercise[];
  loggedSets?: LoggedSet[];
  onLogSet: (set: LoggedSet) => void;
  onFinishWorkout?: () => void;
  onExit?: () => void;
}

export const ActiveWorkout: React.FC<ActiveWorkoutProps> = ({
  exercises,
  loggedSets = [],
  onLogSet,
  onFinishWorkout,
  onExit,
}) => {
  const [currentExerciseIdx, setCurrentExerciseIdx] = useState<number>(0);
  const [currentSetNumber, setCurrentSetNumber] = useState<number>(1);
  const [selectedReps, setSelectedReps] = useState<number>(8);
  const [selectedWeight, setSelectedWeight] = useState<number>(80);
  const [selectedRpe, setSelectedRpe] = useState<number>(8);

  // Rest Timer State
  const [isResting, setIsResting] = useState<boolean>(false);
  const [restRemaining, setRestRemaining] = useState<number>(60);
  const [restDuration, setRestDuration] = useState<number>(60);

  // Modales
  const [isVideoModalOpen, setIsVideoModalOpen] = useState<boolean>(false);
  const [isPlateModalOpen, setIsPlateModalOpen] = useState<boolean>(false);

  const activeExercise = exercises[currentExerciseIdx] || exercises[0];

  // Al cambiar de ejercicio: carga y reps sugeridas (o las de la última serie de este ejercicio).
  // No depende de loggedSets: si no, cada serie guardada pisaba el peso que el socio había ajustado.
  const activeId = activeExercise?.id
  useEffect(() => {
    if (!activeExercise) return
    const last = [...loggedSets].reverse().find((s) => s.exerciseId === activeExercise.id)
    setSelectedWeight(last?.weightKg ?? activeExercise.targetWeightKg ?? 0)   // 0 = peso corporal
    const parsedReps = parseInt(activeExercise.targetReps, 10) || 8
    setSelectedReps(last?.reps ?? parsedReps)
    setRestDuration(activeExercise.restSeconds || 60)
    setRestRemaining(activeExercise.restSeconds || 60)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  // Número de la próxima serie de este ejercicio
  useEffect(() => {
    if (!activeId) return
    setCurrentSetNumber(loggedSets.filter((s) => s.exerciseId === activeId).length + 1)
  }, [activeId, loggedSets])

  // Screen Wake Lock API to keep phone screen awake during workout
  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch {
        // WakeLock not supported or denied
      }
    };
    requestWakeLock();

    return () => {
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
    };
  }, []);

  // Rest Timer countdown with sound and vibration
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isResting) {
      interval = setInterval(() => {
        setRestRemaining((prev) => {
          if (prev <= 1) {
            sound.playTimerFinish();
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
              try {
                navigator.vibrate([200, 100, 200]);
              } catch {}
            }
            setIsResting(false);
            return restDuration;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isResting, restDuration]);

  // Completar Serie
  const handleCompleteSet = () => {
    if (!activeExercise) return;
    sound.playClick();
    const newLog: LoggedSet = {
      exerciseId: activeExercise.id,
      setNumber: currentSetNumber,
      reps: selectedReps,
      weightKg: selectedWeight,
      rpe: selectedRpe,
    };
    onLogSet(newLog);

    // Arrancar descanso
    setIsResting(true);
    setRestRemaining(activeExercise.restSeconds || 60);
    setCurrentSetNumber((prev) => prev + 1);
  };

  const handleNextExercise = () => {
    sound.playClick();
    if (currentExerciseIdx < exercises.length - 1) {
      setCurrentExerciseIdx((prev) => prev + 1);
      setIsResting(false);
    }
  };

  const handlePrevExercise = () => {
    sound.playClick();
    if (currentExerciseIdx > 0) {
      setCurrentExerciseIdx((prev) => prev - 1);
      setIsResting(false);
    }
  };

  if (!activeExercise) {
    return (
      <div className="p-8 text-center text-zinc-400 font-mono">
        No hay ejercicios cargados en la sesión.
      </div>
    );
  }

  const completedForThisEx = loggedSets.filter((s) => s.exerciseId === activeExercise.id);
  const isTargetSetsMet = completedForThisEx.length >= activeExercise.targetSets;

  return (
    <div className="fixed inset-0 z-50 bg-[#07090e] text-zinc-100 flex flex-col justify-between p-4 sm:p-6 overflow-y-auto font-sans selection:bg-[#edcc36]/30">
      {/* Barra Superior de Control */}
      <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#edcc36] shadow-[0_0_8px_#edcc36]" />
          <span className="text-xs font-mono font-bold text-[#edcc36] tracking-wider uppercase">
            MODO ENTRENAMIENTO // HUD
          </span>
        </div>

        <div className="flex items-center gap-2">
          {activeExercise.videoUrl && (
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                setIsVideoModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-900 text-xs font-mono text-zinc-300 hover:text-[#edcc36] min-h-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36]"
            >
              <Video className="w-4 h-4 text-[#edcc36]" />
              <span className="hidden sm:inline">Ver Video</span>
            </button>
          )}

          {onExit && (
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                onExit();
              }}
              aria-label="Salir del modo pantalla completa"
              className="p-2 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800 min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[#edcc36]"
            >
              <Minimize2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Navegación entre Ejercicios */}
      <div className="flex items-center justify-between gap-2 py-2">
        <button
          type="button"
          disabled={currentExerciseIdx === 0}
          onClick={handlePrevExercise}
          aria-label="Ejercicio anterior"
          className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-400 disabled:opacity-30 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[#edcc36]"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        <div className="text-center min-w-0 flex-1 px-2">
          <span className="text-[11px] font-mono text-[#edcc36] uppercase tracking-wider block font-bold">
            EJERCICIO {currentExerciseIdx + 1} DE {exercises.length}
          </span>
          <h2 className="text-xl sm:text-3xl font-extrabold font-cyber text-white truncate">
            {activeExercise.name}
          </h2>
          <span className="text-xs font-mono text-zinc-400">
            Objetivo: {activeExercise.targetSets} series × {activeExercise.targetReps} reps · Descanso {activeExercise.restSeconds}s
          </span>
        </div>

        <button
          type="button"
          disabled={currentExerciseIdx === exercises.length - 1}
          onClick={handleNextExercise}
          aria-label="Siguiente ejercicio"
          className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-400 disabled:opacity-30 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[#edcc36]"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* Banner de Objetivo Cumplido */}
      {isTargetSetsMet && (
        <div className="max-w-2xl mx-auto w-full p-3.5 rounded-2xl bg-[#edcc36]/15 border border-[#edcc36]/60 text-white flex flex-col sm:flex-row items-center justify-between gap-3 font-mono text-xs shadow-[0_0_15px_rgba(237,204,54,0.15)]">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#edcc36] text-black font-black flex items-center justify-center text-xs">✓</span>
            <span className="font-bold text-[#edcc36]">
              Objetivo cumplido ({completedForThisEx.length}/{activeExercise.targetSets} series)
            </span>
            <span className="text-zinc-400 hidden sm:inline">· Podés registrar series extra</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {currentExerciseIdx < exercises.length - 1 ? (
              <button
                type="button"
                onClick={handleNextExercise}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#edcc36] text-black font-bold hover:bg-[#ffe156] transition-all min-h-[44px] flex items-center justify-center gap-1.5"
              >
                <span>Siguiente ejercicio</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : onFinishWorkout ? (
              <button
                type="button"
                onClick={onFinishWorkout}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#edcc36] text-black font-bold hover:bg-[#ffe156] transition-all min-h-[44px] flex items-center justify-center gap-1.5"
              >
                <span>Finalizar sesión</span>
                <Check className="w-4 h-4 stroke-[3]" />
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Panel Central Táctico: Carga y Repeticiones */}
      <div className="max-w-2xl mx-auto w-full grid grid-cols-1 sm:grid-cols-2 gap-4 my-2">
        {/* Panel 1: Peso en Barra / Máquina */}
        <div className="p-5 rounded-3xl bg-zinc-950 border border-zinc-800 text-center flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Dumbbell className="w-4 h-4 text-[#edcc36]" />
              <span>CARGA EFECTIVA</span>
            </span>
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                setIsPlateModalOpen(true);
              }}
              className="text-[#edcc36] hover:underline font-bold"
            >
              Calculadora Discos
            </button>
          </div>

          {/* Cifra Gigante de Peso */}
          <div className="my-2">
            <div className="text-6xl sm:text-8xl font-black font-tech text-white tabular-nums tracking-tight">
              {selectedWeight}
            </div>
            <span className="text-sm font-mono text-[#edcc36] font-bold uppercase tracking-widest block">
              KILOGRAMOS (KG)
            </span>
          </div>

          {/* Ajuste Rápido de Peso (+/-) */}
          <div className="flex items-center justify-center gap-2 pt-2 font-mono">
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                setSelectedWeight((w) => Math.max(0, w - 2.5));
              }}
              aria-label="Disminuir peso 2.5 kg"
              className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 text-xl font-bold text-zinc-200 hover:text-white hover:border-zinc-600 flex items-center justify-center min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36]"
            >
              <Minus className="w-5 h-5" />
            </button>
            <span className="text-xs text-zinc-400">± 2.5 kg</span>
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                setSelectedWeight((w) => w + 2.5);
              }}
              aria-label="Aumentar peso 2.5 kg"
              className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 text-xl font-bold text-zinc-200 hover:text-[#edcc36] hover:border-[#edcc36] flex items-center justify-center min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36]"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Panel 2: Repeticiones */}
        <div className="p-5 rounded-3xl bg-zinc-950 border border-zinc-800 text-center flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
            <span>REPS LOGRADAS</span>
            <span className="text-zinc-400">Objetivo: {activeExercise.targetReps}</span>
          </div>

          {/* Cifra Gigante de Reps */}
          <div className="my-2">
            <div className="text-6xl sm:text-8xl font-black font-tech text-[#edcc36] tabular-nums tracking-tight">
              {selectedReps}
            </div>
            <span className="text-sm font-mono text-zinc-400 font-bold uppercase tracking-widest block">
              REPETICIONES
            </span>
          </div>

          {/* Ajuste Rápido de Reps (+/-) */}
          <div className="flex items-center justify-center gap-3 pt-2 font-mono">
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                setSelectedReps((r) => Math.max(1, r - 1));
              }}
              aria-label="Disminuir repeticiones en 1"
              className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 text-xl font-bold text-zinc-200 hover:text-white hover:border-zinc-600 flex items-center justify-center min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36]"
            >
              <Minus className="w-5 h-5" />
            </button>
            <span className="text-xs text-zinc-400">± 1 rep</span>
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                setSelectedReps((r) => r + 1);
              }}
              aria-label="Aumentar repeticiones en 1"
              className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 text-xl font-bold text-zinc-200 hover:text-[#edcc36] hover:border-[#edcc36] flex items-center justify-center min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36]"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Selector de RPE (Esfuerzo Percibido 1 a 10) */}
      <div className="max-w-2xl mx-auto w-full p-3.5 rounded-2xl bg-zinc-950 border border-zinc-900 font-mono text-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-[#edcc36]" />
            <span>RPE (Esfuerzo percibido):</span>
          </span>
          <span className="font-bold text-[#edcc36]">{selectedRpe} / 10</span>
        </div>

        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
          {[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((rpe) => (
            <button
              key={rpe}
              type="button"
              onClick={() => {
                sound.playClick();
                setSelectedRpe(rpe);
              }}
              aria-label={`RPE ${rpe}`}
              className={`flex-1 py-2 px-2.5 rounded-lg font-bold transition-all min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36] ${
                selectedRpe === rpe
                  ? 'bg-[#edcc36] text-black shadow-[0_0_10px_rgba(237,204,54,0.4)]'
                  : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
              }`}
            >
              {rpe}
            </button>
          ))}
        </div>
      </div>

      {/* Temporizador de Descanso Flotante */}
      {isResting && (
        <div className="max-w-2xl mx-auto w-full p-4 rounded-2xl bg-black border-2 border-[#edcc36] shadow-[0_0_25px_rgba(237,204,54,0.3)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-[#edcc36]" />
            <div>
              <span className="text-[10px] font-mono text-zinc-400 block uppercase">
                Tiempo de Descanso Activo
              </span>
              <div className="text-2xl sm:text-3xl font-bold font-tech text-[#edcc36] tabular-nums">
                {Math.floor(restRemaining / 60)}:{String(restRemaining % 60).padStart(2, '0')}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              sound.playClick();
              setIsResting(false);
            }}
            className="py-2 px-4 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-300 hover:text-white min-h-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36]"
          >
            Saltar Descanso
          </button>
        </div>
      )}

      {/* Botón de Completar Serie */}
      <div className="max-w-2xl mx-auto w-full pt-3 space-y-2">
        <button
          type="button"
          onClick={handleCompleteSet}
          className="w-full py-5 px-6 rounded-2xl bg-[#edcc36] hover:bg-[#ffe156] text-black font-cyber font-black text-lg sm:text-xl tracking-wider transition-all shadow-[0_0_25px_rgba(237,204,54,0.45)] flex items-center justify-center gap-3 min-h-[64px] focus-visible:ring-2 focus-visible:ring-[#edcc36]"
        >
          <Check className="w-7 h-7 stroke-[3]" />
          <span>
            {isTargetSetsMet ? `REGISTRAR SERIE EXTRA (#${currentSetNumber})` : `SERIE #${currentSetNumber} COMPLETADA`}
          </span>
        </button>

        {/* Resumen de series ya registradas */}
        {completedForThisEx.length > 0 && (
          <div className="flex items-center justify-center gap-2 flex-wrap font-mono text-xs text-zinc-400 pt-1">
            <span>Series guardadas:</span>
            {completedForThisEx.map((s) => {
              const isExtra = s.setNumber > activeExercise.targetSets;
              return (
                <span
                  key={s.setNumber}
                  className={`px-2 py-0.5 rounded border ${
                    isExtra
                      ? 'bg-amber-950/40 text-amber-300 border-amber-500/40'
                      : 'bg-zinc-900 text-[#edcc36] border-zinc-800'
                  }`}
                >
                  #{s.setNumber}: {s.weightKg}kg × {s.reps} {isExtra ? '(Extra)' : ''}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL CALCULADORA DE DISCOS */}
      {isPlateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <PlateCalculator
            targetKg={selectedWeight}
            onClose={() => setIsPlateModalOpen(false)}
            onSelectWeight={(newW) => setSelectedWeight(newW)}
          />
        </div>
      )}

      {/* MODAL DE VIDEO DEL EJERCICIO */}
      {isVideoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h4 className="font-cyber font-bold text-white text-base truncate">
                {activeExercise.name}
              </h4>
              <button
                type="button"
                onClick={() => setIsVideoModalOpen(false)}
                aria-label="Cerrar video"
                className="p-2 text-zinc-400 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-[#edcc36]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-zinc-900">
              <VideoEmbed url={activeExercise.videoUrl!} title={activeExercise.name} />
            </div>

            {activeExercise.notes && (
              <p className="text-xs font-mono text-zinc-400 bg-zinc-900/60 p-3 rounded-xl border border-zinc-800">
                <strong>Clave técnica:</strong> {activeExercise.notes}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
