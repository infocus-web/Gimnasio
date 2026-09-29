'use client'

'use client';

import React, { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { Award, Target, Activity } from 'lucide-react';
import { PrescribedExercise, LoggedSet } from '../../types/platform';
import { sound } from '../../utils/audio';

export interface StrengthProgressProps {
  exercises: PrescribedExercise[];
  loggedSets: LoggedSet[];
  isLoading?: boolean;
}

export const StrengthProgress: React.FC<StrengthProgressProps> = ({
  exercises,
  loggedSets,
  isLoading = false,
}) => {
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>(
    exercises[0]?.id || 'ex_squat'
  );

  // La rutina carga después del primer render: si la selección no existe, usar el primer ejercicio
  const selectedExercise = exercises.find((e) => e.id === selectedExerciseId) || exercises[0];
  const effectiveId = selectedExercise?.id ?? selectedExerciseId;

  // Filtrar series registradas para el ejercicio seleccionado
  const exerciseSets = loggedSets.filter((s) => s.exerciseId === effectiveId);

  // Calcular 1RM estimado con fórmula de Epley: peso * (1 + reps / 30)
  const calculate1RM = (weight: number, reps: number) => {
    if (reps === 1) return weight;
    return Math.round(weight * (1 + reps / 30));
  };

  // Calcular el mejor 1RM histórico
  let best1RM = 0;

  exerciseSets.forEach((set) => {
    const rm = calculate1RM(set.weightKg, set.reps);
    if (rm > best1RM) {
      best1RM = rm;
    }
  });

  // Si no hay series históricas, usar la carga del ejercicio prescrito como base
  if (best1RM === 0 && selectedExercise?.targetWeightKg) {
    const baseReps = parseInt(selectedExercise.targetReps, 10) || 8;
    best1RM = calculate1RM(selectedExercise.targetWeightKg, baseReps);
  }
  // Sin series ni peso sugerido: no se inventa un 1RM (se muestra "—")

  const repBreakdown = [
    { label: '1RM (Fuerza Absoluta)', pct: 100, reps: 1, weight: Math.round(best1RM * 1.0) },
    { label: '3RM (Fuerza Máxima)', pct: 92, reps: 3, weight: Math.round(best1RM * 0.92) },
    { label: '5RM (Fuerza Base)', pct: 87, reps: 5, weight: Math.round(best1RM * 0.87) },
    { label: '8RM (Hipertrofia)', pct: 80, reps: 8, weight: Math.round(best1RM * 0.80) },
    { label: '10RM (Volumen)', pct: 75, reps: 10, weight: Math.round(best1RM * 0.75) },
    { label: '12RM (Resistencia)', pct: 70, reps: 12, weight: Math.round(best1RM * 0.70) },
  ];

  // Puntos del gráfico de evolución
  // Un punto por día de entrenamiento: la mejor serie de ese día, en orden de fecha
  const byDay = new Map<string, { weightKg: number; reps: number; estimated1RM: number }>();
  for (const s of exerciseSets) {
    if (!s.weightKg) continue;
    const day = (s.performedAt ?? '').slice(0, 10) || 'sin fecha';
    const rm = calculate1RM(s.weightKg, s.reps);
    const cur = byDay.get(day);
    if (!cur || rm > cur.estimated1RM) byDay.set(day, { weightKg: s.weightKg, reps: s.reps, estimated1RM: rm });
  }
  const chartData = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({ setLabel: day.length === 10 ? `${day.slice(8, 10)}/${day.slice(5, 7)}` : day, ...v }));

  if (isLoading) {
    return (
      <div className="w-full max-w-2xl mx-auto p-6 rounded-3xl bg-zinc-950 border border-zinc-800 animate-pulse space-y-4">
        <div className="h-6 bg-zinc-900 rounded w-1/3" />
        <div className="h-48 bg-zinc-900 rounded-2xl" />
        <div className="h-32 bg-zinc-900 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 text-left font-sans">
      {/* Header */}
      <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-[#edcc36] tracking-wider uppercase mb-1 font-bold">
            <Activity className="w-3.5 h-3.5" />
            <span>ESTIMACIÓN DE 1RM & SOBRECARGA</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold font-cyber text-white">Progreso de Fuerza</h2>
        </div>

        {/* Cifra de 1RM Destacada */}
        <div className="p-3 rounded-2xl bg-black border border-[#edcc36]/40 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#edcc36]/15 border border-[#edcc36]/40 flex items-center justify-center text-[#edcc36]">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-zinc-400 block uppercase">1RM Estimado (Epley)</span>
            <div className="text-xl sm:text-2xl font-bold font-tech text-[#edcc36] tabular-nums">
              {best1RM ? <>{best1RM} <span className="text-xs text-zinc-400">kg</span></> : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Selector de Ejercicio */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none font-mono text-xs">
        {exercises.map((ex) => (
          <button
            key={ex.id}
            type="button"
            onClick={() => {
              sound.playClick();
              setSelectedExerciseId(ex.id);
            }}
            className={`px-3.5 py-2 rounded-xl transition-all border whitespace-nowrap min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36] ${
              effectiveId === ex.id
                ? 'bg-[#edcc36] text-black font-bold border-[#edcc36] shadow-[0_0_12px_rgba(237,204,54,0.3)]'
                : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
            }`}
          >
            {ex.name}
          </button>
        ))}
      </div>

      {/* Gráfico de Evolución de 1RM */}
      {chartData.length > 0 ? (
        <div className="p-4 rounded-3xl bg-zinc-950 border border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-white font-bold uppercase">
              Curva de Cargas & 1RM Estimado
            </span>
            <span className="text-[11px] font-mono text-[#edcc36] font-bold">
              {chartData.length} {chartData.length === 1 ? 'día' : 'días'} registrados
            </span>
          </div>

          <div className="w-full h-52 p-2 rounded-xl bg-black/60 border border-zinc-900">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                <XAxis
                  dataKey="setLabel"
                  stroke="#71717a"
                  tick={{ fill: '#a1a1aa', fontSize: 10, fontFamily: 'sans-serif' }}
                />
                <YAxis
                  stroke="#71717a"
                  tick={{ fill: '#a1a1aa', fontSize: 10, fontFamily: 'sans-serif' }}
                  domain={['dataMin - 10', 'dataMax + 10']}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0]?.payload;
                      if (!d) return null;
                      return (
                        <div className="bg-black/95 border border-[#edcc36]/50 rounded-xl p-2.5 text-xs font-mono text-left shadow-lg">
                          <span className="text-[#edcc36] font-bold block">{d.setLabel}</span>
                          <span className="text-zinc-300 block">Levantado: {d.weightKg} kg × {d.reps} reps</span>
                          <span className="text-white font-bold block">1RM Estimado: {d.estimated1RM} kg</span>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="estimated1RM"
                  name="1RM Estimado"
                  stroke="#edcc36"
                  strokeWidth={2.5}
                  dot={{ fill: '#edcc36', r: 4, stroke: '#09090b', strokeWidth: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="weightKg"
                  name="Carga Levantada"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  dot={{ fill: '#ffffff', r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-400 text-center">
          Registrá tu primera serie en el Modo Entrenamiento para ver tu curva histórica.
        </div>
      )}

      {/* Tabla de % de Cargas Sugeridas */}
      <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950 border border-zinc-800 space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
          <span className="text-xs font-mono text-zinc-300 font-bold uppercase flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-[#edcc36]" />
            <span>Pesos Sugeridos por Zona de Esfuerzo</span>
          </span>
          <span className="text-[10px] font-mono text-zinc-400">{best1RM ? `Base 1RM: ${best1RM} kg` : 'Registrá series con peso para calcularlo'}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono">
          {repBreakdown.map((row) => (
            <div
              key={row.reps}
              className={`p-3 rounded-2xl border transition-all ${
                row.reps === 8
                  ? 'bg-zinc-900 border-[#edcc36]/60 shadow-[0_0_12px_rgba(237,204,54,0.15)]'
                  : 'bg-black/60 border-zinc-850'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
                <span>{row.pct}% 1RM</span>
                <span className={row.reps === 8 ? 'text-[#edcc36] font-bold' : ''}>
                  {row.reps} {row.reps === 1 ? 'rep' : 'reps'}
                </span>
              </div>
              <div className="text-xl font-bold font-tech text-white tabular-nums">
                {row.weight ? <>{row.weight} <span className="text-xs font-normal text-zinc-400">kg</span></> : '—'}
              </div>
              <span className="text-[9px] text-zinc-400 block truncate mt-0.5">{row.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
