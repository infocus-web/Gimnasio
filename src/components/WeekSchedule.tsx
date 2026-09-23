import type { Activity, ScheduleSlot } from '../lib/types'
import { WEEKDAYS, WEEKDAYS_SHORT, fmtTime } from '../lib/format'
import { cx } from './ui'

/** Grilla semanal de actividades (lunes a domingo). En celular se muestra como lista por día. */
export function WeekSchedule({
  activities,
  slots,
  dark,
  onSlotClick,
}: {
  activities: Activity[]
  slots: ScheduleSlot[]
  dark?: boolean
  onSlotClick?: (s: ScheduleSlot) => void
}) {
  const byId = Object.fromEntries(activities.map((a) => [a.id, a]))
  const visible = slots.filter((s) => byId[s.activity_id]).sort((a, b) => a.start_time.localeCompare(b.start_time))
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => d <= 6 || visible.some((s) => s.weekday === 7))

  if (visible.length === 0) return <p className={cx('text-sm', dark ? 'text-zinc-500' : 'text-zinc-400')}>Todavía no hay horarios cargados.</p>

  const chip = (s: ScheduleSlot) => {
    const a = byId[s.activity_id]
    return (
      <button
        key={s.id}
        type="button"
        onClick={() => onSlotClick?.(s)}
        disabled={!onSlotClick}
        className={cx(
          'w-full border-l-4 px-2.5 py-1.5 text-left transition',
          dark ? 'rounded-none' : 'rounded-lg',
          dark ? 'bg-zinc-900' : 'bg-white shadow-sm ring-1 ring-zinc-200',
          onSlotClick && 'hover:ring-zinc-400',
        )}
        style={{ borderLeftColor: a.color ?? '#edcc36' }}
      >
        <p className={cx('text-[11px] tabular-nums', dark ? 'text-zinc-400' : 'text-zinc-500')}>
          {fmtTime(s.start_time)}–{fmtTime(s.end_time)}
        </p>
        <p className={cx('text-sm font-semibold leading-tight', dark ? 'text-white' : 'text-zinc-900')}>{a.name}</p>
        {s.room && <p className={cx('text-[11px]', dark ? 'text-zinc-500' : 'text-zinc-400')}>{s.room}</p>}
      </button>
    )
  }

  return (
    <>
      {/* escritorio: grilla */}
      <div className="hidden gap-2 md:grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((d) => (
          <div key={d}>
            <p className={cx('mb-2 text-center text-xs font-bold uppercase tracking-wider', dark ? 'text-zinc-400' : 'text-zinc-500')}>{WEEKDAYS_SHORT[d]}</p>
            <div className="space-y-1.5">{visible.filter((s) => s.weekday === d).map(chip)}</div>
          </div>
        ))}
      </div>
      {/* celular: lista */}
      <div className="space-y-4 md:hidden">
        {days
          .filter((d) => visible.some((s) => s.weekday === d))
          .map((d) => (
            <div key={d}>
              <p className={cx('mb-1.5 text-xs font-bold uppercase tracking-wider', dark ? 'text-zinc-400' : 'text-zinc-500')}>{WEEKDAYS[d]}</p>
              <div className="grid grid-cols-2 gap-1.5">{visible.filter((s) => s.weekday === d).map(chip)}</div>
            </div>
          ))}
      </div>
    </>
  )
}
