/** Fotos de productos: bucket público `productos`, ruta <org_id>/<product_id>-<n>.jpg */
export const PRODUCT_BUCKET = 'productos'

/** Link público de la foto (o null si el producto no tiene). */
export function productImageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return null
  return `${base}/storage/v1/object/public/${PRODUCT_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`
}
