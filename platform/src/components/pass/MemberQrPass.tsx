'use client'

'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { RefreshCw, AlertTriangle, CreditCard, Users, Clock, AlertCircle } from 'lucide-react';
import { CheckinToken, MembershipSummary, FamilyMember } from '../../types/platform';
import { sound } from '../../utils/audio';

export interface MemberQrPassProps {
  token: CheckinToken | null;
  membership: MembershipSummary;
  familyMembers?: FamilyMember[];
  /** El socio que muestra el pase (siempre, aunque no tenga grupo familiar) */
  member?: FamilyMember;
  selectedFamilyMemberId?: string;
  onSelectFamilyMember?: (memberId: string) => void;
  onRefresh: () => void;
  onPay?: () => void;
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
  onPay,
  isLoading = false,
  error = null,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [secondsLeft, setSecondsLeft] = useState<number>(30);

  // Generate real QR code image using `qrcode` library
  useEffect(() => {
    let isMounted = true;
    if (!token?.token) {
      setQrDataUrl('');
      return;
    }

    QRCode.toDataURL(token.token, {
      width: 320,
      margin: 1,
      color: {
        dark: '#edcc36',
        light: '#09090b',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (isMounted) setQrDataUrl(url);
      })
      .catch(() => {
        if (isMounted) setQrDataUrl('');
      });

    return () => {
      isMounted = false;
    };
  }, [token?.token]);

  // Countdown timer based on expiresAt or refreshInSeconds
  useEffect(() => {
    if (!token?.expiresAt) {
      setSecondsLeft(0);
      return;
    }

    const calcSeconds = () => {
      const exp = new Date(token.expiresAt).getTime();
      const now = Date.now();
      const remaining = Math.max(0, Math.round((exp - now) / 1000));
      return remaining;
    };

    setSecondsLeft(calcSeconds());

    const interval = setInterval(() => {
      const rem = calcSeconds();
      setSecondsLeft(rem);
      if (rem <= 0) {
        clearInterval(interval);
        onRefresh();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [token?.expiresAt, onRefresh]);

  const isBlocked =
    membership.status === 'past_due' ||
    membership.status === 'expired' ||
    membership.status === 'canceled';

  const currentFamilyMember =
    familyMembers.find((m) => m.id === selectedFamilyMemberId) ||
    member ||
    familyMembers.find((m) => m.isMe) ||
    familyMembers[0];

  // 1. Estado Cargando (Skeleton)
  if (isLoading) {
    return (
      <div className="w-full max-w-sm mx-auto p-6 rounded-3xl bg-zinc-950 border border-zinc-800 space-y-4 animate-pulse">
        <div className="h-6 bg-zinc-900 rounded-lg w-3/4 mx-auto" />
        <div className="w-56 h-56 bg-zinc-900 rounded-2xl mx-auto border border-zinc-800" />
        <div className="h-4 bg-zinc-900 rounded w-1/2 mx-auto" />
        <div className="h-10 bg-zinc-900 rounded-xl" />
      </div>
    );
  }

  // 2. Estado Error o Token Nulo
  if (error || !token || secondsLeft <= 0) {
    return (
      <div className="w-full max-w-sm mx-auto p-6 rounded-3xl bg-zinc-950 border border-red-500/40 text-center space-y-4 font-sans">
        <div className="w-12 h-12 mx-auto rounded-full bg-red-950/50 border border-red-500/50 flex items-center justify-center text-red-400">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-cyber font-bold text-white text-base">
            {error ? 'Error al cargar el pase' : 'Token de acceso vencido'}
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            {error || 'El código dinámico caducó. Solicitá uno nuevo para destrabar el molinete.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            sound.playClick();
            onRefresh();
          }}
          className="w-full py-2.5 px-4 rounded-xl bg-zinc-900 text-[#edcc36] border border-[#edcc36]/40 font-mono text-xs font-bold hover:bg-[#edcc36] hover:text-black transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36]"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm mx-auto space-y-3.5 text-left font-sans">
      {/* Selector de Familia (si tiene dependientes) */}
      {familyMembers.length > 1 && (
        <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-zinc-950 border border-zinc-800">
          <span className="text-[11px] font-mono text-zinc-400 pl-2 flex items-center gap-1.5">
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
                className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs font-mono font-semibold transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36] ${
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
        className={`relative overflow-hidden rounded-3xl p-5 sm:p-6 transition-all border-2 ${
          isBlocked
            ? 'bg-zinc-950 border-red-500/60 shadow-[0_0_25px_rgba(239,68,68,0.2)]'
            : 'bg-zinc-950 border-[#edcc36]/50 shadow-[0_0_30px_rgba(237,204,54,0.2)]'
        }`}
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between border-b border-zinc-900 pb-3 mb-4">
          <div>
            <div className="font-cyber font-extrabold text-sm sm:text-base tracking-wider text-white">
              EVOLUTION<span className="text-[#edcc36]">FITNESS</span>
            </div>
            <div className="text-[10px] font-mono text-zinc-400">PASE DE ACCESO DIGITAL</div>
          </div>
          <span
            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase border ${
              isBlocked
                ? 'border-red-500/60 bg-red-950/40 text-red-400'
                : 'border-[#edcc36]/50 bg-[#edcc36]/15 text-[#edcc36]'
            }`}
          >
            {membership.status === 'active'
              ? 'ACTIVO'
              : membership.status === 'past_due'
              ? 'PAGO PENDIENTE'
              : 'VENCIDO'}
          </span>
        </div>

        {/* Socio Info */}
        <div className="flex items-center gap-3 mb-4 bg-black/60 p-2.5 rounded-2xl border border-zinc-900">
          <div className="w-10 h-10 rounded-full bg-zinc-900 border border-[#edcc36]/40 flex items-center justify-center text-[#edcc36] shrink-0 font-bold text-sm">
            {currentFamilyMember?.firstName?.charAt(0) || 'S'}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-cyber font-bold text-white text-sm truncate">
              {currentFamilyMember?.firstName} {currentFamilyMember?.lastName}
            </h4>
            <div className="text-[11px] font-mono text-zinc-400 truncate">
              {membership.planName}
            </div>
          </div>
        </div>

        {/* Bloque Central de Código QR Real o Bloqueo */}
        <div className="relative mx-auto my-2 w-60 h-60 p-3 rounded-2xl bg-[#09090b] border-2 border-zinc-850 flex flex-col items-center justify-center overflow-hidden">
          {isBlocked ? (
            <div className="text-center p-3 space-y-2 z-10">
              <div className="w-12 h-12 mx-auto rounded-full bg-red-950/60 border border-red-500/60 flex items-center justify-center text-red-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h5 className="font-cyber font-bold text-white text-sm">Pase Inhabilitado</h5>
              <p className="text-[11px] text-zinc-400 leading-snug">
                {membership.status === 'past_due'
                  ? 'Registramos un pago pendiente en tu cuenta. Regularizá para ingresar.'
                  : 'Tu período de membresía finalizó.'}
              </p>
            </div>
          ) : qrDataUrl ? (
            <div className="relative w-full h-full flex flex-col items-center justify-center">
              <img
                src={qrDataUrl}
                alt="Código QR de Acceso"
                className="w-full h-full object-contain rounded-lg p-1"
              />
            </div>
          ) : (
            <div className="text-center text-xs text-zinc-400 font-mono">Generando código...</div>
          )}
        </div>

        {/* Aclaración y cuenta regresiva si no está bloqueado */}
        {!isBlocked ? (
          <div className="mt-3 space-y-2 text-center">
            {/* Countdown bar */}
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 bg-black/50 px-3 py-1.5 rounded-xl border border-zinc-900">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#edcc36]" />
                <span>Expira en:</span>
              </span>
              <span className="font-bold text-[#edcc36] tabular-nums">{secondsLeft} s</span>
            </div>

            <p className="text-[11px] text-zinc-400 leading-snug px-1">
              El código cambia cada 30 s. Las capturas de pantalla no son válidas.
            </p>
          </div>
        ) : (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                onPay?.();
              }}
              className="w-full py-3 px-4 rounded-xl bg-[#edcc36] hover:bg-[#ffe156] text-black font-mono font-bold text-xs flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(237,204,54,0.3)] transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36]"
            >
              <CreditCard className="w-4 h-4" />
              <span>REGULARIZAR PAGO</span>
            </button>
          </div>
        )}
      </div>

      {/* Botón manual de recarga */}
      {!isBlocked && (
        <button
          type="button"
          onClick={() => {
            sound.playClick();
            onRefresh();
          }}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl border border-zinc-800 bg-zinc-950 text-xs font-mono text-zinc-300 hover:text-[#edcc36] hover:border-[#edcc36]/40 transition-colors min-h-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36]"
        >
          <RefreshCw className="w-4 h-4 text-[#edcc36]" />
          <span>Actualizar código ahora</span>
        </button>
      )}
    </div>
  );
};
