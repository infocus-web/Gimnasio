/**
 * Rutas internas seguras para parámetros "next": solo "/algo" del mismo sitio.
 * Rechaza "//evil.com", "/\evil.com" y cualquier cosa con esquema o barras invertidas.
 */
export function safeInternalPath(value: string | null | undefined, fallback: string): string {
  if (!value || typeof value !== 'string') return fallback
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f]/.test(value)) return fallback
  try {
    const u = new URL(value, 'https://internal.invalid')
    if (u.origin !== 'https://internal.invalid') return fallback
    return `${u.pathname}${u.search}`
  } catch {
    return fallback
  }
}
