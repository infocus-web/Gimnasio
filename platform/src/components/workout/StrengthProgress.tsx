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
import { Award, Target, Activity, Dumbbell } from 'lucide-react';
import { PrescribedExercise, LoggedSet } from '../../types/platform';
import { sound } from '../../utils/audio';
import { fmtKg } from './format';

// Día local del gimnasio (no la fecha UTC): un entrenamiento a las 22 h no cae en el día siguiente
const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const localDayKey = (iso?: string) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : dayKeyFormatter.format(d); // AAAA-MM-DD
};

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
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>(exercises[0]?.id ?? '');

  // La rutina carga después del primer render: si la selección no existe, usar el primer ejercicio
  const selectedExercise = exercises.find((e) => e.id === selectedExerciseId) || exercises[0];
  const effectiveId = selectedExercise?.id ?? selectedExerciseId;

  // Filtrar series registradas para el ejercicio seleccionado
  const exerciseSets = loggedSets.filter((s) => s.exerciseId === effectiveId);

  // Calcular 1RM estimado con fórmula de Epley: peso * (1 + reps / 30)
  const calculate1RM = (weight: number, reps: number) => {
    if (reps <= 0 || weight <= 0) return 0;
    if (reps === 1) return weight;
    return Math.round(weight * (1 + reps / 30));
  };

  // Mejor 1RM estimado: solo con series reales registradas (nunca a partir del peso sugerido)
  let best1RM = 0;
  exerciseSets.forEach((set) => {
    const rm = calculate1RM(set.weightKg, set.reps);
    if (rm > best1RM) best1RM = rm;
  });

  const repBreakdown = [
    { label: 'Fuerza máxima', pct: 100, reps: 1, weight: Math.round(best1RM * 1.0) },
    { label: 'Fuerza', pct: 92, reps: 3, weight: Math.round(best1RM * 0.92) },
    { label: 'Fuerza base', pct: 87, reps: 5, weight: Math.round(best1RM * 0.87) },
    { label: 'Hipertrofia', pct: 80, reps: 8, weight: Math.round(best1RM * 0.80) },
    { label: 'Volumen', pct: 75, reps: 10, weight: Math.round(best1RM * 0.75) },
    { label: 'Resistencia', pct: 70, reps: 12, weight: Math.round(best1RM * 0.70) },
  ];

  // Puntos del gráfico de evolución
  // Un punto por día de entrenamiento: la mejor serie de ese día, en orden de fecha
  const byDay = new Map<string, { weightKg: number; reps: number; estimated1RM: number }>();
  for (const s of exerciseSets) {
    if (!s.weightKg || !s.reps) continue;
    const day = localDayKey(s.performedAt);
    if (!day) continue;
    const rm = calculate1RM(s.weightKg, s.reps);
    const cur = byDay.get(day);
    if (!cur || rm > cur.estimated1RM) byDay.set(day, { weightKg: s.weightKg, reps: s.reps, estimated1RM: rm });
  }
  const chartData = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({ setLabel: `${day.slice(8, 10)}/${day.slice(5, 7)}`, ...v }));

  if (isLoading) {
    return (
      <div className="w-full max-w-2xl mx-auto p-6 rounded-3xl bg-zinc-950 border border-zinc-800 animate-pulse space-y-4" aria-busy="true">
        <div className="h-6 bg-zinc-900 rounded w-1/3" />
        <div className="h-48 bg-zinc-900 rounded-2xl" />
        <div className="h-32 bg-zinc-900 rounded-2xl" />
      </div>
    );
  }

  if (exercises.length === 0) {
    return (
      <div className="w-full max-w-2xl mx-auto space-y-2 rounded-3xl border border-zinc-800 bg-zinc-950 p-6 text-center">
        <Dumbbell className="mx-auto h-8 w-8 text-[#edcc36]" aria-hidden="true" />
        <h2 className="text-lg font-bold text-white">Todavía no hay progreso para mostrar</h2>
        <p className="text-sm text-zinc-400">
          Cuando tu profe te asigne una rutina y registres tus series en Entrenar, vas a ver acá cómo evoluciona tu fuerza.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 text-left font-sans">
      {/* Header */}
      <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#edcc36] mb-1 font-semibold">
            <Activity className="w-3.5 h-3.5" />
            <span>Últimos 4 meses</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold font-cyber text-white">Progreso de fuerza</h2>
        </div>

        {/* Cifra de 1RM Destacada */}
        <div className="p-3 rounded-2xl bg-black border border-[#edcc36]/40 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#edcc36]/15 border border-[#edcc36]/40 flex items-center justify-center text-[#edcc36]">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] text-zinc-400 block">1RM estimado (Epley)</span>
            {best1RM ? (
              <div className="text-xl sm:text-2xl font-bold font-tech text-[#edcc36] tabular-nums">
                {fmtKg(best1RM)} <span className="text-xs text-zinc-400">kg</span>
              </div>
            ) : (
              <div className="text-sm font-semibold text-zinc-300">Sin registros todavía</div>
            )}
          </div>
        </div>
      </div>

      {/* Selector de Ejercicio */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
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
            <span className="text-xs text-white font-semibold">
              Evolución de carga y 1RM estimado
            </span>
            <span className="text-[11px] text-[#edcc36] font-semibold">
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
                        <div className="bg-black/95 border border-[#edcc36]/50 rounded-xl p-2.5 text-xs text-left shadow-lg">
                          <span className="text-[#edcc36] font-bold block font-mono">{d.setLabel}</span>
                          <span className="text-zinc-300 block">Mejor serie: {fmtKg(d.weightKg)} kg × {d.reps} reps</span>
                          <span className="text-white font-bold block">1RM estimado: {fmtKg(d.estimated1RM)} kg</span>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="estimated1RM"
                  name="1RM estimado"
                  stroke="#edcc36"
                  strokeWidth={2.5}
                  dot={{ fill: '#edcc36', r: 4, stroke: '#09090b', strokeWidth: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="weightKg"
                  name="Carga levantada"
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
        <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-400 text-center">
          Sin registros todavía. Registrá series con peso en Entrenar para ver tu evolución.
        </div>
      )}

      {/* Tabla de % de cargas sugeridas (solo con un 1RM calculado a partir de series reales) */}
      {best1RM > 0 && (
      <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950 border border-zinc-800 space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
          <span className="text-xs text-zinc-300 font-semibold flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-[#edcc36]" />
            <span>Pesos de referencia según tu 1RM</span>
          </span>
          <span className="text-[11px] text-zinc-400">
            Base: <span className="font-mono">{fmtKg(best1RM)}</span> kg
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {repBreakdown.map((row) => (
            <div
              key={row.reps}
              className={`p-3 rounded-2xl border transition-all ${
                row.reps === 8
                  ? 'bg-zinc-900 border-[#edcc36]/60 shadow-[0_0_12px_rgba(237,204,54,0.15)]'
                  : 'bg-black/60 border-zinc-800'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                <span><span className="font-mono">{row.pct}%</span> 1RM</span>
                <span className={row.reps === 8 ? 'text-[#edcc36] font-bold' : ''}>
                  {row.reps} {row.reps === 1 ? 'rep' : 'reps'}
                </span>
              </div>
              <div className="text-xl font-bold font-tech text-white tabular-nums">
                {fmtKg(row.weight)} <span className="text-xs font-normal text-zinc-400">kg</span>
              </div>
              <span className="text-[10px] text-zinc-400 block truncate mt-0.5">{row.label}</span>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
};
