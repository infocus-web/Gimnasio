'use client'

'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import {
  ClassSession,
  EquipmentSpot,
  BookingErrorCode,
  FamilyMember,
} from '../../types/platform';
import { sound } from '../../utils/audio';

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
}

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
      dayName: idx === 0 ? 'Hoy' : idx === 1 ? 'Mañ' : d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', ''),
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
    MEMBERSHIP_REQUIRED: 'Necesitás una membresía activa para reservar clases.',
    PAYMENT_PAST_DUE: 'Tu cuota registra un pago pendiente. Regularizalo para reservar.',
    CLASS_FULL: 'La clase ya completó su cupo de asistencia.',
    ALREADY_BOOKED: 'Ya tenés una reserva confirmada para este horario.',
    EQUIPMENT_TAKEN: 'El lugar/bici seleccionado ya fue tomado por otro socio. Elegí otro.',
    PLAN_EXCLUDES_CLASS_TYPE: 'Tu plan contratado no incluye esta actividad.',
    NO_CREDITS_LEFT: 'No te quedan créditos disponibles en tu pack de clases.',
    WEEKLY_LIMIT_REACHED: 'Alcanzaste el límite de reservas semanales de tu plan.',
    BOOKING_CLOSED: 'El horario de inscripción para esta clase ya finalizó.',
    MEMBER_TIME_CONFLICT: 'Tenés otra actividad reservada en este mismo intervalo horario.',
  };

  const [loadedSpots, setLoadedSpots] = useState<EquipmentSpot[] | null>(null);
  const equipmentSpots = loadedSpots ?? equipmentSpotsProp;

  const handleStartBooking = async (session: ClassSession) => {
    sound.playClick();
    if (!session.usesEquipment) {
      onBook(session.id);
      return;
    }
    let spots = equipmentSpotsProp;
    if (loadEquipmentSpots) {
      try {
        spots = await loadEquipmentSpots(session.id);
        setLoadedSpots(spots);
      } catch {
        spots = [];
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
          className="p-4 rounded-2xl bg-red-950/70 border border-red-500/80 text-red-200 flex items-center justify-between gap-3 text-xs font-mono"
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
          <span className="text-[11px] font-mono text-zinc-400 pl-2">Reservar para:</span>
          <div className="flex gap-1 flex-1">
            {familyMembers.map((fam) => (
              <button
                key={fam.id}
                type="button"
                onClick={() => {
                  sound.playClick();
                  onSelectFamilyMember?.(fam.id);
                }}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-mono font-semibold transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36] ${
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
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none font-mono">
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
            <span className="text-[10px] block uppercase font-semibold">{d.dayName}</span>
            <span className="text-base font-bold block leading-none mt-1">
              {d.dayNumber}
            </span>
          </button>
        ))}
      </div>

      {/* Lista de Clases del Día */}
      {filteredSessions.length === 0 ? (
        <div className="p-8 rounded-3xl bg-zinc-950 border border-zinc-850 text-center space-y-2">
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

            const startsTime = new Date(session.startsAt).getTime();
            const nowTime = Date.now();
            const hoursUntilClass = (startsTime - nowTime) / (1000 * 60 * 60);
            const isLateCancellationWindow = hoursUntilClass < 2 && hoursUntilClass > 0;

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
                    <div className="flex items-center gap-2 flex-wrap font-mono text-[11px]">
                      <span className="px-2.5 py-0.5 rounded-lg bg-black text-[#edcc36] border border-[#edcc36]/30 font-bold flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{format24HourRange(session.startsAt, session.endsAt)}</span>
                      </span>

                      <span className="text-zinc-400 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        <span>{session.roomName}</span>
                      </span>

                      {session.usesEquipment && (
                        <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center gap-1">
                          <Bike className="w-3 h-3 text-[#edcc36]" />
                          <span>Con selección de bici</span>
                        </span>
                      )}
                    </div>

                    {/* Nombre de Clase y Profesor */}
                    <div>
                      <h3 className="font-cyber font-bold text-lg text-white tracking-wide">
                        {session.className}
                      </h3>
                      <p className="text-xs text-zinc-400 font-mono">
                        Prof. {session.instructorName}
                      </p>
                    </div>

                    {/* Estado de mi reserva si existe */}
                    {isBooked && (
                      <div className="p-3 rounded-2xl bg-[#edcc36]/10 border border-[#edcc36]/40 flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center gap-2 text-[#edcc36]">
                          <ShieldCheck className="w-4 h-4" />
                          <span>{isAttended ? 'Asististe ✓' : 'Reserva confirmada'} {session.myBooking?.equipmentLabel ? `(${session.myBooking.equipmentLabel})` : ''}</span>
                        </div>
                        {!isAttended && <button
                          type="button"
                          onClick={() => {
                            sound.playClick();
                            onCancel(session.id);
                          }}
                          className="text-red-400 hover:text-red-300 underline font-semibold min-h-[44px] flex items-center px-1 focus-visible:ring-2 focus-visible:ring-red-400"
                        >
                          Cancelar reserva
                        </button>}
                      </div>
                    )}

                    {isWaitlisted && (
                      <div className="p-3 rounded-2xl bg-amber-950/40 border border-amber-400/40 flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center gap-2 text-amber-300">
                          <Users className="w-4 h-4" />
                          <span>En lista de espera (Posición #{session.myBooking?.waitlistPosition || 1})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            sound.playClick();
                            onCancel(session.id);
                          }}
                          className="text-zinc-400 hover:text-white underline min-h-[44px] flex items-center px-1 focus-visible:ring-2 focus-visible:ring-white"
                        >
                          Salir de lista
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Cupos y Botón de Acción Principal */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-900">
                    <div className="text-left sm:text-right font-mono text-xs">
                      {session.spotsLeft > 0 ? (
                        <div className="text-[#edcc36] font-bold">
                          {session.spotsLeft} {session.spotsLeft === 1 ? 'cupo libre' : 'cupos libres'}
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
                            onClick={() => handleStartBooking(session)}
                            className="py-2.5 px-5 rounded-2xl bg-[#edcc36] text-black font-cyber font-bold text-xs tracking-wider hover:bg-[#ffe156] transition-all shadow-[0_0_15px_rgba(237,204,54,0.3)] min-h-[44px] min-w-[120px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[#edcc36]"
                          >
                            RESERVAR
                          </button>
                        ) : session.waitlistLeft > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              sound.playClick();
                              onWaitlist(session.id);
                            }}
                            className="py-2.5 px-4 rounded-2xl bg-zinc-900 border border-amber-400/50 text-amber-300 font-mono font-bold text-xs hover:bg-zinc-850 transition-all min-h-[44px] min-w-[120px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-amber-400"
                          >
                            LISTA ESPERA
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="py-2.5 px-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-zinc-500 font-mono text-xs cursor-not-allowed min-h-[44px]"
                          >
                            AGOTADO
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Advertencia de cancelación tardía */}
                {isBooked && isLateCancellationWindow && (
                  <div className="mt-3 pt-2 border-t border-zinc-900 flex items-center gap-1.5 text-[11px] font-mono text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Faltan menos de 2 horas. Cancelar ahora computará como cancelación tardía.</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL DE MAPA DE BICIS */}
      {equipmentModalSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-md bg-zinc-950 border border-[#edcc36]/60 rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl text-left">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="font-cyber font-bold text-white text-base">Elegí tu Bici</h3>
                <span className="text-xs font-mono text-[#edcc36]">{equipmentModalSession.className}</span>
              </div>
              <button
                type="button"
                onClick={() => setEquipmentModalSession(null)}
                aria-label="Cerrar selector de bicis"
                className="text-zinc-400 hover:text-white p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-[#edcc36]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Referencias visuales */}
            <div className="flex items-center justify-center gap-4 text-[11px] font-mono text-zinc-400 py-1">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-zinc-900/60 border border-zinc-800" />
                <span>Libre</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-zinc-950 border border-zinc-900 opacity-60 flex items-center justify-center text-[8px] text-zinc-500">✕</span>
                <span>Ocupada</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-[#edcc36]" />
                <span>Elegida</span>
              </span>
            </div>

            {/* Grilla de Bicis */}
            <div className="p-4 rounded-2xl bg-black border border-zinc-900 space-y-3">
              <div className="text-center text-[10px] font-mono text-zinc-400 uppercase tracking-widest border-b border-zinc-900 pb-1">
                FRENTE / TARIMA DEL INSTRUCTOR
              </div>

              <div className="grid grid-cols-4 gap-2.5 pt-2">
                {equipmentSpots.map((spot) => {
                  const isSelected = selectedSpotId === spot.id;
                  const isTaken = spot.taken;
                  const bikeNumber = spot.label.replace('Bici ', '');
                  const ariaLabel = isSelected
                    ? `${spot.label}, seleccionada`
                    : isTaken
                    ? `${spot.label}, ocupada`
                    : `${spot.label}, libre`;

                  return (
                    <button
                      key={spot.id}
                      type="button"
                      disabled={isTaken}
                      aria-disabled={isTaken ? 'true' : undefined}
                      aria-label={ariaLabel}
                      onClick={() => {
                        if (!isTaken) {
                          sound.playClick();
                          setSelectedSpotId(spot.id);
                        }
                      }}
                      className={`p-2 rounded-xl border text-center font-mono text-xs transition-all min-h-[48px] min-w-[44px] flex flex-col items-center justify-center gap-0.5 focus-visible:ring-2 focus-visible:ring-[#edcc36] focus-visible:outline-none ${
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
                      <span className="text-[11px] font-bold">#{bikeNumber}</span>
                      <span className="text-[9px] uppercase tracking-tighter">
                        {isTaken ? 'Ocupada' : isSelected ? 'Elegida' : 'Libre'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Acciones del Modal */}
            <div className="space-y-2 pt-1 font-mono text-xs">
              <button
                type="button"
                onClick={handleConfirmEquipmentBooking}
                disabled={!selectedSpotId}
                className="w-full py-3 px-4 rounded-xl bg-[#edcc36] text-black font-bold hover:bg-[#ffe156] disabled:opacity-40 disabled:cursor-not-allowed transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36]"
              >
                {selectedSpotId ? 'Confirmar reserva' : 'Elegí una bici para confirmar'}
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
                Asignarme cualquiera libre
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
