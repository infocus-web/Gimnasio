'use client'

'use client';

import React, { useState } from 'react';
import { Dumbbell, X, Plus, Minus, Info } from 'lucide-react';
import { sound } from '../../utils/audio';

export interface PlateCalculatorProps {
  targetKg: number;
  barKg?: number; // 20 kg por defecto
  availablePlates?: number[]; // [25, 20, 15, 10, 5, 2.5, 1.25]
  onClose?: () => void;
  onSelectWeight?: (newWeightKg: number) => void;
}

export const PlateCalculator: React.FC<PlateCalculatorProps> = ({
  targetKg: initialTargetKg,
  barKg = 20,
  availablePlates = [25, 20, 15, 10, 5, 2.5, 1.25],
  onClose,
  onSelectWeight,
}) => {
  const [currentWeight, setCurrentWeight] = useState<number>(initialTargetKg);

  // Ordenar discos de mayor a menor
  const sortedPlates = [...availablePlates].sort((a, b) => b - a);

  // Calcular discos por lado
  const weightToDistribute = Math.max(0, currentWeight - barKg);
  const targetPerSide = weightToDistribute / 2;

  let remaining = targetPerSide;
  const platesPerSide: { weight: number; count: number }[] = [];

  for (const plate of sortedPlates) {
    if (remaining >= plate - 0.01) {
      const count = Math.floor((remaining + 0.001) / plate);
      if (count > 0) {
        platesPerSide.push({ weight: plate, count });
        remaining -= count * plate;
      }
    }
  }

  const actualWeight = barKg + platesPerSide.reduce((acc, p) => acc + p.weight * p.count * 2, 0);
  const isExact = Math.abs(actualWeight - currentWeight) < 0.1;

  const adjustWeight = (delta: number) => {
    sound.playClick();
    const next = Math.max(barKg, +(currentWeight + delta).toFixed(1));
    setCurrentWeight(next);
    onSelectWeight?.(next);
  };

  const getPlateHeightPx = (weight: number) => {
    if (weight >= 25) return 86;
    if (weight >= 20) return 80;
    if (weight >= 15) return 72;
    if (weight >= 10) return 60;
    if (weight >= 5) return 48;
    if (weight >= 2.5) return 38;
    return 30; // 1.25 kg
  };

  return (
    <div className="w-full max-w-md mx-auto p-5 sm:p-6 rounded-3xl bg-zinc-950 border border-[#edcc36]/40 text-left font-sans shadow-2xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-black border border-[#edcc36]/50 flex items-center justify-center text-[#edcc36]">
            <Dumbbell className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-cyber font-bold text-white text-base">Calculadora de Discos</h3>
            <span className="text-[10px] font-mono text-zinc-400">Barra olímpica estándar de {barKg} kg</span>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              onClose();
            }}
            aria-label="Cerrar calculadora de discos"
            className="p-2 text-zinc-400 hover:text-white rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[#edcc36]"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Selector de Carga Objetivo */}
      <div className="p-4 rounded-2xl bg-black border border-zinc-900 flex items-center justify-between">
        <div>
          <span className="text-[10px] font-mono text-zinc-400 uppercase block">Carga Objetivo</span>
          <div className="text-2xl sm:text-3xl font-bold font-tech text-[#edcc36] tabular-nums">
            {currentWeight} <span className="text-xs text-zinc-400">kg</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 font-mono">
          <button
            type="button"
            onClick={() => adjustWeight(-5)}
            aria-label="Restar 5 kg"
            className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 hover:text-white flex items-center justify-center font-bold text-xs min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36]"
          >
            -5
          </button>
          <button
            type="button"
            onClick={() => adjustWeight(-2.5)}
            aria-label="Restar 2.5 kg"
            className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 hover:text-white flex items-center justify-center font-bold text-xs min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36]"
          >
            -2.5
          </button>
          <button
            type="button"
            onClick={() => adjustWeight(2.5)}
            aria-label="Sumar 2.5 kg"
            className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 hover:text-[#edcc36] flex items-center justify-center font-bold text-xs min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36]"
          >
            +2.5
          </button>
          <button
            type="button"
            onClick={() => adjustWeight(5)}
            aria-label="Sumar 5 kg"
            className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 hover:text-[#edcc36] flex items-center justify-center font-bold text-xs min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36]"
          >
            +5
          </button>
        </div>
      </div>

      {/* Visualizador de Barra Cargada (mitad derecha de la manga) */}
      <div className="p-4 rounded-2xl bg-black border border-zinc-900 flex flex-col items-center justify-center min-h-[140px]">
        <span className="text-[10px] font-mono text-zinc-400 mb-3 uppercase tracking-wider">
          Manga (Por cada lado de la barra):
        </span>

        {/* Gráfico SVG/CSS de la barra y discos */}
        <div className="flex items-center justify-center gap-1.5 h-24 relative w-full overflow-x-auto px-4">
          {/* Cuello de la barra */}
          <div className="w-5 h-16 bg-zinc-800 border-r-2 border-zinc-600 shrink-0 rounded-l" />

          {/* Discos cargados */}
          {platesPerSide.length === 0 ? (
            <div className="text-xs font-mono text-zinc-400 italic">Barra olímpica sin discos (20 kg)</div>
          ) : (
            platesPerSide.map((group) =>
              Array.from({ length: group.count }).map((_, i) => (
                <div
                  key={`${group.weight}-${i}`}
                  style={{ height: `${getPlateHeightPx(group.weight)}px` }}
                  className="w-6 rounded-md bg-[#edcc36] border border-black flex flex-col items-center justify-center text-black font-tech font-black text-[9px] shadow-[0_0_8px_rgba(237,204,54,0.3)] shrink-0 select-none"
                >
                  <span className="transform -rotate-90">{group.weight}</span>
                </div>
              ))
            )
          )}

          {/* Manga final de la barra */}
          <div className="w-12 h-6 bg-zinc-700 rounded-r shrink-0 border border-zinc-600" />
        </div>
      </div>

      {/* Lista Desglosada de Discos por lado */}
      <div className="space-y-1.5 font-mono text-xs">
        <div className="flex items-center justify-between text-zinc-400 text-[11px] pb-1 border-b border-zinc-900">
          <span>Desglose por lado:</span>
          <span>{targetPerSide.toFixed(2)} kg / lado</span>
        </div>

        {platesPerSide.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 pt-1">
            {platesPerSide.map((p) => (
              <div
                key={p.weight}
                className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between text-zinc-200"
              >
                <span className="font-bold text-[#edcc36]">{p.count} ×</span>
                <span>Disco {p.weight} kg</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-2 text-zinc-400 text-xs">
            Solo barra (20 kg)
          </div>
        )}
      </div>

      {!isExact && (
        <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs font-mono text-amber-200 flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            Peso alcanzable más cercano con discos estándar: {actualWeight} kg
          </span>
        </div>
      )}
    </div>
  );
};
