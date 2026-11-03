/**
 * Lee el CSV que exportan las balanzas de bioimpedancia (InBody / LookinBody, Tanita, Omron…).
 * Cada marca nombra distinto las columnas, así que se reconocen por palabras clave
 * (en español o inglés). Hace falta al menos: DNI (o ID), fecha y peso o % de grasa.
 * Sin dependencias: se prueba con node directamente.
 */

export interface ScaleRow {
  dni: string
  measured_at: string
  weight_kg: number | null
  body_fat_pct: number | null
  muscle_kg: number | null
  visceral_fat: number | null
  water_pct: number | null
  bmr_kcal: number | null
}

export interface ParsedScale {
  rows: ScaleRow[]
  skipped: number
  /** Columnas reconocidas (para mostrarle al profe qué entendimos) */
  columns: Partial<Record<keyof ScaleRow | 'time', string>>
  error?: string
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

// El orden importa: lo más específico primero
const MATCHERS: [keyof ScaleRow | 'time', RegExp][] = [
  ['dni', /^(dni|documento|nro\.? de documento|numero de documento|doc|id|user id|id number|member id|socio id)$/],
  ['body_fat_pct', /(pbf|percent body fat|body fat ?%|% ?grasa|grasa corporal ?%|grasa ?%|fat ?%|% ?fat|porcentaje de grasa)/],
  ['visceral_fat', /visceral/],
  ['muscle_kg', /(smm|skeletal muscle|masa muscular|muscle mass|musculo)/],
  ['water_pct', /(tbw ?%|water ?%|% ?agua|agua ?%|agua corporal|body water)/],
  ['bmr_kcal', /(bmr|metabolismo basal|basal metabolic)/],
  ['weight_kg', /^(peso|weight|peso \(kg\)|weight ?\(kg\)|peso kg|weight kg|body weight|peso corporal)$/],
  ['measured_at', /(fecha|date|test date|datetime|measured)/],
  ['time', /^(hora|time)$/],
]

function splitLine(line: string, sep: string) {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"'
        i++
      } else quoted = !quoted
    } else if (c === sep && !quoted) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map((v) => v.trim())
}

function toNumber(v: string | undefined, decimalComma: boolean): number | null {
  if (v === undefined) return null
  let t = v.replace(/[^\d.,-]/g, '')
  if (!t) return null
  if (decimalComma) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^\d+,\d+$/.test(t)) t = t.replace(',', '.')
  else t = t.replace(/,/g, '')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Offset "-03:00" de una zona horaria en una fecha dada */
function tzOffset(timeZone: string, utcGuess: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(utcGuess)
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(name)
  return m ? `${m[1]}:${m[2] ?? '00'}` : '+00:00'
}

/** Fecha y hora local de la balanza → ISO con el offset del gimnasio */
export function parseScaleDate(date: string, time: string | undefined, timeZone: string): string | null {
  const t = `${date} ${time ?? ''}`.trim()
  let y: number, mo: number, d: number, h = 12, mi = 0, s = 0
  let m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?$/.exec(t)   // InBody: 20261102103000
  if (m) {
    ;[y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number) as [number, number, number, number, number, number]
  } else if ((m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(t))) {
    ;[y, mo, d] = [m[1], m[2], m[3]].map(Number) as [number, number, number]
    if (m[4]) [h, mi, s] = [m[4], m[5], m[6] ?? '0'].map(Number) as [number, number, number]
  } else if ((m = /^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(t))) {
    // En Argentina las balanzas exportan día/mes/año
    ;[d, mo, y] = [m[1], m[2], m[3]].map(Number) as [number, number, number]
    if (y < 100) y += 2000
    if (m[4]) [h, mi, s] = [m[4], m[5], m[6] ?? '0'].map(Number) as [number, number, number]
  } else return null
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59 || y < 2000 || y > 2100) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  const local = `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}`
  const offset = tzOffset(timeZone, new Date(`${local}Z`))
  const iso = `${local}${offset}`
  return Number.isNaN(new Date(iso).getTime()) ? null : iso
}

export function parseScaleCsv(text: string, timeZone = 'America/Argentina/Buenos_Aires'): ParsedScale {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length < 2) return { rows: [], skipped: 0, columns: {}, error: 'El archivo está vacío o no tiene filas.' }
  const first = lines[0]!
  const sep = [';', '\t', ','].reduce((best, c) => (first.split(c).length > first.split(best).length ? c : best), ',')
  const decimalComma = sep !== ','
  const header = splitLine(first, sep).map(norm)

  const columns: ParsedScale['columns'] = {}
  const index: Partial<Record<keyof ScaleRow | 'time', number>> = {}
  for (const [key, re] of MATCHERS) {
    const i = header.findIndex((h, j) => re.test(h) && !Object.values(index).includes(j))
    if (i >= 0) {
      index[key] = i
      columns[key] = splitLine(first, sep)[i]
    }
  }
  if (index.dni === undefined) return { rows: [], skipped: 0, columns, error: 'No encontramos la columna del DNI (o ID) del socio.' }
  if (index.measured_at === undefined) return { rows: [], skipped: 0, columns, error: 'No encontramos la columna de la fecha.' }
  if (index.weight_kg === undefined && index.body_fat_pct === undefined) {
    return { rows: [], skipped: 0, columns, error: 'No encontramos el peso ni el % de grasa.' }
  }

  const rows: ScaleRow[] = []
  let skipped = 0
  for (const line of lines.slice(1)) {
    const cells = splitLine(line, sep)
    const get = (k: keyof ScaleRow | 'time') => (index[k] === undefined ? undefined : cells[index[k]!])
    const dni = (get('dni') ?? '').replace(/\D/g, '')
    const at = parseScaleDate(get('measured_at') ?? '', get('time'), timeZone)
    const n = (k: keyof ScaleRow) => toNumber(get(k), decimalComma)
    const row: ScaleRow = {
      dni,
      measured_at: at ?? '',
      weight_kg: n('weight_kg'),
      body_fat_pct: n('body_fat_pct'),
      muscle_kg: n('muscle_kg'),
      visceral_fat: n('visceral_fat'),
      water_pct: n('water_pct'),
      bmr_kcal: n('bmr_kcal'),
    }
    const plausible =
      (row.weight_kg === null || (row.weight_kg >= 20 && row.weight_kg <= 300)) &&
      (row.body_fat_pct === null || (row.body_fat_pct >= 3 && row.body_fat_pct <= 70)) &&
      (row.weight_kg !== null || row.body_fat_pct !== null)
    if (dni.length < 6 || !at || !plausible) {
      skipped++
      continue
    }
    rows.push(row)
  }
  return { rows, skipped, columns }
}
