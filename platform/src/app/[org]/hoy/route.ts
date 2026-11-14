/**
 * "Hoy en el gimnasio" ya no se publica en la web: lo de la TV de la sala
 * (mensaje, gente ahora, clases de hoy) se ve solo en la TV.
 */
export function GET() {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
}
