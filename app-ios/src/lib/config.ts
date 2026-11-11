import Constants from 'expo-constants'

/** Datos fijos de la app (están en app.json → expo.extra). La clave publicable de Supabase es pública: no es un secreto. */
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>

export const SUPABASE_URL = extra.supabaseUrl ?? 'https://fdncorjgytskdjnlwqpe.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = extra.supabasePublishableKey ?? ''
export const SITE_URL = extra.siteUrl ?? 'https://evolutiongym.fitness'
export const ORG_SLUG = extra.orgSlug ?? 'evolution'

/** Vuelta a la app después de entrar con Google (debe estar en Supabase → Authentication → URL Configuration → Redirect URLs). */
export const AUTH_REDIRECT = 'evolutiongym://auth'

export const WHATSAPP_URL = 'https://wa.me/5491140221335'
