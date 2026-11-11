import * as AppleAuthentication from 'expo-apple-authentication'
import * as Crypto from 'expo-crypto'
import * as WebBrowser from 'expo-web-browser'
import { supabase } from '@/lib/supabase'
import { AUTH_REDIRECT } from '@/lib/config'

/** Resultado para mostrar en pantalla: null = salió bien o el socio canceló. */
export type SocialResult = string | null

/**
 * Iniciar sesión con Apple (nativo, Face ID). Apple lo exige porque la app ofrece Google.
 * Se manda a Apple el nonce cifrado y a Supabase el original: así Supabase comprueba que el token es de este pedido.
 */
export async function signInWithApple(): Promise<SocialResult> {
  try {
    const rawNonce = Crypto.randomUUID()
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce)
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    })
    if (!credential.identityToken) return 'Apple no devolvió los datos. Probá de nuevo.'
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce: rawNonce })
    if (error) {
      return /not enabled|unsupported provider/i.test(error.message)
        ? 'Por ahora no se puede entrar con Apple. Usá tu email y contraseña.'
        : 'No pudimos entrar con Apple. Probá de nuevo.'
    }
    // Apple manda el nombre solo la primera vez: se guarda en la cuenta
    const given = credential.fullName?.givenName
    const family = credential.fullName?.familyName
    if (given || family) {
      await supabase.auth.updateUser({
        data: { full_name: [given, family].filter(Boolean).join(' '), given_name: given ?? undefined, family_name: family ?? undefined },
      })
    }
    return null
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null
    return 'No pudimos entrar con Apple. Probá de nuevo.'
  }
}

/**
 * Continuar con Google: se abre la pantalla segura de iOS (no Safari), el socio elige su cuenta
 * y vuelve a la app con un código que se canjea por la sesión (PKCE). No usa cookies de Safari.
 */
export async function signInWithGoogle(): Promise<SocialResult> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  })
  if (error || !data?.url) {
    return error && /not enabled|unsupported provider/i.test(error.message)
      ? 'Por ahora no se puede entrar con Google. Usá tu email y contraseña.'
      : 'No pudimos abrir Google. Probá de nuevo.'
  }
  const result = await WebBrowser.openAuthSessionAsync(data.url, AUTH_REDIRECT, { preferEphemeralSession: false })
  if (result.type !== 'success') return null // canceló
  const url = new URL(result.url)
  const code = url.searchParams.get('code')
  if (!code) {
    const desc = url.searchParams.get('error_description')
    return desc ? 'Google no autorizó el ingreso. Probá de nuevo.' : 'No pudimos entrar con Google. Probá de nuevo.'
  }
  const { error: exErr } = await supabase.auth.exchangeCodeForSession(code)
  return exErr ? 'No pudimos entrar con Google. Probá de nuevo.' : null
}
