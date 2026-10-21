'use client';

import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { RefreshCw, AlertTriangle, Users, Clock, AlertCircle, UserPlus } from 'lucide-react';
import { CheckinToken, MembershipSummary, FamilyMember } from '../../types/platform';
import { getPassStatus } from '../membership/status';
import { sound } from '../../utils/audio';

/** Se pide el código nuevo unos segundos antes de que venza, para que el QR nunca quede inválido en pantalla. */
const REFRESH_EARLY_SECONDS = 3;
/** Piso de seguridad: si el servidor manda un valor raro, no se pide un token más seguido que esto. */
const MIN_REFRESH_SECONDS = 10;

export interface MemberQrPassProps {
  token: CheckinToken | null;
  membership: MembershipSummary;
  familyMembers?: FamilyMember[];
  /** El socio que muestra el pase (siempre, aunque no tenga grupo familiar) */
  member?: FamilyMember;
  selectedFamilyMemberId?: string;
  onSelectFamilyMember?: (memberId: string) => void;
  onRefresh: () => void;
  /** Nombre del gimnasio para el encabezado del pase */
  orgName?: string;
  isLoading?: boolean;
  error?: string | null;
}

export const MemberQrPass: React.FC<MemberQrPassProps> = ({
  token,
  membership,
  familyMembers = [],
  member,
  selectedFamilyMemberId,
  onSelectFamilyMember,
  onRefresh,
  orgName,
  isLoading = false,
  error = null,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  // La foto es un link firmado que vence (1 h): si ya no carga, se muestra la inicial
  const [photoBroken, setPhotoBroken] = useState(false);
  const status = getPassStatus(membership);
  const canEnter = status.kind === 'valid';

  // onRefresh puede cambiar de identidad: se guarda en un ref para no reiniciar la cuenta regresiva.
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  // Generar la imagen del QR. Mientras se genera el nuevo, se sigue mostrando el anterior
  // (el token solo pasa a null al cambiar de socio, y ahí sí hay que limpiar).
  useEffect(() => {
    let isMounted = true;
    if (!token?.token) {
      setQrDataUrl('');
      return;
    }
    QRCode.toDataURL(token.token, {
      width: 320,
      margin: 1,
      color: { dark: '#edcc36', light: '#09090b' },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (isMounted) setQrDataUrl(url);
      })
      .catch(() => {
        /* se mantiene el QR anterior */
      });
    return () => {
      isMounted = false;
    };
  }, [token?.token]);

  // Cuenta regresiva basada en refresh_in_seconds contado desde que llegó el token
  // (reloj monotónico: un celular con la hora mal configurada no provoca un bucle de pedidos).
  useEffect(() => {
    if (!token?.token || !canEnter) return;
    const total = Math.max(MIN_REFRESH_SECONDS, Math.round(token.refreshInSeconds || 30));
    const receivedAt = performance.now();
    let requested = false;

    const tick = () => {
      const elapsed = (performance.now() - receivedAt) / 1000;
      const left = Math.max(0, Math.ceil(total - elapsed));
      setSecondsLeft(left);
      if (!requested && left <= REFRESH_EARLY_SECONDS) {
        requested = true; // un solo pedido por token
        onRefreshRef.current();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    // Al volver a la pestaña (el navegador frena los timers en segundo plano) se recalcula enseguida
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // Depende del objeto token (no solo del string): si el servidor devuelve el mismo código, la cuenta igual se reinicia
  }, [token, canEnter]);

  const currentFamilyMember =
    familyMembers.find((m) => m.id === selectedFamilyMemberId) ||
    member ||
    familyMembers.find((m) => m.isMe) ||
    familyMembers[0];

  // 1. Cargando (solo la primera vez: las renovaciones son silenciosas)
  if (isLoading) {
    return (
      <div className="w-full max-w-sm mx-auto p-6 rounded-3xl bg-zinc-950 border border-zinc-800 space-y-4 animate-pulse" aria-busy="true">
        <div className="h-6 bg-zinc-900 rounded-lg w-3/4 mx-auto" />
        <div className="w-56 h-56 bg-zinc-900 rounded-2xl mx-auto border border-zinc-800" />
        <div className="h-4 bg-zinc-900 rounded w-1/2 mx-auto" />
        <div className="h-10 bg-zinc-900 rounded-xl" />
      </div>
    );
  }

  // 2. Error al generar el código (solo si el pase habilita el ingreso)
  if (canEnter && error) {
    return (
      <div role="alert" className="w-full max-w-sm mx-auto p-6 rounded-3xl bg-zinc-950 border border-red-500/40 text-center space-y-4 font-sans">
        <div className="w-12 h-12 mx-auto rounded-full bg-red-950/50 border border-red-500/50 flex items-center justify-center text-red-400">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-cyber font-bold text-white text-base">No pudimos generar tu código</h3>
          <p className="text-xs text-zinc-400 mt-1">{error}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            sound.playClick();
            onRefresh();
          }}
          className="w-full py-2.5 px-4 rounded-xl bg-zinc-900 text-[#edcc36] border border-[#edcc36]/40 text-sm font-semibold hover:bg-[#edcc36] hover:text-black transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36]"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const badgeClass = canEnter
    ? 'border-[#edcc36]/50 bg-[#edcc36]/15 text-[#edcc36]'
    : status.kind === 'none'
    ? 'border-zinc-700 bg-zinc-900 text-zinc-300'
    : 'border-red-500/60 bg-red-950/40 text-red-400';

  return (
    <div className="w-full max-w-sm mx-auto space-y-3.5 text-left font-sans">
      {/* Selector de Familia (si tiene dependientes) */}
      {familyMembers.length > 1 && (
        <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-zinc-950 border border-zinc-800">
          <span className="text-xs text-zinc-400 pl-2 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-[#edcc36]" />
            <span>Pase de:</span>
          </span>
          <div className="flex gap-1 flex-1">
            {familyMembers.map((fam) => (
              <button
                key={fam.id}
                type="button"
                onClick={() => {
                  sound.playClick();
                  onSelectFamilyMember?.(fam.id);
                }}
                aria-pressed={currentFamilyMember?.id === fam.id}
                className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs font-semibold transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36] ${
                  currentFamilyMember?.id === fam.id
                    ? 'bg-[#edcc36] text-black shadow-[0_0_10px_rgba(237,204,54,0.3)]'
                    : 'text-zinc-400 hover:text-white bg-zinc-900/60'
                }`}
              >
                {fam.isMe ? 'Yo' : fam.firstName}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tarjeta de Pase QR */}
      <div
        className={`relative overflow-hidden rounded-3xl p-5 sm:p-6 transition-all border-2 bg-zinc-950 ${
          canEnter
            ? 'border-[#edcc36]/50 shadow-[0_0_30px_rgba(237,204,54,0.2)]'
            : status.kind === 'none'
            ? 'border-zinc-800'
            : 'border-red-500/60 shadow-[0_0_25px_rgba(239,68,68,0.2)]'
        }`}
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between gap-2 border-b border-zinc-900 pb-3 mb-4">
          <div className="min-w-0">
            <div className="font-cyber font-extrabold text-sm sm:text-base tracking-wide text-white truncate">
              {orgName || 'Pase de acceso'}
            </div>
            <div className="text-[11px] text-zinc-400">Pase de acceso digital</div>
          </div>
          <span className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${badgeClass}`}>
            {status.label}
          </span>
        </div>

        {/* Socio Info */}
        <div className="flex items-center gap-3 mb-4 bg-black/60 p-2.5 rounded-2xl border border-zinc-900">
          {currentFamilyMember?.photoUrl && !photoBroken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentFamilyMember.photoUrl} alt="" onError={() => setPhotoBroken(true)} className="w-10 h-10 rounded-full border border-[#edcc36]/40 object-cover shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-zinc-900 border border-[#edcc36]/40 flex items-center justify-center text-[#edcc36] shrink-0 font-bold text-sm">
              {currentFamilyMember?.firstName?.charAt(0) || 'S'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h4 className="font-cyber font-bold text-white text-sm truncate">
              {currentFamilyMember?.firstName} {currentFamilyMember?.lastName}
            </h4>
            <div className="text-xs text-zinc-400 truncate">
              {currentFamilyMember?.memberNumber ? (
                <span className="font-mono">N° {currentFamilyMember.memberNumber}</span>
              ) : null}
              {currentFamilyMember?.memberNumber && membership.planName ? ' · ' : ''}
              {membership.planName}
            </div>
          </div>
        </div>

        {/* Bloque central: QR o motivo por el que no se puede ingresar */}
        <div className="relative mx-auto my-2 w-60 h-60 p-3 rounded-2xl bg-[#09090b] border-2 border-zinc-800 flex flex-col items-center justify-center overflow-hidden">
          {!canEnter ? (
            <div className="text-center p-3 space-y-2 z-10">
              <div
                className={`w-12 h-12 mx-auto rounded-full flex items-center justify-center ${
                  status.kind === 'none'
                    ? 'bg-zinc-900 border border-zinc-700 text-[#edcc36]'
                    : 'bg-red-950/60 border border-red-500/60 text-red-400'
                }`}
              >
                {status.kind === 'none' ? <UserPlus className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
              </div>
              <h5 className="font-cyber font-bold text-white text-sm">
                {status.kind === 'none' ? 'Sin plan activo' : 'Pase inhabilitado'}
              </h5>
              <p className="text-xs text-zinc-400 leading-snug">{status.message}</p>
            </div>
          ) : qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="Código QR de acceso" className="w-full h-full object-contain rounded-lg p-1" />
          ) : (
            <div className="text-center text-xs text-zinc-400">Generando código…</div>
          )}
        </div>

        {canEnter && (
          <div className="mt-3 space-y-2 text-center">
            <div className="flex items-center justify-between text-xs text-zinc-400 bg-black/50 px-3 py-1.5 rounded-xl border border-zinc-900">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#edcc36]" />
                <span>Se renueva en</span>
              </span>
              <span className="font-mono font-bold text-[#edcc36] tabular-nums" aria-live="off">
                {secondsLeft} s
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-snug px-1">
              El código se renueva solo. Las capturas de pantalla no son válidas.
            </p>
          </div>
        )}
      </div>

      {/* Botón manual de recarga */}
      {canEnter && (
        <button
          type="button"
          onClick={() => {
            sound.playClick();
            onRefresh();
          }}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl border border-zinc-800 bg-zinc-950 text-sm text-zinc-300 hover:text-[#edcc36] hover:border-[#edcc36]/40 transition-colors min-h-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36]"
        >
          <RefreshCw className="w-4 h-4 text-[#edcc36]" />
          <span>Actualizar código ahora</span>
        </button>
      )}
    </div>
  );
};
