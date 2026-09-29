'use client'

'use client';

import React from 'react';
import { ShieldCheck, AlertTriangle, CreditCard, Calendar } from 'lucide-react';
import { MembershipSummary } from '../../types/platform';
import { sound } from '../../utils/audio';

export interface MembershipBannerProps {
  membership: MembershipSummary;
  onPay?: () => void;
  isLoading?: boolean;
}

export const MembershipBanner: React.FC<MembershipBannerProps> = ({
  membership,
  onPay,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="w-full max-w-2xl mx-auto h-20 rounded-3xl bg-zinc-950 border border-zinc-800 animate-pulse" />
    );
  }

  const isPastDue = membership.status === 'past_due';

  // Si está con pago fallido (past_due), mostrar aviso de alta visibilidad
  if (isPastDue) {
    return (
      <div className="w-full max-w-2xl mx-auto p-4 sm:p-5 rounded-3xl bg-red-950/40 border-2 border-red-500/70 shadow-[0_0_25px_rgba(239,68,68,0.25)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left font-sans">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-red-950 border border-red-500/60 flex items-center justify-center text-red-400 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-cyber font-bold text-white text-base">
                Tu pago falló — reservas suspendidas
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-950 text-red-400 border border-red-500/50">
                PAGO PENDIENTE
              </span>
            </div>
            <p className="text-xs text-red-200 font-mono leading-snug">
              Regularizá tu cuota para habilitar el pase QR y continuar reservando tus clases.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            sound.playClick();
            onPay?.();
          }}
          className="py-3 px-5 rounded-2xl bg-[#edcc36] hover:bg-[#ffe156] text-black font-mono font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(237,204,54,0.3)] whitespace-nowrap min-h-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36]"
        >
          <CreditCard className="w-4 h-4" />
          <span>Pagar cuota</span>
        </button>
      </div>
    );
  }

  // Si está activo o con pack
  return (
    <div className="w-full max-w-2xl mx-auto p-4 sm:p-5 rounded-3xl bg-zinc-950 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left font-sans">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-black border border-[#edcc36]/40 flex items-center justify-center text-[#edcc36] shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-cyber font-bold text-white text-base">{membership.planName}</h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#edcc36]/15 text-[#edcc36] border border-[#edcc36]/30">
              {membership.status === 'active' ? 'ACTIVA' : membership.status.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-zinc-400 mt-0.5">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
              <span>Vence: <span className="text-zinc-200">{membership.currentPeriodEnd}</span></span>
            </span>

            {membership.creditsRemaining !== null && (
              <>
                <span>·</span>
                <span className="text-[#edcc36] font-bold">
                  {membership.creditsRemaining} créditos disponibles
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {onPay && (
        <button
          type="button"
          onClick={() => {
            sound.playClick();
            onPay();
          }}
          className="py-2.5 px-4 rounded-xl border border-zinc-800 bg-zinc-900 text-xs font-mono text-zinc-300 hover:text-[#edcc36] hover:border-[#edcc36]/40 transition-colors min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[#edcc36]"
        >
          Administrar plan
        </button>
      )}
    </div>
  );
};
