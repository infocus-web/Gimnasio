/**
 * Videos explicativos del panel (public/ayuda/video-N.mp4).
 * Cada pantalla abre el video que le corresponde, desde el segundo en que se explica esa parte.
 * Los videos están acelerados 1,15× (los segundos de abajo ya están ajustados).
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
  '/socios/nuevo': [5, 19.5],
  '/recepcion': [6, 0],
  '/accesos': [6, 24],
  '/pagos': [7, 0],
  '/pagos/vender': [7, 12],
  '/pagos/productos': [7, 23.3],
  '/pagos/cierre': [7, 32.3],
  '/pagos/ganancias': [7, 55],
  '/pagos/planes': [8, 4.3],
  '/socios/vencidos': [8, 26.3],
  '/pagos/online': [8, 32.4],
  '/agenda': [9, 0],
  '/agenda/grilla': [9, 12.8],
  '/agenda/actividades': [9, 33],
  '/agenda/salas': [9, 40.3],
  '/mis-clases': [1, 0],
  '/mis-clases/horarios': [2, 5.7],
  '/mis-clases/socios': [2, 38.2],
  '/mis-clases/mensajes': [2, 65.5],
  '/alumnos': [3, 3.5],
  '/rutinas': [3, 13.8],
  '/maquinas': [3, 35.9],
  '/comunicacion': [10, 0],
  '/socios/riesgo': [10, 23.6],
  '/comunicacion/encuestas': [10, 33.5],
  '/comunicacion/retos': [10, 39.2],
  '/comunicacion/referidos': [10, 45.6],
  '/pagos/reglas': [10, 45.6],
  '/comunicacion/historial': [10, 0],
  '/equipo': [11, 0],
  '/negocio': [11, 22.7],
  '/reportes': [11, 22.7],
  '/web': [11, 36.7],
  '/pases': [11, 43],
}

const UUID = /^\/agenda\/[0-9a-f-]{36}$/i

/** Video para la pantalla actual (pathname completo, ej. /evolution/admin/pagos/cierre). */
export function helpVideoFor(pathname: string): { video: HelpVideo; start: number } | null {
  const m = pathname.match(/^\/[^/]+\/admin(\/.*)?$/)
  if (!m) return null
  const rest = (m[1] ?? '').replace(/\/$/, '')
  const hit = ROUTES[rest] ?? (UUID.test(rest) ? ([1, 23] as [number, number]) : null)
  const video = hit ? HELP_VIDEOS[hit[0]] : undefined
  return hit && video ? { video, start: hit[1] } : null
}

export const helpVideoSrc = (n: number) => `/ayuda/video-${n}.mp4`
export const helpVideoPoster = (n: number) => `/ayuda/video-${n}.jpg`
