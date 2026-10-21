'use client';

import React, { useState } from 'react';
import { Clock, Users, ShieldAlert, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
import { PeakHourSlot } from '../../types/platform';
import { sound } from '../../utils/audio';

const hourOf = (hhmm: string) => parseInt(hhmm.split(':')[0] ?? '0', 10) || 0;
const minutesOf = (hhmm: string) => parseInt(hhmm.split(':')[1] ?? '0', 10) || 0;
const pad = (h: number) => `${String(h).padStart(2, '0')}:00`;

export interface OpeningHourItem {
  weekday: number; // 1 = Lunes ... 7 = Domingo (ISO)
  open: string;
  close: string;
}

export type OccupancyLevel = 'quiet' | 'moderate' | 'busy' | 'closed';

export interface PeakHoursProps {
  data: PeakHourSlot[];
  openingHours: OpeningHourItem[];
  /** Estado en vivo informado por el servidor. Sin dato, no se inventa uno. */
  currentEstimate?: OccupancyLevel;
  currentHour?: number;
  currentWeekday?: number; // 1 = Lunes ... 7 = Domingo (ISO)
  isLoading?: boolean;
  /** Error al cargar el estado en vivo (se muestra chico, sin tapar el histórico). */
  liveError?: string | null;
}

const DAY_LABELS = [
  { num: 1, name: 'lunes', short: 'Lun' },
  { num: 2, name: 'martes', short: 'Mar' },
  { num: 3, name: 'miércoles', short: 'Mié' },
  { num: 4, name: 'jueves', short: 'Jue' },
  { num: 5, name: 'viernes', short: 'Vie' },
  { num: 6, name: 'sábado', short: 'Sáb' },
  { num: 7, name: 'domingo', short: 'Dom' },
];

/** Nivel relativo al máximo del día: así el gráfico sirve igual en un gimnasio chico o grande. */
const levelOf = (val: number, max: number): 'quiet' | 'moderate' | 'busy' => {
  if (max <= 0 || val <= 0) return 'quiet';
  const r = val / max;
  if (r >= 0.75) return 'busy';
  if (r >= 0.4) return 'moderate';
  return 'quiet';
};

const BAR_CLASS = {
  quiet: 'bg-zinc-700',
  moderate: 'bg-[#edcc36]/50',
  busy: 'bg-[#edcc36]',
} as const;

const fmtAvg = (v: number) => {
  const n = Math.round(v);
  if (v > 0 && n === 0) return 'menos de 1 persona';
  return `${n} ${n === 1 ? 'persona' : 'personas'}`;
};

/** Horas a mostrar para un día: según el horario cargado; null = cerrado. */
function hoursForDay(day: number, openingHours: OpeningHourItem[], data: PeakHourSlot[]): number[] | null {
  if (openingHours.length === 0) {
    // El gimnasio no cargó horarios: se muestran las horas que tienen datos
    const hs = data.filter((d) => d.weekday === day).map((d) => d.hour);
    if (!hs.length) return null;
    const min = Math.min(...hs);
    const max = Math.max(...hs);
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }
  const ranges = openingHours.filter((h) => h.weekday === day);
  if (!ranges.length) return null;
  const set = new Set<number>();
  for (const r of ranges) {
    const open = hourOf(r.open);
    let close = hourOf(r.close);
    if (close === 0 && open > 0) close = 24; // cierra a medianoche
    if (minutesOf(r.close) > 0) close += 1; // "22:30" incluye la franja de las 22
    for (let h = open; h < Math.min(24, close); h++) set.add(h);
  }
  const hs = [...set].sort((a, b) => a - b);
  return hs.length ? hs : null;
}

export const PeakHours: React.FC<PeakHoursProps> = ({
  data,
  openingHours,
  currentEstimate,
  currentHour = new Date().getHours(),
  currentWeekday = ((new Date().getDay() + 6) % 7) + 1,
  isLoading = false,
  liveError = null,
}) => {
  const [selectedDay, setSelectedDay] = useState<number>(currentWeekday);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  const isToday = selectedDay === currentWeekday;
  const dayName = DAY_LABELS.find((d) => d.num === selectedDay)?.name ?? '';

  const hours = hoursForDay(selectedDay, openingHours, data);
  const todayRanges = openingHours.filter((h) => h.weekday === currentWeekday);

  // "Ahora": manda el servidor; si no informó, se deduce solo si está cerrado por horario
  const todayHours = hoursForDay(currentWeekday, openingHours, data);
  const closedBySchedule = openingHours.length > 0 && !(todayHours?.includes(currentHour) ?? false);
  const nowLevel: OccupancyLevel | 'unknown' = currentEstimate ?? (closedBySchedule ? 'closed' : 'unknown');

  const daySlots = data.filter((d) => d.weekday === selectedDay && (!hours || hours.includes(d.hour)));
  const maxInDay = Math.max(0, ...daySlots.map((d) => d.avgCheckins));
  const peak = daySlots.length && maxInDay > 0
    ? daySlots.reduce((prev, curr) => (curr.avgCheckins > prev.avgCheckins ? curr : prev))
    : null;

  // Hora con el detalle visible (tocar una barra en el celular): por defecto la actual (hoy) o la del pico
  const detailHour =
    selectedHour !== null && hours?.includes(selectedHour)
      ? selectedHour
      : isToday && hours?.includes(currentHour)
      ? currentHour
      : peak?.hour ?? null;
  const detailVal = detailHour !== null ? daySlots.find((s) => s.hour === detailHour)?.avgCheckins ?? 0 : 0;

  const renderNowBadge = () => {
    const base = 'font-semibold px-2.5 py-1 rounded-xl border text-xs flex items-center gap-1.5';
    if (nowLevel === 'closed') {
      const nextOpen = todayRanges.map((r) => r.open).sort().find((o) => hourOf(o) > currentHour);
      return (
        <span className={`${base} border-red-500/40 bg-red-950/40 text-red-300`}>
          <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
          <span>{nextOpen ? `Cerrado · abre a las ${nextOpen}` : 'Cerrado'}</span>
        </span>
      );
    }
    if (nowLevel === 'quiet') {
      return (
        <span className={`${base} border-[#edcc36]/50 bg-[#edcc36]/15 text-[#edcc36]`}>
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Tranquilo</span>
        </span>
      );
    }
    if (nowLevel === 'busy') {
      return (
        <span className={`${base} border-red-500/50 bg-red-950/30 text-red-300`}>
          <AlertCircle className="w-3.5 h-3.5 text-red-400" />
          <span>Lleno (hora pico)</span>
        </span>
      );
    }
    if (nowLevel === 'moderate') {
      return (
        <span className={`${base} border-amber-400/50 bg-amber-950/30 text-amber-300`}>
          <Users className="w-3.5 h-3.5 text-amber-400" />
          <span>Moderado</span>
        </span>
      );
    }
    return (
      <span className={`${base} border-zinc-700 bg-zinc-900 text-zinc-300`}>
        <HelpCircle className="w-3.5 h-3.5 text-zinc-400" />
        <span>Sin dato</span>
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-2xl mx-auto p-6 rounded-3xl bg-zinc-950 border border-zinc-800 animate-pulse space-y-4" aria-busy="true">
        <div className="h-6 bg-zinc-900 rounded w-1/3" />
        <div className="h-40 bg-zinc-900 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 text-left font-sans">
      {/* Encabezado con estado en vivo */}
      <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#edcc36] mb-1 font-semibold">
            <Clock className="w-3.5 h-3.5" />
            <span>Ocupación promedio por hora</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold font-cyber text-white">Concurrencia</h2>
        </div>

        <div className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-black border border-zinc-800">
          {nowLevel !== 'closed' && nowLevel !== 'unknown' && (
            <div className="w-2.5 h-2.5 rounded-full bg-[#edcc36] animate-pulse shadow-[0_0_8px_#edcc36]" />
          )}
          <div className="text-xs">
            <span className="text-zinc-400 block text-[11px]">
              Ahora (<span className="font-mono">{pad(currentHour)}</span>)
            </span>
            <div className="mt-1">{renderNowBadge()}</div>
            {liveError && <p className="mt-1 text-[11px] text-red-300">{liveError}</p>}
          </div>
        </div>
      </div>

      {/* Selector de día (1 = lunes … 7 = domingo) */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
        {DAY_LABELS.map((d) => (
          <button
            key={d.num}
            type="button"
            onClick={() => {
              sound.playClick();
              setSelectedDay(d.num);
              setSelectedHour(null);
            }}
            className={`px-3 py-2 rounded-xl transition-all border whitespace-nowrap min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36] focus-visible:outline-none ${
              selectedDay === d.num
                ? 'bg-[#edcc36] text-black font-bold border-[#edcc36] shadow-[0_0_12px_rgba(237,204,54,0.3)]'
                : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700'
            }`}
            aria-label={d.name}
            aria-pressed={selectedDay === d.num}
          >
            {d.num === currentWeekday ? 'Hoy' : d.short}
          </button>
        ))}
      </div>

      <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950 border border-zinc-800 space-y-4">
        {!hours ? (
          <div className="py-10 text-center space-y-1">
            <ShieldAlert className="w-7 h-7 text-zinc-600 mx-auto" />
            <p className="font-semibold text-white">Cerrado</p>
            <p className="text-xs text-zinc-400">
              {openingHours.length === 0
                ? `Todavía no hay datos de asistencia para el ${dayName}.`
                : `El gimnasio no abre los ${dayName === 'sábado' || dayName === 'domingo' ? `${dayName}s` : dayName}.`}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs text-zinc-400 flex-wrap gap-2">
              <span>
                {openingHours.length === 0 ? 'Horario no cargado' : (
                  <>
                    Horario:{' '}
                    <span className="font-mono">
                      {openingHours
                        .filter((h) => h.weekday === selectedDay)
                        .map((h) => `${h.open}–${h.close}`)
                        .join(' · ')}
                    </span>
                  </>
                )}
              </span>
              <span className="text-[#edcc36] font-semibold">
                {isToday ? 'Pico de hoy' : `Pico del ${dayName}`}:{' '}
                <span className="font-mono">{peak ? pad(peak.hour) : '—'}</span>
              </span>
            </div>

            {maxInDay <= 0 ? (
              <p className="py-8 text-center text-sm text-zinc-400">
                Todavía no hay suficientes ingresos registrados para este día.
              </p>
            ) : (
              <>
                {/* Gráfico de barras: tocá una barra para ver el detalle */}
                <div className="grid grid-flow-col auto-cols-fr gap-1 pt-2 items-end h-40 border-b border-zinc-900 pb-2">
                  {hours.map((h) => {
                    const val = daySlots.find((s) => s.hour === h)?.avgCheckins ?? 0;
                    const pct = Math.round((val / maxInDay) * 100);
                    const isCurrent = isToday && h === currentHour;
                    const isDetail = detailHour === h;
                    const level = levelOf(val, maxInDay);
                    return (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setSelectedHour(h)}
                        aria-label={`${pad(h)}: ${fmtAvg(val)} en promedio`}
                        aria-pressed={isDetail}
                        className="flex flex-col items-center h-full justify-end min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36] rounded"
                      >
                        <div
                          style={{ height: `${val > 0 ? Math.max(6, pct) : 2}%` }}
                          className={`w-full rounded-t-md transition-all ${BAR_CLASS[level]} ${
                            isDetail ? 'ring-2 ring-white' : isCurrent ? 'ring-1 ring-white/60' : ''
                          }`}
                        />
                        <span
                          className={`text-[9px] font-mono mt-1 ${
                            isCurrent || isDetail ? 'text-[#edcc36] font-bold' : 'text-zinc-400'
                          }`}
                        >
                          {h}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {detailHour !== null && (
                  <p className="text-sm text-zinc-200" aria-live="polite">
                    <span className="font-mono text-[#edcc36]">{pad(detailHour)}</span> · {fmtAvg(detailVal)} en promedio
                    {isToday && detailHour === currentHour ? ' (ahora)' : ''}
                  </p>
                )}

                <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1 flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded ${BAR_CLASS.quiet}`} />
                      <span>Tranquilo</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded ${BAR_CLASS.moderate}`} />
                      <span>Moderado</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded ${BAR_CLASS.busy}`} />
                      <span>Pico</span>
                    </span>
                  </div>
                  <span className="text-[11px] text-zinc-500">Promedio de las últimas semanas</span>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
