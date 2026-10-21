'use client';

import React from 'react';
import { ShieldCheck, AlertTriangle, Calendar, Info } from 'lucide-react';
import { MembershipSummary } from '../../types/platform';
import { formatPeriodEnd, getPassStatus } from './status';
import { PayPlanButton } from '@/features/payments/PayPlanButton';

export interface MembershipBannerProps {
  membership: MembershipSummary;
  isLoading?: boolean;
}

/** Resumen del plan del socio. Pago en recepción, u online si el gimnasio conectó Mercado Pago (PayPlanButton). */
export const MembershipBanner: React.FC<MembershipBannerProps> = ({ membership, isLoading = false }) => {
  if (isLoading) {
    return <div className="w-full max-w-2xl mx-auto h-20 rounded-3xl bg-zinc-950 border border-zinc-800 animate-pulse" />;
  }

  const status = getPassStatus(membership);

  // Sin plan: el pase ya explica qué hacer; acá solo se informa cómo inscribirse
  if (status.kind === 'none') {
    return (
      <div className="w-full max-w-2xl mx-auto p-4 sm:p-5 rounded-3xl bg-zinc-950 border border-zinc-800 flex items-start gap-3 text-left font-sans">
        <div className="w-10 h-10 rounded-2xl bg-black border border-zinc-700 flex items-center justify-center text-[#edcc36] shrink-0">
          <Info className="w-5 h-5" />
        </div>
        <div className="space-y-0.5">
          <h3 className="font-cyber font-bold text-white text-base">Sin plan activo</h3>
          <p className="text-sm text-zinc-400 leading-snug">{status.message}</p>
          <PayPlanButton label="Elegir y pagar un plan" />
        </div>
      </div>
    );
  }

  if (status.kind === 'blocked') {
    return (
      <div
        role="status"
        className="w-full max-w-2xl mx-auto p-4 sm:p-5 rounded-3xl bg-red-950/40 border-2 border-red-500/70 flex items-start gap-3 text-left font-sans"
      >
        <div className="w-10 h-10 rounded-2xl bg-red-950 border border-red-500/60 flex items-center justify-center text-red-400 shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-cyber font-bold text-white text-base">{membership.planName}</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-400 border border-red-500/50">
              {status.label}
            </span>
          </div>
          <p className="text-sm text-red-100 leading-snug">{status.message}</p>
          {membership.currentPeriodEnd && (
            <p className="text-xs text-red-200/80">
              {membership.status === 'past_due' ? 'Período hasta' : 'Venció el'}{' '}
              <span className="font-mono">{formatPeriodEnd(membership.currentPeriodEnd)}</span>
            </p>
          )}
          <PayPlanButton />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto p-4 sm:p-5 rounded-3xl bg-zinc-950 border border-zinc-800 flex items-center gap-3 text-left font-sans">
      <div className="w-10 h-10 rounded-2xl bg-black border border-[#edcc36]/40 flex items-center justify-center text-[#edcc36] shrink-0">
        <ShieldCheck className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-cyber font-bold text-white text-base">{membership.planName}</h3>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#edcc36]/15 text-[#edcc36] border border-[#edcc36]/30">
            {status.label}
          </span>
        </div>
        <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-xs text-zinc-400 mt-0.5">
          {membership.currentPeriodEnd && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
              <span>
                Vence: <span className="font-mono text-zinc-200">{formatPeriodEnd(membership.currentPeriodEnd)}</span>
              </span>
            </span>
          )}
          {membership.creditsRemaining !== null && (
            <span className="text-[#edcc36] font-bold">
              <span className="font-mono">{membership.creditsRemaining}</span>{' '}
              {membership.creditsRemaining === 1 ? 'clase disponible' : 'clases disponibles'}
            </span>
          )}
        </div>
        <p className="text-[11px] text-zinc-500 mt-1">Las cuotas se abonan en recepción: efectivo, transferencia o tarjeta.</p>
        <PayPlanButton label="Renovar online" />
      </div>
    </div>
  );
};
