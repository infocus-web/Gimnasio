import type { MembershipSummary } from '../../types/platform';

/** Marca "sin plan": el socio no tiene ninguna membresía cargada. */
export const NO_MEMBERSHIP: MembershipSummary = {
  planName: '',
  status: 'expired',
  currentPeriodEnd: '',
  creditsRemaining: null,
};

export const isNoMembership = (m: MembershipSummary | null | undefined) =>
  !m || m === NO_MEMBERSHIP || (m.planName === '' && m.currentPeriodEnd === '');

export type PassKind = 'valid' | 'blocked' | 'none';

export interface PassStatus {
  kind: PassKind;
  /** Texto corto del estado (badge). */
  label: string;
  /** Explicación para el socio cuando el pase no habilita el ingreso. */
  message: string;
}

const RECEPTION_PAYMENT = 'Se abona en recepción: efectivo, transferencia o tarjeta.';

/** Única fuente de verdad: estado de la membresía → lo que ve el socio en el pase y el banner. */
export function getPassStatus(m: MembershipSummary | null | undefined): PassStatus {
  if (isNoMembership(m)) {
    return {
      kind: 'none',
      label: 'SIN PLAN',
      message: 'No tenés un plan activo. Acercate a recepción para inscribirte.',
    };
  }
  switch (m!.status) {
    case 'active':
      return { kind: 'valid', label: 'AL DÍA', message: '' };
    case 'trialing':
      return { kind: 'valid', label: 'PRUEBA', message: '' };
    case 'past_due':
      return {
        kind: 'blocked',
        label: 'PAGO PENDIENTE',
        message: `Tenés una cuota pendiente. Regularizala para volver a ingresar y reservar clases. ${RECEPTION_PAYMENT}`,
      };
    case 'paused':
      return {
        kind: 'blocked',
        label: 'PAUSADO',
        message: 'Tu plan está pausado. Consultá en recepción para reactivarlo.',
      };
    case 'expired':
    case 'canceled':
    default:
      return {
        kind: 'blocked',
        label: 'VENCIDO',
        message: `Tu plan venció. Renovalo para volver a ingresar. ${RECEPTION_PAYMENT}`,
      };
  }
}

export const formatPeriodEnd = (iso: string) =>
  iso
    ? new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date(iso))
    : '';
