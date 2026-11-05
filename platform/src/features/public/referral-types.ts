/** Respuesta de public_referral_lookup() (0039): código de un socio para la inscripción online. */
export interface ReferralInfo {
  valid: boolean
  code?: string
  referrer?: string
  referrer_activities?: string[]
  promos?: {
    cross: boolean
    duo: number | null
    welcome: { pct: number; days: number } | null
  }
}
export type FriendPromo = 'cross' | 'duo' | 'welcome'
