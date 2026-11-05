/**
 * WhatsApp para profes: plantillas, números y links.
 * Hoy el envío es "manual": se abre WhatsApp con el mensaje escrito (wa.me).
 * Cuando se conecte la API, estas mismas plantillas y números se usan para enviar desde el servidor.
 */

export interface MessageTemplate {
  key: string
  label: string
  body: string
  /** id en message_templates (si viene de la base) */
  id?: string
  /** true = es del profe; false/undefined = del gimnasio */
  mine?: boolean
}

/** Datos de una clase para completar {clase} {dia} {hora} */
export interface ClassVars {
  clase: string
  dia: string
  hora: string
}

/**
 * Plantillas de respaldo (si el gimnasio todavía no tiene mensajes cargados en la base).
 * {nombre} = nombre del alumno · {profe} = quien envía · {clase} {dia} {hora} = la clase (desde una clase).
 * Lo que está entre [corchetes] lo completa el profe.
 */
export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    key: 'recordatorio_clase',
    label: 'Recordatorio de clase',
    body: '¡Hola {nombre}! Te recuerdo la clase de [día y hora]. ¡Te espero! 💪\n— {profe}',
  },
  {
    key: 'nueva_rutina',
    label: 'Rutina nueva',
    body: '¡Hola {nombre}! Ya tenés tu rutina nueva en la app, en la pestaña Entrenar. Cualquier duda, consultame.\n— {profe}',
  },
  {
    key: 'te_extranamos',
    label: 'Te extrañamos',
    body: '¡Hola {nombre}! Hace unos días que no te vemos por el gimnasio. ¿Todo bien? Te esperamos para retomar 💪\n— {profe}',
  },
  {
    key: 'animo',
    label: 'Ánimo',
    body: '¡Vamos {nombre}! La constancia es la clave: cada entrenamiento suma. ¡Nos vemos en el gym! 🔥\n— {profe}',
  },
  {
    key: 'felicitaciones',
    label: 'Felicitaciones',
    body: '¡Felicitaciones {nombre}! Venís progresando muy bien. ¡Seguí así! 👏\n— {profe}',
  },
  {
    key: 'invitacion',
    label: 'Invitación',
    body: '¡Hola {nombre}! Te invito a [actividad o evento] el [día] a las [hora]. ¿Te sumás?\n— {profe}',
  },
]

/** Reemplaza {nombre}, {profe} y (si vienen) {clase} {dia} {hora}. Usa solo el primer nombre para que suene cercano. */
export function fillMessage(body: string, vars: { nombre: string; profe: string } & Partial<ClassVars>) {
  // Primer nombre y en formato normal ("CAMILA DAIANA" → "Camila")
  const first = (s: string) => {
    const w = s.trim().split(/\s+/)[0] ?? s
    return w.charAt(0).toLocaleUpperCase('es-AR') + w.slice(1).toLocaleLowerCase('es-AR')
  }
  let out = body.replace(/\{nombre\}/gi, first(vars.nombre)).replace(/\{profe\}/gi, first(vars.profe))
  // Sin clase elegida quedan como [clase] [día] [hora] para completar a mano
  out = out.replace(/\{clase\}/gi, vars.clase ?? '[clase]')
  out = out.replace(/\{dia\}/gi, vars.dia ?? '[día]')
  out = out.replace(/\{hora\}/gi, vars.hora ?? '[hora]')
  return out
}

/** "martes 12/11" y "19:00" de una clase, en la zona del gimnasio */
export function classVars(name: string, startsAt: string, tz: string): ClassVars {
  const d = new Date(startsAt)
  const dia = new Intl.DateTimeFormat('es-AR', { timeZone: tz, weekday: 'long', day: '2-digit', month: '2-digit' }).format(d).replace(',', '')
  const hora = new Intl.DateTimeFormat('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
  return { clase: name, dia, hora }
}

/**
 * Teléfono argentino → formato internacional para WhatsApp (549 + área + número, sin 0 ni 15).
 * Acepta "11 5555-1234", "011 15 5555 1234", "+54 9 11 5555 1234", "2304 15 123456", etc.
 * Devuelve null si no se puede interpretar con seguridad.
 */
export function normalizeArPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let d = raw.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('54')) {
    d = d.slice(2)
    if (d.startsWith('9')) d = d.slice(1)
  }
  if (d.startsWith('0')) d = d.slice(1)
  // Sacar el "15" de celular que va después del código de área (área de 2, 3 o 4 dígitos)
  if (d.length === 12) {
    for (const areaLen of [2, 3, 4]) {
      if (d.slice(areaLen, areaLen + 2) === '15') {
        d = d.slice(0, areaLen) + d.slice(areaLen + 2)
        break
      }
    }
  }
  // "15 5555 1234" sin código de área: no adivinamos la zona
  if (d.length !== 10 || d.startsWith('15')) return null
  return `549${d}`
}

export function whatsappLink(phone: string, text: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
}
