/** "2 horas", "90 minutos", "1 hora y 30 minutos" a partir de organizations.late_cancel_minutes. */
export function formatLateCancelWindow(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} ${rest === 1 ? 'minuto' : 'minutos'}`;
  const hours = `${h} ${h === 1 ? 'hora' : 'horas'}`;
  return rest ? `${hours} y ${rest} minutos` : hours;
}
