'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const INK_MUTED = '#71717a'
const GRID = '#27272a'
const BRAND = '#edcc36'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`

export function MonthlyBars({
  data,
  valueKey,
  title,
  money,
  color = BRAND,
}: {
  data: Record<string, number | string>[]
  valueKey: string
  title: string
  money?: boolean
  color?: string
}) {
  const fmt = (v: number) =>
    money
      ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0, notation: v >= 1e6 ? 'compact' : 'standard' }).format(v / 100)
      : new Intl.NumberFormat('es-AR').format(v)
  const rows = data.map((d) => ({ month: monthLabel(String(d.month)), value: Number(d[valueKey] ?? 0) }))
  const last = rows.at(-1)

  return (
    <figure className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4">
      <figcaption className="mb-3 flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-zinc-200">{title}</span>
        {last && (
          <span className="text-xs text-zinc-500">
            {last.month}: <strong className="text-sm tabular-nums text-white">{fmt(last.value)}</strong>
          </span>
        )}
      </figcaption>
      <div className="h-48" role="img" aria-label={`${title}. ${rows.map((r) => `${r.month}: ${fmt(r.value)}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap={6}>
            <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="2 4" />
            <XAxis dataKey="month" tick={{ fill: INK_MUTED, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" />
            <YAxis tick={{ fill: INK_MUTED, fontSize: 11 }} tickLine={false} axisLine={false} width={money ? 64 : 32} tickFormatter={(v) => fmt(Number(v))} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 10, fontSize: 12 }}
              labelStyle={{ color: '#a1a1aa' }}
              itemStyle={{ color: '#fafafa', fontWeight: 700 }}
              formatter={(v) => [fmt(Number(v)), title]}
            />
            <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-zinc-500">Ver tabla</summary>
        <table className="mt-2 w-full text-xs">
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className="border-t border-zinc-900">
                <td className="py-1 text-zinc-400">{r.month}</td>
                <td className="py-1 text-right tabular-nums text-zinc-200">{fmt(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/** Entradas por día y hora: una sola tonalidad, de claro (pocas) a intenso (muchas) */
export function CheckinHeatmap({ cells }: { cells: { dow: number; hour: number; n: number }[] }) {
  const hours = cells.length ? [...new Set(cells.map((c) => c.hour))].sort((a, b) => a - b) : []
  const from = hours[0] ?? 7
  const to = hours.at(-1) ?? 22
  const range = Array.from({ length: to - from + 1 }, (_, i) => from + i)
  const max = Math.max(1, ...cells.map((c) => c.n))
  const get = (d: number, h: number) => cells.find((c) => c.dow === d && c.hour === h)?.n ?? 0

  if (!cells.length) return <p className="text-sm text-zinc-500">Todavía no hay entradas registradas para armar el mapa.</p>
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-[2px] text-[10px]">
        <thead>
          <tr>
            <th scope="col" className="sr-only">Día</th>
            {range.map((h) => (
              <th key={h} scope="col" className="w-7 font-normal text-zinc-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((d, i) => (
            <tr key={d}>
              <th scope="row" className="pr-2 text-left font-normal text-zinc-400">
                {d}
              </th>
              {range.map((h) => {
                const n = get(i + 1, h)
                const t = n / max
                return (
                  <td
                    key={h}
                    title={`${d} ${h}:00 — ${n} entradas`}
                    aria-label={`${d} ${h} horas: ${n} entradas`}
                    className="h-7 w-7 rounded-[4px]"
                    style={{ background: n ? `rgba(237, 204, 54, ${0.12 + 0.88 * t})` : '#18181b' }}
                  />
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
        Menos <span className="h-3 w-3 rounded-sm" style={{ background: 'rgba(237,204,54,0.15)' }} />
        <span className="h-3 w-3 rounded-sm" style={{ background: 'rgba(237,204,54,0.55)' }} />
        <span className="h-3 w-3 rounded-sm" style={{ background: '#edcc36' }} /> Más · últimas 8 semanas (pasá el mouse para ver el número)
      </p>
    </div>
  )
}
