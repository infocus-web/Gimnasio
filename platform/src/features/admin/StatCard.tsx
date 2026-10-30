import Link from 'next/link'
import type { Route } from 'next'
import type { LucideIcon } from 'lucide-react'
import { ArrowRight } from 'lucide-react'
import { STAT_TONES, type StatTone } from './stat-tones'

/**
 * Tarjeta de métrica estilo W3Admin: fondo pastel, número grande y,
 * opcionalmente, una barra de progreso rayada (0–100).
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  href,
  tone,
  note,
  progress,
}: {
  label: string
  value: React.ReactNode
  icon: LucideIcon
  href: string
  tone: StatTone
  note?: string
  progress?: number
}) {
  return (
    <Link
      href={href as Route}
      className={`group relative flex min-h-[148px] flex-col overflow-hidden rounded-2xl p-4 text-black transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:p-5 ${STAT_TONES[tone]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-black/75">{label}</p>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/60">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 text-4xl font-bold tabular-nums tracking-[-0.03em]">{value}</p>
      {progress !== undefined ? (
        <div className="mt-auto pt-3">
          {note && <p className="mb-1.5 text-xs font-medium text-black/70">{note}</p>}
          <div
            className="h-2.5 overflow-hidden rounded-full border border-black/70 bg-white/50"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={label}
          >
            <div className="w3-hatch h-full rounded-full bg-black/20" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
          </div>
        </div>
      ) : (
        <p className="mt-auto flex items-center gap-1 pt-3 text-xs font-semibold text-black/70">
          {note ?? 'Ver detalle'} <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </p>
      )}
    </Link>
  )
}
