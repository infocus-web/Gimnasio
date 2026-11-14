import Link from 'next/link'
import type { Route } from 'next'

/** Aviso cuando la base todavía no tiene las tablas del buffet (falta aplicar 0051 y 0052). */
export function MissingMigration() {
  return (
    <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
      Falta activar el buffet en la base de datos (migraciones <code>0051_buffet_role</code> y <code>0052_buffet</code>). Pedíselo a Claude o
      aplicalas desde Supabase.
    </p>
  )
}

export function isMissingTable(error: { code?: string; message?: string } | null) {
  return !!error && (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|Could not find the table/i.test(error.message ?? ''))
}

export function NoAccess() {
  return <p className="text-sm text-zinc-400">No tenés permiso para manejar el buffet.</p>
}

/** Fecha YYYY-MM-DD + n días */
export function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function DayChips({ base, days, current, today, param = 'dia' }: { base: string; days: string[]; current: string; today: string; param?: string }) {
  const label = (d: string) => {
    if (d === today) return 'Hoy'
    if (d === addDays(today, 1)) return 'Mañana'
    if (d === addDays(today, -1)) return 'Ayer'
    const s = new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(`${d}T12:00:00Z`))
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  return (
    <nav aria-label="Día" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {days.map((d) => (
        <Link
          key={d}
          href={`${base}?${param}=${d}` as Route}
          aria-current={d === current ? 'date' : undefined}
          className={`inline-flex min-h-[40px] shrink-0 items-center rounded-full border px-3.5 text-xs font-semibold ${
            d === current ? 'border-[#edcc36] bg-[#edcc36] text-black' : 'border-zinc-700 text-zinc-300 hover:border-[#edcc36]/60'
          }`}
        >
          {label(d)}
        </Link>
      ))}
    </nav>
  )
}
