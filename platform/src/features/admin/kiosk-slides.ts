/** Publicidad de la tablet del molinete: bucket público `molinete`, ruta <org_id>/<uuid>.jpg */
export const KIOSK_BUCKET = 'molinete'

/** Link público de la imagen. */
export function kioskSlideUrl(path: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return null
  return `${base}/storage/v1/object/public/${KIOSK_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`
}
