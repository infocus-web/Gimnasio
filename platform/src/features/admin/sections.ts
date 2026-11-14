import type { Permission } from './context'

/**
 * Menú del panel agrupado por secciones (una sola fuente de verdad).
 *
 * Cada sección es un botón del menú; sus pestañas son las pantallas relacionadas.
 * Solo aparecen las pestañas que la persona puede usar según sus permisos, y una sección
 * sin pestañas visibles no aparece. Para agregar una pantalla nueva alcanza con sumarla acá.
 */

export type SectionIcon = 'home' | 'users' | 'billing' | 'calendar' | 'dumbbell' | 'message' | 'chart' | 'settings'

export interface SectionTab {
  href: string
  label: string
}

export interface AdminSection {
  id: string
  label: string
  icon: SectionIcon
  tabs: SectionTab[]
  /** Rutas que también pertenecen a la sección aunque no tengan pestaña (ej. la ficha de una clase). */
  also?: string[]
}

interface SectionCtx {
  can: (p: Permission) => boolean
  staff: { role: string }
}

export function buildAdminSections(ctx: SectionCtx, base: string, opts: { pendingRequests?: number } = {}): AdminSection[] {
  const can = ctx.can
  const isTrainer = ctx.staff.role === 'trainer'
  const isAdmin = ctx.staff.role === 'owner' || ctx.staff.role === 'admin'
  const tab = (show: boolean | undefined, path: string, label: string): SectionTab[] =>
    show ? [{ href: `${base}${path}`, label }] : []

  const scheduleManage = can('schedule.manage')
  const agenda = scheduleManage || can('bookings.manage')
  const ownClasses = isTrainer || can('schedule.own')
  const training = isTrainer || can('training.manage_all')
  const pending = opts.pendingRequests ?? 0

  const sections: AdminSection[] = [
    {
      id: 'hoy',
      label: 'Hoy',
      icon: 'home',
      tabs: [
        { href: base, label: 'Inicio' },
        ...tab(can('checkins.manage'), '/recepcion', 'Recepción'),
        ...tab(can('checkins.manage'), '/pases', 'Pases e invitados'),
      ],
    },
    {
      id: 'socios',
      label: 'Socios',
      icon: 'users',
      tabs: [
        ...tab(can('members.read'), '/socios', 'Lista de socios'),
        ...tab(can('billing.read'), '/socios/vencidos', 'Vencidos y por vencer'),
        ...tab(can('members.write'), '/socios/riesgo', 'En riesgo'),
      ],
    },
    {
      id: 'caja',
      label: can('billing.read') ? 'Caja' : 'Vender',
      icon: 'billing',
      tabs: [
        ...tab(can('billing.read'), '/pagos', 'Caja del día'),
        ...tab(can('billing.read') || can('sales.write'), '/pagos/vender', 'Vender'),
        ...tab(can('billing.read'), '/pagos/cierre', 'Cierre de caja'),
        ...tab(can('billing.read'), '/pagos/online', 'Pagos online'),
        ...tab(can('billing.read'), '/pagos/planes', 'Planes'),
        ...tab(can('billing.read'), '/pagos/productos', 'Productos'),
        ...tab(can('members.write') && can('billing.read'), '/pagos/reglas', 'Regalos y congelamiento'),
      ],
    },
    {
      id: 'clases',
      label: 'Clases',
      icon: 'calendar',
      tabs: [
        ...tab(agenda, '/agenda', 'Semana'),
        ...tab(scheduleManage, '/agenda/grilla', 'Grilla semanal'),
        ...tab(scheduleManage, '/agenda/actividades', 'Actividades'),
        ...tab(scheduleManage, '/agenda/salas', 'Salas y equipos'),
        ...tab(ownClasses, '/mis-clases', 'Mis clases'),
        ...tab(ownClasses, '/mis-clases/horarios', 'Mis horarios'),
        ...tab(ownClasses, '/mis-clases/socios', 'Socios de mis clases'),
        ...tab(ownClasses, '/mis-clases/mensajes', 'Mensajes'),
        ...tab(ownClasses, '/mis-clases/pizarra', 'Pizarra TV'),
      ],
      // El profe abre la ficha de una clase suya (/agenda/<id>) desde «Mis clases»
      also: [`${base}/agenda`],
    },
    {
      id: 'entrenamiento',
      label: 'Entrenamiento',
      icon: 'dumbbell',
      tabs: [
        ...tab(training, '/alumnos', isTrainer ? 'Mis alumnos' : 'Alumnos'),
        ...tab(training, '/rutinas', 'Rutinas'),
        ...tab(training, '/maquinas', 'Máquinas'),
      ],
    },
    {
      id: 'comunicacion',
      label: 'Comunicación',
      icon: 'message',
      tabs: [
        ...tab(can('members.write'), '/comunicacion', 'Avisos automáticos'),
        ...tab(can('members.write'), '/comunicacion/encuestas', 'Encuestas'),
        ...tab(can('members.write'), '/comunicacion/retos', 'Retos'),
        ...tab(can('members.write'), '/comunicacion/referidos', 'Referidos'),
        ...tab(can('members.write'), '/comunicacion/historial', 'Historial'),
      ],
    },
    {
      id: 'numeros',
      label: 'Números',
      icon: 'chart',
      tabs: [
        ...tab(can('reports.read'), '/negocio', 'Resumen'),
        ...tab(can('reports.read'), '/reportes', 'Mes a mes'),
        ...tab(isAdmin, '/pagos/ganancias', 'Ganancias'),
      ],
    },
    {
      id: 'configuracion',
      label: pending ? `Configuración (${pending})` : 'Configuración',
      icon: 'settings',
      tabs: [
        ...tab(can('staff.manage'), '/equipo', pending ? `Equipo (${pending})` : 'Equipo'),
        ...tab(can('org.manage'), '/accesos', 'Lectores y molinete'),
        ...tab(can('org.manage') || can('training.manage_all'), '/pantallas', 'Pantallas'),
        ...tab(can('org.manage'), '/web', 'Web'),
      ],
    },
  ]

  return sections.filter((s) => s.tabs.length > 0)
}

/** Pestaña que corresponde a la ruta actual (la más específica gana). Inicio solo coincide exacto. */
export function findActiveTab(sections: AdminSection[], pathname: string, base: string) {
  let best: { section: AdminSection; tab: SectionTab | null; len: number } | null = null
  for (const section of sections) {
    for (const t of section.tabs) {
      const hit = t.href === base ? pathname === base : pathname === t.href || pathname.startsWith(`${t.href}/`)
      if (hit && (!best || t.href.length > best.len)) best = { section, tab: t, len: t.href.length }
    }
    for (const prefix of section.also ?? []) {
      const hit = pathname === prefix || pathname.startsWith(`${prefix}/`)
      if (hit && (!best || prefix.length > best.len)) best = { section, tab: null, len: prefix.length }
    }
  }
  return best ? { section: best.section, tab: best.tab } : null
}
