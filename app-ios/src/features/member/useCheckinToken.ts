import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { supabase } from '@/lib/supabase'

export interface CheckinToken {
  token: string
  expiresAt: string
  refreshInSeconds: number
}

/** Se pide el código nuevo unos segundos antes de que venza, para que el QR nunca quede inválido en pantalla. */
const REFRESH_EARLY_SECONDS = 3
const MIN_REFRESH_SECONDS = 10
const SILENT_RETRIES = 2
const RETRY_DELAY_MS = 2000
const OFFLINE_RETRY_MS = 10_000

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Código del QR de acceso: lo genera y firma el servidor (get_checkin_token), igual que en la web,
 * así la tablet del molinete lo valida con turnstile_scan sin ningún cambio.
 * Se renueva solo y, si falla la red, se sigue mostrando el código anterior mientras sirva.
 */
export function useCheckinToken(memberId: string | null, enabled: boolean) {
  const [token, setToken] = useState<CheckinToken | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const inFlight = useRef(false)
  const seqRef = useRef(0)

  const refresh = useCallback(async () => {
    if (!memberId || !enabled || inFlight.current) return
    inFlight.current = true
    const seq = ++seqRef.current
    try {
      for (let attempt = 0; attempt <= SILENT_RETRIES; attempt++) {
        try {
          const { data, error: err } = await supabase
            .rpc('get_checkin_token', { p_member_id: memberId })
            .abortSignal(AbortSignal.timeout(8000))
          if (seq !== seqRef.current) return // cambió el socio mientras respondía
          if (!err && data) {
            const d = data as { token: string; expires_at: string; refresh_in_seconds: number }
            setToken({ token: d.token, expiresAt: d.expires_at, refreshInSeconds: Number(d.refresh_in_seconds) || 30 })
            setError(null)
            return
          }
        } catch {
          /* error de red: se reintenta */
        }
        if (attempt < SILENT_RETRIES) await wait(RETRY_DELAY_MS)
      }
      if (seq === seqRef.current) setError('Revisá tu conexión a internet. Seguimos intentando solos.')
    } finally {
      if (seq === seqRef.current) setLoading(false)
      inFlight.current = false
    }
  }, [memberId, enabled])

  // Cambio de socio (cuenta familiar) o de estado: se descarta el código anterior
  useEffect(() => {
    seqRef.current++
    inFlight.current = false
    setToken(null)
    setError(null)
    setLoading(true)
    void refresh()
  }, [refresh])

  // Cuenta regresiva desde que llegó el código (reloj del celular mal configurado no afecta)
  useEffect(() => {
    if (!token || !enabled) return
    const total = Math.max(MIN_REFRESH_SECONDS, Math.round(token.refreshInSeconds))
    const receivedAt = Date.now()
    let requested = false
    const tick = () => {
      const left = Math.max(0, Math.ceil(total - (Date.now() - receivedAt) / 1000))
      setSecondsLeft(left)
      if (!requested && left <= REFRESH_EARLY_SECONDS) {
        requested = true
        void refresh()
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [token, enabled, refresh])

  // Sin conexión: reintento cada 10 s
  useEffect(() => {
    if (!error) return
    const id = setInterval(() => void refresh(), OFFLINE_RETRY_MS)
    return () => clearInterval(id)
  }, [error, refresh])

  // Al volver a la app (estaba en segundo plano), código nuevo enseguida
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh()
    })
    return () => sub.remove()
  }, [refresh])

  const stillValid = !!token && Date.parse(token.expiresAt) + token.refreshInSeconds * 1000 > Date.now()
  return { token, loading, error: error && !stillValid ? error : null, secondsLeft, refresh }
}
