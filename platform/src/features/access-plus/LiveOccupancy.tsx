'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { RefreshCw, UserPlus, Users } from 'lucide-react'
import { useMember } from '@/features/member/MemberProvider'
import { OCCUPANCY, type Occupancy } from './labels'

const EVERY_MS = 60_000

/** Concurrencia en vivo (app del socio, arriba de Horarios). Se actualiza cada minuto. Sin nombres. */
export function LiveOccupancy() {
  const { supabase, org } = useMember()
  const [occ, setOcc] = useState<Occupancy | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('gym_occupancy', { p_org: org.id }).abortSignal(AbortSignal.timeout(8000))
      if (error || !data) throw new Error('occupancy')
      setOcc(data as unknown as Occupancy)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [supabase, org.id])

  useEffect(() => {
    void load()
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, EVERY_MS)
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  const lvl = occ ? OCCUPANCY[occ.level] : null
  const pct = occ ? Math.min(100, Math.round((occ.people / Math.max(1, occ.capacity)) * 100)) : 0

  return (
    <section aria-label="Concurrencia en este momento" className="mb-4 space-y-3">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
          <Users className="h-4 w-4 text-[#edcc36]" aria-hidden="true" /> Ahora en el gimnasio
        </p>
        {loading && !occ ? (
          <div className="mt-3 h-10 w-48 animate-pulse rounded-lg bg-zinc-900" aria-hidden="true" />
        ) : occ && lvl ? (
          <>
            <p className="mt-2 text-3xl font-extrabold text-white" aria-live="polite">
              {occ.level === 'closed' ? (
                <span className="text-zinc-400">Cerrado</span>
              ) : (
                <>
                  {occ.people} {occ.people === 1 ? 'persona' : 'personas'} <span className="text-zinc-600">·</span>{' '}
                  <span className={lvl.className}>{lvl.label}</span>
                </>
              )}
            </p>
            {occ.level !== 'closed' && (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-900" aria-hidden="true">
                <div className={`h-full rounded-full ${lvl.dot} transition-[width] duration-700`} style={{ width: `${Math.max(4, pct)}%` }} />
              </div>
            )}
            <p className="mt-2 text-xs text-zinc-500">
              Estimado según las entradas de los últimos {occ.window_minutes} minutos. Se actualiza solo cada minuto.
            </p>
          </>
        ) : null}
        {error && (
          <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-sm text-red-200">
            No pudimos obtener el dato en vivo.
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-zinc-700 px-3 text-xs font-semibold text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Reintentar
            </button>
          </div>
        )}
      </div>
      <Link
        href={`/${org.slug}/app/invitados` as Route}
        className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-[#edcc36]/30 bg-[#edcc36]/5 px-4 text-sm text-zinc-200 hover:bg-[#edcc36]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
      >
        <UserPlus className="h-5 w-5 shrink-0 text-[#edcc36]" aria-hidden="true" />
        <span>
          <strong className="text-white">¿Venís con alguien?</strong> Invitá a un amigo a entrenar.
        </span>
      </Link>
    </section>
  )
}
