'use client'

'use client';

import React, { useState } from 'react';
import { Clock, Users, ShieldAlert, CheckCircle2, AlertCircle } from 'lucide-react';
import { PeakHourSlot } from '../../types/platform';
import { sound } from '../../utils/audio';

const hourOf = (hhmm: string) => parseInt(hhmm.split(':')[0] ?? '0', 10);

export interface OpeningHourItem {
  weekday: number; // 1 = Lunes ... 7 = Domingo (ISO)
  open: string;
  close: string;
}

export interface PeakHoursProps {
  data: PeakHourSlot[];
  openingHours: OpeningHourItem[];
  currentEstimate?: 'quiet' | 'moderate' | 'busy' | 'closed';
  currentHour?: number;
  currentWeekday?: number; // 1 = Lunes ... 7 = Domingo (ISO)
  isLoading?: boolean;
}

export const PeakHours: React.FC<PeakHoursProps> = ({
  data,
  openingHours,
  currentEstimate,
  currentHour = 19,
  currentWeekday = 1,
  isLoading = false,
}) => {
  const [selectedDay, setSelectedDay] = useState<number>(currentWeekday);

  const dayLabels = [
    { num: 1, name: 'Lunes', short: 'Lun' },
    { num: 2, name: 'Martes', short: 'Mar' },
    { num: 3, name: 'Miércoles', short: 'Mié' },
    { num: 4, name: 'Jueves', short: 'Jue' },
    { num: 5, name: 'Viernes', short: 'Vie' },
    { num: 6, name: 'Sábado', short: 'Sáb' },
    { num: 7, name: 'Domingo', short: 'Dom' },
  ];

  // Horario de apertura para el día seleccionado
  const selectedDayOpening = openingHours.find((h) => h.weekday === selectedDay) || {
    open: '07:00',
    close: '22:00',
  };

  // Horario para el día actual
  const todayOpening = openingHours.find((h) => h.weekday === currentWeekday) || {
    open: '07:00',
    close: '22:00',
  };

  // Determinar si "ahora" está cerrado por prop o por horas
  // Si el servidor informa el estado, manda el servidor; si no, se deduce del horario.
  const isCurrentlyClosed = currentEstimate
    ? currentEstimate === 'closed'
    : currentHour < hourOf(todayOpening.open) || currentHour >= hourOf(todayOpening.close);

  // El nivel "ahora" viene estrictamente de currentEstimate si está provisto
  const effectiveEstimate: 'quiet' | 'moderate' | 'busy' | 'closed' = isCurrentlyClosed
    ? 'closed'
    : (currentEstimate || 'moderate');

  // Horas del día según apertura
  const openHourNum = hourOf(selectedDayOpening.open);
  const closeHourNum = hourOf(selectedDayOpening.close);
  const hours = Array.from({ length: Math.max(1, closeHourNum - openHourNum) }, (_, i) => openHourNum + i);

  // Filtrar datos para el día seleccionado
  const daySlots = data.filter((d) => d.weekday === selectedDay);
  const maxInDay = Math.max(1, ...daySlots.map((d) => d.avgCheckins));

  // Render del estado "Ahora"
  const renderNowBadge = () => {
    if (effectiveEstimate === 'closed') {
      return (
        <span className="font-bold font-mono px-2.5 py-1 rounded-xl border border-red-500/40 bg-red-950/40 text-red-300 text-xs flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
          <span>Cerrado · abre a las {todayOpening.open}</span>
        </span>
      );
    }
    if (effectiveEstimate === 'quiet') {
      return (
        <span className="font-bold font-mono px-2.5 py-1 rounded-xl border border-[#edcc36]/50 bg-[#edcc36]/15 text-[#edcc36] text-xs flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Tranquilo</span>
        </span>
      );
    }
    if (effectiveEstimate === 'busy') {
      return (
        <span className="font-bold font-mono px-2.5 py-1 rounded-xl border border-red-500/50 bg-red-950/30 text-red-300 text-xs flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-red-400" />
          <span>Lleno (Hora Pico)</span>
        </span>
      );
    }
    return (
      <span className="font-bold font-mono px-2.5 py-1 rounded-xl border border-amber-400/50 bg-amber-950/30 text-amber-300 text-xs flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5 text-amber-400" />
        <span>Moderado</span>
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-2xl mx-auto p-6 rounded-3xl bg-zinc-950 border border-zinc-800 animate-pulse space-y-4">
        <div className="h-6 bg-zinc-900 rounded w-1/3" />
        <div className="h-40 bg-zinc-900 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 text-left font-sans">
      {/* Header con Estado en Vivo */}
      <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-[#edcc36] tracking-wider uppercase mb-1 font-bold">
            <Clock className="w-3.5 h-3.5" />
            <span>OCUPACIÓN HISTÓRICA POR FRANJA</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold font-cyber text-white">Horarios Pico</h2>
        </div>

        {/* Indicador de "Ahora" */}
        <div className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-black border border-zinc-850">
          <div className="w-2.5 h-2.5 rounded-full bg-[#edcc36] animate-pulse shadow-[0_0_8px_#edcc36]" />
          <div className="font-mono text-xs">
            <span className="text-zinc-400 block text-[10px] uppercase">
              Ahora ({currentHour.toString().padStart(2, '0')}:00):
            </span>
            <div className="mt-1">{renderNowBadge()}</div>
          </div>
        </div>
      </div>

      {/* Selector de Día (1=Lunes a 7=Domingo ISO) */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none font-mono text-xs">
        {dayLabels.map((d) => (
          <button
            key={d.num}
            type="button"
            onClick={() => {
              sound.playClick();
              setSelectedDay(d.num);
            }}
            className={`px-3 py-2 rounded-xl transition-all border whitespace-nowrap min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36] focus-visible:outline-none ${
              selectedDay === d.num
                ? 'bg-[#edcc36] text-black font-bold border-[#edcc36] shadow-[0_0_12px_rgba(237,204,54,0.3)]'
                : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700'
            }`}
            aria-label={d.name}
            aria-pressed={selectedDay === d.num}
          >
            {d.short}
          </button>
        ))}
      </div>

      {/* Mapa de Calor / Gráfico de Barras por Horas */}
      <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950 border border-zinc-800 space-y-4">
        <div className="flex items-center justify-between text-xs font-mono text-zinc-400 flex-wrap gap-2">
          <span>
            Horario: {selectedDayOpening.open} – {selectedDayOpening.close}
          </span>
          <span className="text-[#edcc36] font-bold">
            Pico de hoy: {daySlots.length ? `${daySlots.reduce((prev, curr) => (curr.avgCheckins > prev.avgCheckins ? curr : prev)).hour}:00` : '—'}
          </span>
        </div>

        {/* Gráfico de Barras Térmico */}
        <div className="grid grid-flow-col auto-cols-fr gap-1.5 pt-2 items-end h-40 border-b border-zinc-900 pb-2">
          {hours.map((h) => {
            const slot = daySlots.find((s) => s.hour === h);
            const val = slot?.avgCheckins || 8;
            const pct = Math.round((val / maxInDay) * 100);
            const isCurrent = selectedDay === currentWeekday && h === currentHour;

            // Nivel de calor
            let bgStyle = 'bg-zinc-800';
            if (val > 38) {
              bgStyle = 'bg-[#edcc36] shadow-[0_0_10px_#edcc36]';
            } else if (val > 22) {
              bgStyle = 'bg-[#edcc36]/70';
            } else if (val > 12) {
              bgStyle = 'bg-[#edcc36]/40';
            } else {
              bgStyle = 'bg-zinc-800';
            }

            return (
              <div key={h} className="flex flex-col items-center h-full justify-end group relative min-w-0">
                {/* Tooltip on hover */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-10 bg-black border border-[#edcc36] px-2 py-1 rounded text-[10px] font-mono text-white pointer-events-none whitespace-nowrap z-20 shadow-lg">
                  {h}:00 ({val} socios)
                </div>

                <div
                  style={{ height: `${Math.max(14, pct)}%` }}
                  className={`w-full rounded-t-md transition-all ${bgStyle} ${
                    isCurrent ? 'ring-2 ring-white shadow-[0_0_8px_#ffffff]' : ''
                  }`}
                />
                <span
                  className={`text-[9px] font-mono mt-1 ${
                    isCurrent ? 'text-[#edcc36] font-bold' : 'text-zinc-400'
                  }`}
                >
                  {h}
                </span>
              </div>
            );
          })}
        </div>

        {/* Referencias */}
        <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 pt-1 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-zinc-800" />
              <span>Tranquilo (&lt;20)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-[#edcc36]/60" />
              <span>Moderado</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-[#edcc36]" />
              <span>Pico (&gt;38)</span>
            </span>
          </div>

          <span className="text-[10px] text-zinc-400 hidden sm:inline">
            Promedio de asistencia
          </span>
        </div>
      </div>
    </div>
  );
};
