'use client'

import { Volume2, VolumeX } from 'lucide-react'
import { BEEP_OPTIONS } from '@/features/screens/board'

/**
 * Sonido del temporizador en la TV: prender/apagar y desde cuántos segundos antes del final
 * empiezan los pitidos de cuenta (3, 2, 1…). Se usa en el editor de pizarras y en el temporizador rápido.
 */
export function TimerSoundFields({
  sound,
  beepS,
  onSound,
  onBeepS,
  idPrefix,
}: {
  sound: boolean
  beepS: number
  onSound: (v: boolean) => void
  onBeepS: (v: number) => void
  idPrefix: string
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={sound}
        onClick={() => onSound(!sound)}
        className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-4 text-sm font-semibold ${
          sound ? 'border-[#edcc36] bg-[#edcc36]/10 text-white' : 'border-zinc-700 text-zinc-400'
        }`}
      >
        {sound ? <Volume2 className="h-4 w-4 text-[#edcc36]" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
        {sound ? 'Sonido: sí' : 'Sonido: no'}
      </button>
      {sound && (
        <label htmlFor={`${idPrefix}-beep`} className="space-y-1">
          <span className="block text-xs text-zinc-400">Cuenta con pitidos</span>
          <select
            id={`${idPrefix}-beep`}
            value={beepS}
            onChange={(e) => onBeepS(Number(e.target.value))}
            className="min-h-[44px] rounded-xl border border-zinc-700 bg-black px-3 text-sm text-white"
          >
            {BEEP_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? 'No (solo al cambiar)' : `Últimos ${n} segundos`}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
