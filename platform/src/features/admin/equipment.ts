/**
 * Tipos de equipo: en la base se guardan en inglés (bike, rower…) porque así
 * los usan las reservas y la web; en pantalla se muestran en castellano.
 * Sin 'use client' ni 'server-only': lo usan páginas y formularios.
 */
export const EQUIPMENT_KINDS = [
  { value: 'bike', label: 'Bici' },
  { value: 'rower', label: 'Remo' },
  { value: 'reformer', label: 'Reformer' },
  { value: 'treadmill', label: 'Cinta' },
] as const

const LABELS: Record<string, string> = Object.fromEntries(EQUIPMENT_KINDS.map((k) => [k.value, k.label]))

export function equipmentLabel(kind: string | null | undefined): string {
  const k = (kind ?? '').trim()
  if (!k) return ''
  return LABELS[k.toLowerCase()] ?? k.charAt(0).toUpperCase() + k.slice(1)
}

export function isKnownEquipmentKind(kind: string | null | undefined) {
  return !!kind && kind.toLowerCase() in LABELS
}
