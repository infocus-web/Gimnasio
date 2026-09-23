import { cx } from './ui'

/** Gráfico de barras simple de una sola serie, con tooltip al pasar el mouse. */
export function BarChart({
  data,
  height = 140,
  highlightLast,
  valueLabel = (n) => String(n),
}: {
  data: { label: string; short: string; value: number }[]
  height?: number
  highlightLast?: boolean
  valueLabel?: (n: number) => string
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div>
      <div className="relative flex items-end gap-0.5" style={{ height }} role="img" aria-label="Gráfico de barras">
        {/* líneas guía */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          {[0, 1, 2].map((i) => (
            <div key={i} className="border-t border-dashed border-zinc-100" />
          ))}
        </div>
        {data.map((d, i) => {
          const h = (d.value / max) * 100
          const last = highlightLast && i === data.length - 1
          return (
            <div key={i} className="group relative flex h-full flex-1 items-end justify-center">
              <div
                className={cx('w-full max-w-7 rounded-t transition', last ? 'bg-brand-500' : 'bg-brand-400/70 group-hover:bg-brand-500')}
                style={{ height: `${Math.max(h, d.value > 0 ? 3 : 0)}%` }}
              />
              <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-xs text-white shadow group-hover:block">
                {d.label}: <b>{valueLabel(d.value)}</b>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex gap-0.5">
        {data.map((d, i) => (
          <div key={i} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[10px] text-zinc-400">
            {d.short}
          </div>
        ))}
      </div>
    </div>
  )
}
