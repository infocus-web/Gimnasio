/** Una pantalla de publicidad (Panel → Pantallas): imagen + textos animados opcionales. */
export interface PromoSlideData {
  url: string
  badge?: string | null
  title?: string | null
  subtitle?: string | null
  style?: PromoStyle
  position?: PromoPosition
  orientation?: PromoOrientation
}

export const PROMO_STYLES = [
  { value: 'impacto', label: 'Impacto', hint: 'El título entra grande y desenfocado y se acomoda de golpe' },
  { value: 'deslizar', label: 'Deslizar', hint: 'Los textos entran de costado, uno detrás del otro' },
  { value: 'suave', label: 'Suave', hint: 'Aparecen subiendo despacio' },
] as const
export type PromoStyle = (typeof PROMO_STYLES)[number]['value']

export const PROMO_POSITIONS = [
  { value: 'top', label: 'Arriba' },
  { value: 'center', label: 'Centro' },
  { value: 'bottom', label: 'Abajo' },
] as const
export type PromoPosition = (typeof PROMO_POSITIONS)[number]['value']

export const PROMO_ORIENTATIONS = [
  { value: 'vertical', label: 'Vertical', hint: 'Solo la tablet del molinete' },
  { value: 'horizontal', label: 'Horizontal', hint: 'Solo los televisores' },
  { value: 'both', label: 'Las dos', hint: 'Tablet y televisores' },
] as const
export type PromoOrientation = (typeof PROMO_ORIENTATIONS)[number]['value']

export const isPromoStyle = (v: unknown): v is PromoStyle => PROMO_STYLES.some((s) => s.value === v)
export const isPromoPosition = (v: unknown): v is PromoPosition => PROMO_POSITIONS.some((s) => s.value === v)
export const isPromoOrientation = (v: unknown): v is PromoOrientation => PROMO_ORIENTATIONS.some((s) => s.value === v)

/** ¿Va en esta pantalla? La tablet muestra las verticales; los televisores, las horizontales. */
export function fitsScreen(s: PromoSlideData, screen: 'vertical' | 'horizontal') {
  const o = s.orientation ?? 'both'
  return o === 'both' || o === screen
}

/** Cuánto dura en pantalla: con textos un poco más, para que se lean */
export const promoDurationMs = (s: PromoSlideData) => (s.title || s.subtitle ? 8000 : 6000)
