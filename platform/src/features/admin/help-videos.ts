/**
 * Videos explicativos del panel (public/ayuda/video-N.mp4).
 * Cada pantalla abre el video que le corresponde, desde el segundo en que se explica esa parte.
 */
export interface HelpVideo {
  n: number
  title: string
  audience: 'Profes' | 'Administración'
}

export const HELP_VIDEOS: Record<number, HelpVideo> = {
  1: { n: 1, title: 'Mis clases', audience: 'Profes' },
  2: { n: 2, title: 'Mis horarios, Socios y Mensajes', audience: 'Profes' },
  3: { n: 3, title: 'Alumnos, Rutinas y Máquinas', audience: 'Profes' },
  4: { n: 4, title: 'Recorrido del panel', audience: 'Administración' },
  5: { n: 5, title: 'Socios', audience: 'Administración' },
  6: { n: 6, title: 'Recepción y accesos', audience: 'Administración' },
  7: { n: 7, title: 'Caja y ventas', audience: 'Administración' },
  8: { n: 8, title: 'Planes, vencidos y pagos online', audience: 'Administración' },
  9: { n: 9, title: 'Agenda', audience: 'Administración' },
  10: { n: 10, title: 'Comunicación', audience: 'Administración' },
  11: { n: 11, title: 'Equipo, negocio, web y pases', audience: 'Administración' },
}

/** Ruta dentro de /[org]/admin → [video, segundo de inicio]. */
const ROUTES: Record<string, [number, number]> = {
  '': [4, 0],
  '/socios': [5, 0],
  '/socios/nuevo': [5, 22.4],
  '/recepcion': [6, 0],
  '/accesos': [6, 27.6],
  '/pagos': [7, 0],
  '/pagos/vender': [7, 13.8],
  '/pagos/productos': [7, 26.8],
  '/pagos/cierre': [7, 37.2],
  '/pagos/ganancias': [7, 63.3],
  '/pagos/planes': [8, 5],
  '/pagos/deudores': [8, 30.3],
  '/pagos/online': [8, 37.3],
  '/agenda': [9, 0],
  '/agenda/grilla': [9, 14.7],
  '/agenda/actividades': [9, 38],
  '/agenda/salas': [9, 46.4],
  '/mis-clases': [1, 0],
  '/mis-clases/horarios': [2, 6.6],
  '/mis-clases/socios': [2, 43.9],
  '/mis-clases/mensajes': [2, 75.3],
  '/alumnos': [3, 4],
  '/rutinas': [3, 15.9],
  '/maquinas': [3, 41.3],
  '/comunicacion': [10, 0],
  '/comunicacion/riesgo': [10, 27.1],
  '/comunicacion/encuestas': [10, 38.5],
  '/comunicacion/retos': [10, 45.1],
  '/comunicacion/referidos': [10, 52.4],
  '/comunicacion/reglas': [10, 52.4],
  '/comunicacion/historial': [10, 0],
  '/equipo': [11, 0],
  '/negocio': [11, 26.1],
  '/reportes': [11, 26.1],
  '/web': [11, 42.2],
  '/pases': [11, 49.5],
}

const UUID = /^\/agenda\/[0-9a-f-]{36}$/i

/** Video para la pantalla actual (pathname completo, ej. /evolution/admin/pagos/cierre). */
export function helpVideoFor(pathname: string): { video: HelpVideo; start: number } | null {
  const m = pathname.match(/^\/[^/]+\/admin(\/.*)?$/)
  if (!m) return null
  const rest = (m[1] ?? '').replace(/\/$/, '')
  const hit = ROUTES[rest] ?? (UUID.test(rest) ? ([1, 26.4] as [number, number]) : null)
  const video = hit ? HELP_VIDEOS[hit[0]] : undefined
  return hit && video ? { video, start: hit[1] } : null
}

export const helpVideoSrc = (n: number) => `/ayuda/video-${n}.mp4`
export const helpVideoPoster = (n: number) => `/ayuda/video-${n}.jpg`
