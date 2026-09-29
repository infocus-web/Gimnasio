/**
 * Protocolo ADMS ("Servidor en la nube") de los lectores ZKTeco.
 * Funciones puras: parsean lo que manda el lector y arman lo que se le responde.
 *
 *   GET  /iclock/cdata?SN=…&options=all     → saludo; respondemos las opciones
 *   POST /iclock/cdata?SN=…&table=ATTLOG     → entradas marcadas
 *   POST /iclock/cdata?SN=…&table=OPERLOG    → altas/cambios de usuarios y plantillas
 *   GET  /iclock/getrequest?SN=…             → pide comandos ("C:<id>:<comando>")
 *   POST /iclock/devicecmd?SN=…              → resultado de cada comando ("ID=..&Return=..")
 */

export type AdmsRecord =
  | { k: 'att'; pin: string; t: string; v: number }
  | { k: 'user'; pin: string; name: string }
  | { k: 'bio'; tbl: 'BIODATA' | 'FP' | 'FACE'; pin: string; pin_key: string; key: string; fields: string }

/** "PIN=1\tName=Juan\tPri=0" → pares en orden (respeta mayúsculas de la clave) */
export function parseKv(s: string): [string, string][] {
  return s
    .split('\t')
    .map((part) => {
      const i = part.indexOf('=')
      return i < 0 ? null : ([part.slice(0, i).trim(), part.slice(i + 1)] as [string, string])
    })
    .filter((x): x is [string, string] => !!x && x[0] !== '')
}

const get = (kv: [string, string][], name: string) => kv.find(([k]) => k.toLowerCase() === name.toLowerCase())

function bioRecord(tbl: 'BIODATA' | 'FP' | 'FACE', rest: string): AdmsRecord | null {
  const kv = parseKv(rest)
  const pinPair = get(kv, 'PIN')
  if (!pinPair || !pinPair[1].trim()) return null
  const val = (n: string) => get(kv, n)?.[1] ?? ''
  const key =
    tbl === 'BIODATA' ? `${val('Type')}:${val('No')}:${val('Index')}` : `${val('FID')}`
  const fields = kv
    .filter(([k]) => k.toLowerCase() !== 'pin')
    .map(([k, v]) => `${k}=${v}`)
    .join('\t')
  return { k: 'bio', tbl, pin: pinPair[1].trim(), pin_key: pinPair[0], key, fields }
}

/** Cuerpo de POST /iclock/cdata → registros para adms_push */
export function parseCdata(table: string, body: string): AdmsRecord[] {
  const out: AdmsRecord[] = []
  const T = table.toUpperCase()
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/\0/g, '').trimEnd()
    if (!line.trim()) continue

    if (T === 'ATTLOG') {
      // PIN \t fecha hora \t estado \t modo de verificación \t workcode …
      const [pin, t, , verify] = line.split('\t')
      if (pin?.trim() && t?.trim()) out.push({ k: 'att', pin: pin.trim(), t: t.trim(), v: Number(verify) || 15 })
      continue
    }

    // OPERLOG / USERINFO / BIODATA: "<TIPO> clave=valor\t…" (o directamente "PIN=…" en algunas versiones)
    const m = /^([A-Z]+)\s+(.*)$/.exec(line)
    const kind = m ? (m[1] ?? '') : T === 'BIODATA' ? 'BIODATA' : T === 'USERINFO' ? 'USER' : ''
    const rest = m ? (m[2] ?? '') : line
    if (kind === 'USER') {
      const kv = parseKv(rest)
      const pin = get(kv, 'PIN')?.[1]?.trim()
      if (pin) out.push({ k: 'user', pin, name: (get(kv, 'Name')?.[1] ?? '').trim() })
    } else if (kind === 'BIODATA' || kind === 'FP' || kind === 'FACE') {
      const r = bioRecord(kind, rest)
      if (r) out.push(r)
    }
    // OPLOG, USERPIC, BIOPHOTO, etc.: se ignoran (no guardamos fotos)
  }
  return out
}

/** Cuerpo de POST /iclock/devicecmd → [{id, ret}] */
export function parseResults(body: string) {
  const out: { id: number; ret: number; cmd: string }[] = []
  for (const line of body.split(/\r?\n/)) {
    if (!line.includes('ID=')) continue
    const p = new URLSearchParams(line.trim())
    const id = Number(p.get('ID'))
    const ret = Number(p.get('Return'))
    if (Number.isFinite(id) && id > 0) out.push({ id, ret: Number.isFinite(ret) ? ret : -1, cmd: p.get('CMD') ?? '' })
  }
  return out
}

/** Diferencia horaria en horas enteras de una zona (Argentina → -3) */
export function tzOffsetHours(timeZone: string, at = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(at)
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-3'
    const m = /GMT([+-]\d{1,2})(?::(\d{2}))?/.exec(name)
    return m ? Number(m[1]) : 0
  } catch {
    return -3
  }
}

/** Respuesta al saludo del lector */
export function handshakeOptions(sn: string, opts: { attlogStamp?: string | null; operlogStamp?: string | null; timezone: string }) {
  return [
    `GET OPTION FROM: ${sn}`,
    `ATTLOGStamp=${opts.attlogStamp || 'None'}`,
    `OPERLOGStamp=${opts.operlogStamp || '0'}`,
    'ATTPHOTOStamp=None',
    'ErrorDelay=30',
    'Delay=15',
    'TransTimes=00:00;14:05',
    'TransInterval=1',
    'TransFlag=TransData AttLog OpLog EnrollUser ChgUser EnrollFP ChgFP FACE BioData',
    `TimeZone=${tzOffsetHours(opts.timezone)}`,
    'Realtime=1',
    'Encrypt=None',
    'ServerVer=2.4.1',
    'PushProtVer=2.4.1',
  ].join('\r\n')
}

/** Lo que se guarda en el registro técnico: sin plantillas biométricas */
export function redactForLog(body: string) {
  return body.replace(/(Tmp|TMP|Content|CONTENT)=[^\t\r\n]*/g, '$1=[…]').slice(0, 2000)
}

export function decodeBody(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('latin1').decode(bytes)
  }
}
