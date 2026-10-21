'use client';

import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Check,
  AlertTriangle,
  X,
  Bike,
  Lock,
  ChevronRight,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import {
  ClassSession,
  EquipmentSpot,
  BookingErrorCode,
  FamilyMember,
} from '../../types/platform';
import { sound } from '../../utils/audio';
import { formatLateCancelWindow } from './lateCancel';

// Fecha local (zona del celular) como AAAA-MM-DD. Evita que una clase de las
// 22:00 aparezca en el día siguiente por usar la fecha UTC.
const localDateKey = (d: Date) => d.toLocaleDateString('en-CA');

export interface ClassScheduleProps {
  sessions: ClassSession[];
  equipmentSpots?: EquipmentSpot[]; // Para clases que usan equipamiento
  /** Carga el mapa de equipos de una clase al abrir la reserva (datos reales). */
  loadEquipmentSpots?: (sessionId: string) => Promise<EquipmentSpot[]>;
  familyMembers?: FamilyMember[];
  selectedFamilyMemberId?: string;
  onSelectFamilyMember?: (memberId: string) => void;
  onBook: (sessionId: string, equipmentId?: string) => void;
  onWaitlist: (sessionId: string) => void;
  onCancel: (sessionId: string) => void;
  isLoading?: boolean;
  errorCode?: BookingErrorCode | null;
  onDismissError?: () => void;
  /** Clases con una reserva/cancelación en curso (se deshabilita el botón y se muestra un spinner). */
  pendingSessionIds?: ReadonlySet<string>;
  /** Ventana de cancelación tardía del gimnasio (organizations.late_cancel_minutes). */
  lateCancelMinutes?: number;
}

/** Nombre genérico del equipo a partir de las etiquetas ("Bici 12" → "bici"); si no hay patrón común, "lugar". */
const equipmentNoun = (spots: EquipmentSpot[]) => {
  const words = spots.map((s) => s.label.trim().split(/\s+/)[0]?.toLowerCase() ?? '');
  const first = words[0];
  if (first && /^[a-záéíóúñ]+$/.test(first) && words.every((w) => w === first)) return first;
  return 'lugar';
};

const spotShortLabel = (label: string) => {
  const m = label.trim().match(/(\d+)\s*$/);
  return m ? `#${m[1]}` : label;
};

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// Formateador 24 horas estricto con Intl: "19:00 – 20:00"
const format24HourRange = (startsAt: string, endsAt: string) => {
  const formatter = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${formatter.format(new Date(startsAt))} – ${formatter.format(new Date(endsAt))}`;
};

// Formateador de fecha "mar 30 sep"
const formatDayLabel = (d: Date) => {
  const parts = new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).formatToParts(d);
  const weekday = parts.find((p) => p.type === 'weekday')?.value?.replace('.', '') || '';
  const day = parts.find((p) => p.type === 'day')?.value || '';
  const month = parts.find((p) => p.type === 'month')?.value?.replace('.', '') || '';
  return `${weekday} ${day} ${month}`.toLowerCase();
};

export const ClassSchedule: React.FC<ClassScheduleProps> = ({
  sessions,
  equipmentSpots: equipmentSpotsProp = [],
  loadEquipmentSpots,
  familyMembers = [],
  selectedFamilyMemberId,
  onSelectFamilyMember,
  onBook,
  onWaitlist,
  onCancel,
  isLoading = false,
  errorCode = null,
  onDismissError,
  pendingSessionIds,
  lateCancelMinutes = 120,
}) => {
  const [selectedDayOffset, setSelectedDayOffset] = useState<number>(0);
  const [equipmentModalSession, setEquipmentModalSession] = useState<ClassSession | null>(null);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);

  // Generar tira horizontal de 7 días a partir de hoy
  const days = Array.from({ length: 7 }).map((_, idx) => {
    const d = new Date();
    d.setDate(d.getDate() + idx);
    return {
      offset: idx,
      date: d,
      formattedLabel: formatDayLabel(d),
      dayName: idx === 0 ? 'Hoy' : capitalize(d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '')),
      dayNumber: d.getDate(),
      fullDateStr: localDateKey(d),
    };
  });

  const activeDay = days[selectedDayOffset] ?? days[0]!;

  // Filtrar sesiones del día seleccionado
  const filteredSessions = sessions.filter((s) => {
    if (!s.startsAt) return false;
    // Las clases que ya empezaron no se muestran para reservar (salvo que el socio esté anotado)
    if (new Date(s.startsAt).getTime() < Date.now() && !s.myBooking) return false;
    const sessionDate = localDateKey(new Date(s.startsAt));
    return sessionDate === activeDay.fullDateStr;
  });

  const errorMessageMap: Record<BookingErrorCode, string> = {
    MEMBERSHIP_REQUIRED: 'Necesitás un plan activo para reservar clases. Acercate a recepción.',
    PAYMENT_PAST_DUE: 'Tenés una cuota pendiente. Regularizala en recepción para volver a reservar.',
    CLASS_FULL: 'La clase ya completó su cupo de asistencia.',
    ALREADY_BOOKED: 'Ya tenés una reserva confirmada para este horario.',
    EQUIPMENT_TAKEN: 'Ese lugar lo acaba de tomar otro socio. Elegí otro.',
    PLAN_EXCLUDES_CLASS_TYPE: 'Tu plan contratado no incluye esta actividad.',
    NO_CREDITS_LEFT: 'No te quedan créditos disponibles en tu pack de clases.',
    WEEKLY_LIMIT_REACHED: 'Alcanzaste el límite de reservas semanales de tu plan.',
    BOOKING_CLOSED: 'El horario de inscripción para esta clase ya finalizó.',
    MEMBER_TIME_CONFLICT: 'Tenés otra actividad reservada en este mismo intervalo horario.',
  };

  const [loadedSpots, setLoadedSpots] = useState<EquipmentSpot[] | null>(null);
  const [loadingSpotsFor, setLoadingSpotsFor] = useState<string | null>(null);
  const equipmentSpots = loadedSpots ?? equipmentSpotsProp;
  const noun = equipmentNoun(equipmentSpots);

  const isPending = (id: string) => loadingSpotsFor === id || !!pendingSessionIds?.has(id);

  // Cerrar el selector de equipos con Escape
  useEffect(() => {
    if (!equipmentModalSession) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEquipmentModalSession(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [equipmentModalSession]);

  const handleStartBooking = async (session: ClassSession) => {
    if (isPending(session.id)) return;
    sound.playClick();
    if (!session.usesEquipment) {
      onBook(session.id);
      return;
    }
    let spots = equipmentSpotsProp;
    if (loadEquipmentSpots) {
      setLoadingSpotsFor(session.id);
      try {
        spots = await loadEquipmentSpots(session.id);
        setLoadedSpots(spots);
      } catch {
        spots = [];
      } finally {
        setLoadingSpotsFor(null);
      }
    }
    if (spots.length > 0) {
      setEquipmentModalSession(session);
      setSelectedSpotId(null);
    } else {
      // Sin mapa disponible: el servidor asigna un equipo libre
      onBook(session.id);
    }
  };

  const handleConfirmEquipmentBooking = () => {
    if (!equipmentModalSession || !selectedSpotId) return;
    sound.playClick();
    onBook(equipmentModalSession.id, selectedSpotId);
    setEquipmentModalSession(null);
    setSelectedSpotId(null);
  };

  const currentFamilyMember = familyMembers.find((m) => m.id === selectedFamilyMemberId) ||
    familyMembers.find((m) => m.isMe) ||
    familyMembers[0];

  if (isLoading) {
    return (
      <div className="w-full max-w-3xl mx-auto p-6 rounded-3xl bg-zinc-950 border border-zinc-800 animate-pulse space-y-4">
        <div className="h-8 bg-zinc-900 rounded w-1/3" />
        <div className="flex gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex-1 h-14 bg-zinc-900 rounded-2xl" />
          ))}
        </div>
        <div className="space-y-3 pt-4">
          <div className="h-28 bg-zinc-900 rounded-3xl" />
          <div className="h-28 bg-zinc-900 rounded-3xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4 text-left font-sans">
      {/* Banner de Error Funcional */}
      {errorCode && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-red-950/70 border border-red-500/80 text-red-200 flex items-center justify-between gap-3 text-sm"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMessageMap[errorCode] || 'Ocurrió un error al procesar la reserva.'}</span>
          </div>
          {onDismissError && (
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                onDismissError();
              }}
              aria-label="Cerrar mensaje de error"
              className="p-2 text-red-400 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[#edcc36] rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Selector de Familiar (si aplica) */}
      {familyMembers.length > 1 && (
        <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-zinc-950 border border-zinc-800">
          <span className="text-xs text-zinc-400 pl-2">Reservar para:</span>
          <div className="flex gap-1 flex-1">
            {familyMembers.map((fam) => (
              <button
                key={fam.id}
                type="button"
                onClick={() => {
                  sound.playClick();
                  onSelectFamilyMember?.(fam.id);
                }}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36] ${
                  currentFamilyMember?.id === fam.id
                    ? 'bg-[#edcc36] text-black font-bold'
                    : 'text-zinc-400 hover:text-white bg-zinc-900/60'
                }`}
              >
                {fam.isMe ? 'Mi cuenta' : fam.firstName}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tira Horizontal de 7 Días */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {days.map((d) => (
          <button
            key={d.offset}
            type="button"
            onClick={() => {
              sound.playClick();
              setSelectedDayOffset(d.offset);
            }}
            aria-label={`Ver clases para el ${d.formattedLabel}`}
            className={`flex-1 min-w-[58px] py-2.5 px-2 rounded-2xl text-center border transition-all min-h-[52px] focus-visible:ring-2 focus-visible:ring-[#edcc36] focus-visible:outline-none ${
              selectedDayOffset === d.offset
                ? 'bg-[#edcc36] text-black border-[#edcc36] shadow-[0_0_12px_rgba(237,204,54,0.3)]'
                : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700'
            }`}
          >
            <span className="text-[11px] block font-semibold">{d.dayName}</span>
            <span className="text-base font-mono font-bold block leading-none mt-1">
              {d.dayNumber}
            </span>
          </button>
        ))}
      </div>

      {/* Lista de Clases del Día */}
      {filteredSessions.length === 0 ? (
        <div className="p-8 rounded-3xl bg-zinc-950 border border-zinc-800 text-center space-y-2">
          <Calendar className="w-8 h-8 text-zinc-600 mx-auto" />
          <h4 className="font-cyber font-bold text-white text-base">Sin clases programadas</h4>
          <p className="text-xs text-zinc-400 max-w-xs mx-auto">
            No hay sesiones agendadas para el {activeDay.formattedLabel}. Elegí otro día en la barra superior.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSessions.map((session) => {
            const isAttended = session.myBooking?.status === 'checked_in';
            const isBooked = session.myBooking?.status === 'booked' || isAttended;
            const isWaitlisted = session.myBooking?.status === 'waitlisted';
            const isFull = session.spotsLeft <= 0;

            const minutesUntilClass = (new Date(session.startsAt).getTime() - Date.now()) / 60_000;
            const isLateCancellationWindow = minutesUntilClass > 0 && minutesUntilClass < lateCancelMinutes;
            const pending = isPending(session.id);

            return (
              <div
                key={session.id}
                className={`p-4 sm:p-5 rounded-3xl border transition-all ${
                  isBooked
                    ? 'bg-zinc-950 border-[#edcc36] shadow-[0_0_20px_rgba(237,204,54,0.15)]'
                    : isWaitlisted
                    ? 'bg-zinc-950 border-amber-400/60'
                    : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-2 flex-1">
                    {/* Badge de Horario 24h y Sala */}
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="px-2.5 py-0.5 rounded-lg bg-black text-[#edcc36] border border-[#edcc36]/30 font-mono font-bold flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{format24HourRange(session.startsAt, session.endsAt)}</span>
                      </span>

                      {session.roomName && (
                        <span className="text-zinc-400 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          <span>{session.roomName}</span>
                        </span>
                      )}

                      {session.usesEquipment && (
                        <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center gap-1">
                          <Bike className="w-3 h-3 text-[#edcc36]" />
                          <span>Elegís tu lugar</span>
                        </span>
                      )}
                    </div>

                    {/* Nombre de Clase y Profesor */}
                    <div>
                      <h3 className="font-cyber font-bold text-lg text-white tracking-wide">
                        {session.className}
                      </h3>
                      {session.instructorName.trim() && (
                        <p className="text-xs text-zinc-400">Prof. {session.instructorName}</p>
                      )}
                    </div>

                    {/* Estado de mi reserva si existe */}
                    {isBooked && (
                      <div className="p-3 rounded-2xl bg-[#edcc36]/10 border border-[#edcc36]/40 flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 text-[#edcc36]">
                          <ShieldCheck className="w-4 h-4" />
                          <span>{isAttended ? 'Asististe ✓' : 'Reserva confirmada'} {session.myBooking?.equipmentLabel ? `(${session.myBooking.equipmentLabel})` : ''}</span>
                        </div>
                        {!isAttended && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => {
                              sound.playClick();
                              onCancel(session.id);
                            }}
                            className="text-red-400 hover:text-red-300 underline font-semibold min-h-[44px] flex items-center gap-1.5 px-1 disabled:opacity-60 disabled:no-underline focus-visible:ring-2 focus-visible:ring-red-400"
                          >
                            {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                            {pending ? 'Cancelando…' : 'Cancelar reserva'}
                          </button>
                        )}
                      </div>
                    )}

                    {isWaitlisted && (
                      <div className="p-3 rounded-2xl bg-amber-950/40 border border-amber-400/40 flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 text-amber-300">
                          <Users className="w-4 h-4" />
                          <span>
                            En lista de espera
                            {session.myBooking?.waitlistPosition ? (
                              <> (posición <span className="font-mono">{session.myBooking.waitlistPosition}</span>)</>
                            ) : null}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            sound.playClick();
                            onCancel(session.id);
                          }}
                          className="text-zinc-400 hover:text-white underline min-h-[44px] flex items-center gap-1.5 px-1 disabled:opacity-60 disabled:no-underline focus-visible:ring-2 focus-visible:ring-white"
                        >
                          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                          Salir de la lista
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Cupos y Botón de Acción Principal */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-900">
                    <div className="text-left sm:text-right text-xs">
                      {session.spotsLeft > 0 ? (
                        <div className="text-[#edcc36] font-bold">
                          <span className="font-mono">{session.spotsLeft}</span> {session.spotsLeft === 1 ? 'lugar libre' : 'lugares libres'}
                        </div>
                      ) : (
                        <div className="text-red-400 font-semibold">
                          Clase llena{session.waitlistLeft > 0 ? ` · ${session.waitlistLeft} ${session.waitlistLeft === 1 ? 'lugar' : 'lugares'} en lista de espera` : ''}
                        </div>
                      )}
                    </div>

                    {!isBooked && !isWaitlisted && (
                      <div>
                        {session.spotsLeft > 0 ? (
                          <button
                            type="button"
                            disabled={pending}
                            aria-busy={pending || undefined}
                            onClick={() => void handleStartBooking(session)}
                            className="py-2.5 px-5 rounded-2xl bg-[#edcc36] text-black font-bold text-sm hover:bg-[#ffe156] transition-all shadow-[0_0_15px_rgba(237,204,54,0.3)] min-h-[44px] min-w-[120px] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-wait focus-visible:ring-2 focus-visible:ring-[#edcc36]"
                          >
                            {pending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                            {pending ? 'Reservando…' : 'Reservar'}
                          </button>
                        ) : session.waitlistLeft > 0 ? (
                          <button
                            type="button"
                            disabled={pending}
                            aria-busy={pending || undefined}
                            onClick={() => {
                              if (pending) return;
                              sound.playClick();
                              onWaitlist(session.id);
                            }}
                            className="py-2.5 px-4 rounded-2xl bg-zinc-900 border border-amber-400/50 text-amber-300 font-semibold text-sm hover:bg-zinc-800 transition-all min-h-[44px] min-w-[120px] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-wait focus-visible:ring-2 focus-visible:ring-amber-400"
                          >
                            {pending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                            Lista de espera
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="py-2.5 px-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-zinc-500 text-sm cursor-not-allowed min-h-[44px]"
                          >
                            Completa
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Advertencia de cancelación tardía */}
                {isBooked && !isAttended && isLateCancellationWindow && (
                  <div className="mt-3 pt-2 border-t border-zinc-900 flex items-center gap-1.5 text-xs text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Faltan menos de {formatLateCancelWindow(lateCancelMinutes)}. Si cancelás ahora, cuenta como cancelación tardía.
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL DE MAPA DE BICIS */}
      {equipmentModalSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
          onClick={() => setEquipmentModalSession(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="equipment-dialog-title"
            className="w-full max-w-md max-h-[90dvh] overflow-y-auto bg-zinc-950 border border-[#edcc36]/60 rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 id="equipment-dialog-title" className="font-cyber font-bold text-white text-base">Elegí tu {noun}</h3>
                <span className="text-xs text-[#edcc36]">{equipmentModalSession.className}</span>
              </div>
              <button
                type="button"
                autoFocus
                onClick={() => setEquipmentModalSession(null)}
                aria-label="Cerrar"
                className="text-zinc-400 hover:text-white p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-[#edcc36]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Referencias visuales */}
            <div className="flex items-center justify-center gap-4 text-xs text-zinc-400 py-1">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-zinc-900/60 border border-zinc-800" />
                <span>Libre</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-zinc-950 border border-zinc-900 opacity-60 flex items-center justify-center text-[8px] text-zinc-500">✕</span>
                <span>Ocupado</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-[#edcc36]" />
                <span>Elegido</span>
              </span>
            </div>

            {/* Grilla de Bicis */}
            <div className="p-4 rounded-2xl bg-black border border-zinc-900 space-y-3">
              <div className="text-center text-[11px] text-zinc-400 border-b border-zinc-900 pb-1">
                Frente (profe)
              </div>

              <div className="grid grid-cols-4 gap-2.5 pt-2">
                {equipmentSpots.map((spot) => {
                  const isSelected = selectedSpotId === spot.id;
                  const isTaken = spot.taken;
                  const shortLabel = spotShortLabel(spot.label);
                  const ariaLabel = isSelected
                    ? `${spot.label}, elegido`
                    : isTaken
                    ? `${spot.label}, ocupado`
                    : `${spot.label}, libre`;

                  return (
                    <button
                      key={spot.id}
                      type="button"
                      disabled={isTaken}
                      aria-disabled={isTaken ? 'true' : undefined}
                      aria-label={ariaLabel}
                      aria-pressed={isSelected}
                      onClick={() => {
                        if (!isTaken) {
                          sound.playClick();
                          setSelectedSpotId(spot.id);
                        }
                      }}
                      className={`p-2 rounded-xl border text-center text-xs transition-all min-h-[48px] min-w-[44px] flex flex-col items-center justify-center gap-0.5 focus-visible:ring-2 focus-visible:ring-[#edcc36] focus-visible:outline-none ${
                        isSelected
                          ? 'bg-[#edcc36] text-black font-bold border-[#edcc36] shadow-[0_0_12px_rgba(237,204,54,0.4)]'
                          : isTaken
                          ? 'bg-zinc-950 border-zinc-900 text-zinc-500 cursor-not-allowed opacity-60'
                          : 'bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:border-[#edcc36]/60 hover:text-[#edcc36]'
                      }`}
                    >
                      {isTaken ? (
                        <Lock className="w-3.5 h-3.5 text-zinc-500" />
                      ) : (
                        <Bike className="w-3.5 h-3.5" />
                      )}
                      <span className="text-[11px] font-mono font-bold truncate max-w-full">{shortLabel}</span>
                      <span className="text-[10px]">
                        {isTaken ? 'Ocupado' : isSelected ? 'Elegido' : 'Libre'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Acciones del Modal */}
            <div className="space-y-2 pt-1 text-sm">
              <button
                type="button"
                onClick={handleConfirmEquipmentBooking}
                disabled={!selectedSpotId}
                className="w-full py-3 px-4 rounded-xl bg-[#edcc36] text-black font-bold hover:bg-[#ffe156] disabled:opacity-40 disabled:cursor-not-allowed transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36]"
              >
                {selectedSpotId ? 'Confirmar reserva' : `Elegí un${noun === 'bici' || noun.endsWith('a') ? 'a' : ''} ${noun} para confirmar`}
              </button>

              <button
                type="button"
                onClick={() => {
                  const firstFree = equipmentSpots.find((s) => !s.taken);
                  if (firstFree) {
                    sound.playClick();
                    setSelectedSpotId(firstFree.id);
                  }
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white transition-colors min-h-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36]"
              >
                Asignarme cualquier lugar libre
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
