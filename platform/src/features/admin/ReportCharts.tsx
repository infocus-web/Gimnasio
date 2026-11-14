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
