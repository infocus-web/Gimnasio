import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { formatMoney, WEEKDAYS } from '@/features/admin/format'
import type { Dashboard } from './types'

const SHORT_DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/** Variación contra el período anterior. `inverse`: subir es malo (ej. bajas). */
export function Delta({ cur, prev, inverse = false, unit = '%' }: { cur: number | null; prev: number | null; inverse?: boolean; unit?: '%' | 'pts' }) {
  if (cur == null || prev == null) return <span className="text-xs text-zinc-500">sin comparación</span>
  let diff: number
  if (unit === 'pts') diff = cur - prev
  else if (prev === 0) return <span className="text-xs text-zinc-500">{cur === 0 ? 'igual que antes' : 'antes: 0'}</span>
  else diff = Math.round(((cur - prev) / prev) * 100)
  if (diff === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
        <Minus className="h-3.5 w-3.5" aria-hidden="true" /> igual que antes
      </span>
    )
  }
  const up = diff > 0
  const good = inverse ? !up : up
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${good ? 'text-emerald-300' : 'text-red-300'}`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {up ? '+' : '−'}
      {Math.abs(diff)}
      {unit === 'pts' ? ' puntos' : '%'}
      <span className="sr-only">{good ? ' (mejor)' : ' (peor)'} que el período anterior</span>
    </span>
  )
}

export function Kpi({ label, value, sub, delta }: { label: string; value: string; sub?: string; delta?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4">
      <p className="text-xs font-medium text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-white sm:text-3xl">{value}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {delta}
        {sub && <span className="text-xs text-zinc-500">{sub}</span>}
      </div>
    </div>
  )
}

export function PlanBars({ rows }: { rows: Dashboard['by_plan'] }) {
  if (!rows.length) return <p className="text-sm text-zinc-500">No hubo cobros en este período.</p>
  const total = rows.reduce((s, r) => s + r.cents, 0) || 1
  const max = Math.max(...rows.map((r) => r.cents), 1)
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.name}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-zinc-200">{r.name}</span>
            <span className="shrink-0 tabular-nums text-white">
              {formatMoney(r.cents)} <span className="text-xs text-zinc-500">· {Math.round((r.cents / total) * 100)}% · {r.payments} {r.payments === 1 ? 'cobro' : 'cobros'}</span>
            </span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-zinc-900" aria-hidden="true">
            <div className="h-2.5 rounded-full bg-[#edcc36]" style={{ width: `${Math.max((r.cents / max) * 100, 2)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function WeekdayBars({ heatmap }: { heatmap: Dashboard['heatmap'] }) {
  const byDay = Array.from({ length: 7 }, (_, i) => heatmap.filter((h) => h.dow === i + 1).reduce((s, h) => s + h.n, 0))
  const max = Math.max(...byDay, 1)
  const total = byDay.reduce((a, b) => a + b, 0)
  if (!total) return <p className="text-sm text-zinc-500">No hubo entradas en este período.</p>
  return (
    <figure>
      <div className="flex h-40 items-end gap-2" role="img" aria-label={`Entradas por día: ${byDay.map((n, i) => `${WEEKDAYS[i]} ${n}`).join(', ')}`}>
        {byDay.map((n, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[11px] tabular-nums text-zinc-400">{n}</span>
            <div className={`w-full rounded-t-md ${n === max ? 'bg-[#edcc36]' : 'bg-[#edcc36]/45'}`} style={{ height: `${Math.max((n / max) * 100, 2)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2" aria-hidden="true">
        {SHORT_DAYS.map((d) => (
          <span key={d} className="flex-1 text-center text-[11px] text-zinc-500">
            {d}
          </span>
        ))}
      </div>
    </figure>
  )
}

/** Mapa de calor 7 × 24 (entradas por día y hora). Muestra solo las horas con movimiento. */
export function Heatmap({ heatmap }: { heatmap: Dashboard['heatmap'] }) {
  if (!heatmap.length) return <p className="text-sm text-zinc-500">No hubo entradas en este período.</p>
  const grid = new Map(heatmap.map((h) => [`${h.dow}-${h.hour}`, h.n]))
  const max = Math.max(...heatmap.map((h) => h.n), 1)
  const hours = heatmap.map((h) => h.hour)
  const from = Math.min(...hours, 7)
  const to = Math.max(...hours, 22)
  const cols = Array.from({ length: to - from + 1 }, (_, i) => from + i)
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-separate border-spacing-[3px] text-[11px]">
        <caption className="sr-only">Entradas por día de la semana y hora</caption>
        <thead>
          <tr>
            <th scope="col" className="w-10" />
            {cols.map((h) => (
              <th key={h} scope="col" className="font-normal text-zinc-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SHORT_DAYS.map((d, i) => (
            <tr key={d}>
              <th scope="row" className="pr-1 text-left font-normal text-zinc-400">
                {d}
              </th>
              {cols.map((h) => {
                const n = grid.get(`${i + 1}-${h}`) ?? 0
                return (
                  <td
                    key={h}
                    title={`${WEEKDAYS[i]} ${h} h: ${n} entradas`}
                    className="h-7 rounded-[4px] text-center tabular-nums text-black/70"
                    style={{ backgroundColor: n ? `rgba(237, 204, 54, ${0.15 + 0.85 * (n / max)})` : 'rgb(24 24 27)' }}
                  >
                    <span className="sr-only">{n}</span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-zinc-500">Más amarillo = más gente. Pasá el dedo o el mouse por un cuadro para ver el número.</p>
    </div>
  )
}

/** Horas pico vs. clases programadas, por franja horaria (todos los días sumados). */
export function PeakVsClasses({ heatmap, slots, days }: { heatmap: Dashboard['heatmap']; slots: Dashboard['class_slots']; days: number }) {
  const entries = new Map<number, number>()
  for (const h of heatmap) entries.set(h.hour, (entries.get(h.hour) ?? 0) + h.n)
  const classes = new Map<number, number>()
  for (const s of slots) classes.set(s.hour, (classes.get(s.hour) ?? 0) + s.classes)
  const hours = [...new Set([...entries.keys(), ...classes.keys()])].sort((a, b) => a - b)
  if (!hours.length) return <p className="text-sm text-zinc-500">Sin entradas ni clases en este período.</p>
  const maxE = Math.max(...entries.values(), 1)
  const maxC = Math.max(...classes.values(), 1)
  const weeks = Math.max(days / 7, 1)

  // Lectura rápida: las 3 horas más concurridas y cuántas clases hay en cada una
  const top = [...entries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  const weak = top.filter(([h]) => (classes.get(h) ?? 0) === 0).map(([h]) => `${h} h`)
  const idle = [...classes.entries()]
    .filter(([h, c]) => c > 0 && (entries.get(h) ?? 0) <= maxE * 0.15)
    .map(([h]) => `${h} h`)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-xs text-zinc-400" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#edcc36]" /> Entradas
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-sky-400" /> Clases programadas
        </span>
      </div>
      <ul className="space-y-1.5">
        {hours.map((h) => {
          const e = entries.get(h) ?? 0
          const c = classes.get(h) ?? 0
          return (
            <li key={h} className="grid grid-cols-[2.5rem_1fr] items-center gap-2 text-xs">
              <span className="tabular-nums text-zinc-400">{h} h</span>
              <span className="space-y-0.5">
                <span className="flex items-center gap-2">
                  <span className="h-2 rounded-full bg-[#edcc36]" style={{ width: `${Math.max((e / maxE) * 85, e ? 1.5 : 0)}%` }} />
                  <span className="tabular-nums text-zinc-300">{e}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2 rounded-full bg-sky-400" style={{ width: `${Math.max((c / maxC) * 85, c ? 1.5 : 0)}%` }} />
                  <span className="tabular-nums text-zinc-500">
                    {c ? `${c} ${c === 1 ? 'clase' : 'clases'} (${(c / weeks).toFixed(1).replace('.', ',')}/sem.)` : 'sin clases'}
                  </span>
                </span>
              </span>
            </li>
          )
        })}
      </ul>
      {(weak.length > 0 || idle.length > 0) && (
        <ul className="space-y-1 rounded-xl border border-zinc-800 p-3 text-sm text-zinc-300">
          {weak.length > 0 && <li>• Horas con más gente y sin clases: <strong className="text-white">{weak.join(', ')}</strong>. Puede valer la pena sumar una clase o un profe en sala.</li>}
          {idle.length > 0 && <li>• Horas con clases y muy poco movimiento: <strong className="text-white">{idle.join(', ')}</strong>.</li>}
        </ul>
      )}
    </div>
  )
}
