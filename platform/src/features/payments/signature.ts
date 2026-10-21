import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Firma de las notificaciones (webhooks) de Mercado Pago.
 * Doc oficial: header `x-signature: ts=<ts>,v1=<hmac>` y `x-request-id`.
 * El manifiesto es `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * (data.id viene en la query string; si es alfanumérico va en minúsculas;
 *  si falta alguna parte, se omite ese tramo del manifiesto).
 * v1 = HMAC-SHA256(manifiesto, clave secreta del webhook) en hex.
 *
 * Módulo puro (sin Next ni Supabase) para poder probarlo con
 * `node --experimental-strip-types src/features/payments/signature.test.ts`.
 */
export interface MpSignatureInput {
  xSignature: string | null
  xRequestId: string | null
  dataId: string | null
  secret: string
  /** Si se pasa, rechaza avisos más viejos que esto (en segundos). MP manda ts en milisegundos. */
  maxAgeSeconds?: number
  now?: number
}

export function parseMpSignature(header: string | null): { ts: string; v1: string } | null {
  if (!header) return null
  let ts = ''
  let v1 = ''
  for (const part of header.split(',')) {
    const [k, ...rest] = part.split('=')
    const key = k?.trim()
    const value = rest.join('=').trim()
    if (key === 'ts') ts = value
    else if (key === 'v1') v1 = value
  }
  return ts && v1 ? { ts, v1 } : null
}

export function mpManifest(dataId: string | null, xRequestId: string | null, ts: string) {
  const id = dataId && /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId
  let m = ''
  if (id) m += `id:${id};`
  if (xRequestId) m += `request-id:${xRequestId};`
  m += `ts:${ts};`
  return m
}

export function signMpManifest(manifest: string, secret: string) {
  return createHmac('sha256', secret).update(manifest).digest('hex')
}

export function verifyMpSignature(input: MpSignatureInput): boolean {
  if (!input.secret) return false
  const parsed = parseMpSignature(input.xSignature)
  if (!parsed) return false
  if (input.maxAgeSeconds) {
    const tsNum = Number(parsed.ts)
    if (!Number.isFinite(tsNum)) return false
    const tsMs = tsNum > 1e12 ? tsNum : tsNum * 1000
    if (Math.abs((input.now ?? Date.now()) - tsMs) > input.maxAgeSeconds * 1000) return false
  }
  const expected = signMpManifest(mpManifest(input.dataId, input.xRequestId, parsed.ts), input.secret)
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(parsed.v1.toLowerCase(), 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}
