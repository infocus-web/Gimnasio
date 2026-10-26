import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { Dumbbell, PlayCircle, Trophy, History, CalendarCheck, LogIn, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { fmtKg } from '@/components/workout/format'
import type { MachineExerciseView, MachineSet, MachineViewResult } from '@/features/floor/types'

export const metadata: Metadata = { title: 'Máquina', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const TZ = 'America/Argentina/Buenos_Aires'

function fmtDay(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  return new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: 'numeric', month: 'short' }).format(new Date(iso))
}

function fmtSets(sets: MachineSet[] | null) {
  if (!sets?.length) return '—'
  return sets.map((s) => `${s.weight_kg != null ? `${fmtKg(Number(s.weight_kg))} kg` : 'PC'} × ${s.reps ?? '–'}`).join(' · ')
}

/** Página del QR de cada máquina. Sin sesión: cómo se usa. Con sesión de socio: además, sus números. */
export default async function MachineQrPage({ params }: { params: Promise<{ org: string; code: string }> }) {
  const { org: slug, code } = await params
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('machine_view', { p_slug: slug, p_code: code })
  const view = (data ?? { status: 'not_found' }) as unknown as MachineViewResult

  if (error || view.status !== 'ok' || !view.machine) {
    return (
      <main className="grid min-h-dvh place-items-center bg-black p-6 text-center">
        <div className="max-w-sm space-y-3">
          <Dumbbell className="mx-auto h-10 w-10 text-zinc-700" aria-hidden="true" />
          <h1 className="text-xl font-bold text-white">{error ? 'No pudimos cargar la máquina' : 'Máquina no encontrada'}</h1>
          <p className="text-sm text-zinc-400">
            {error ? 'Revisá tu conexión y volvé a escanear el código.' : 'Este código no corresponde a una máquina en uso. Avisale al profe.'}
          </p>
        </div>
      </main>
    )
  }

  const { machine, exercises = [], member } = view
  const here = `/${slug}/maquina/${code}`
  const inToday = exercises.some((e) => e.in_routine?.is_today)

  return (
    <main className="mx-auto min-h-dvh max-w-lg bg-black px-4 pb-28 pt-6">
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#edcc36]">{view.gym}</p>
      <h1 className="mt-1 text-3xl font-black text-white">{machine.name}</h1>
      {machine.area && <p className="text-sm text-zinc-400">{machine.area}</p>}
      {machine.photo_url && (
        // eslint-disable-next-line @next/next/no-img-element -- foto externa cargada por el gimnasio
        <img src={machine.photo_url} alt={`Foto de ${machine.name}`} className="mt-4 aspect-video w-full rounded-2xl object-cover" />
      )}

      {member ? (
        <p className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300">
          Hola, <strong className="text-white">{member.first_name}</strong>.{' '}
          {inToday
            ? 'Esta máquina está en tu rutina de hoy.'
            : member.has_program
              ? 'Acá tenés tus últimos registros en esta máquina.'
              : 'Todavía no tenés una rutina asignada: pedísela a tu profe.'}
        </p>
      ) : view.signed_in ? (
        <p className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-400">
          Esta cuenta no es socia de este gimnasio, por eso no vemos tus registros.
        </p>
      ) : null}

      <ul className="mt-5 space-y-4">
        {exercises.length === 0 && (
          <li className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">El gimnasio todavía no cargó los ejercicios de esta máquina.</li>
        )}
        {exercises.map((e) => (
          <ExerciseCard key={e.id} e={e} signedMember={!!member} />
        ))}
      </ul>

      <div className="fixed inset-x-0 bottom-0 border-t border-zinc-900 bg-black/95 p-4 backdrop-blur">
        <div className="mx-auto max-w-lg">
          {member ? (
            <Link
              href={`/${slug}/app/entrenar` as Route}
              className="btn-tac flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#edcc36] text-base font-extrabold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Empezar a entrenar <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
          ) : !view.signed_in ? (
            <Link
              href={`/login?next=${encodeURIComponent(here)}` as Route}
              className="btn-tac flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#edcc36] text-base font-extrabold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <LogIn className="h-5 w-5" aria-hidden="true" /> Ingresá para ver tu último peso
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  )
}

function ExerciseCard({ e, signedMember }: { e: MachineExerciseView; signedMember: boolean }) {
  const r = e.in_routine
  return (
    <li className={`rounded-2xl border bg-zinc-950 p-4 ${r?.is_today ? 'border-[#edcc36]/60' : 'border-zinc-800'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-white">{e.name}</h2>
          {e.muscle_group && <p className="text-xs text-zinc-500">{e.muscle_group}</p>}
        </div>
        {e.video_url && (
          <a
            href={e.video_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl border border-zinc-700 px-3 text-sm font-semibold text-[#edcc36] hover:border-[#edcc36]/60"
          >
            <PlayCircle className="h-5 w-5" aria-hidden="true" /> Ver video
          </a>
        )}
      </div>
      {e.instructions && <p className="mt-2 whitespace-pre-line text-sm text-zinc-300">{e.instructions}</p>}

      {signedMember && (
        <dl className="mt-3 space-y-2 text-sm">
          {r && (
            <div className="flex items-start gap-2 rounded-xl bg-[#edcc36]/10 p-2.5 text-[#f5e38a]">
              <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <dt className="font-semibold">{r.is_today ? 'En tu rutina de hoy' : `En tu rutina · ${r.day_name}`}</dt>
                <dd className="text-white">
                  {r.target_sets ?? 3} series × {r.target_reps ?? '10'}
                  {r.target_weight_kg ? ` · ${fmtKg(Number(r.target_weight_kg))} kg` : ''}
                  {r.rest_seconds ? ` · pausa ${r.rest_seconds} s` : ''}
                  {r.notes ? ` · ${r.notes}` : ''}
                </dd>
              </div>
            </div>
          )}
          <div className="flex items-start gap-2">
            <History className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
            <div>
              <dt className="text-zinc-400">Última vez{e.last ? ` (${fmtDay(e.last.performed_at)})` : ''}</dt>
              <dd className="font-semibold text-white">{e.last ? fmtSets(e.last.sets) : 'Todavía no lo registraste'}</dd>
            </div>
          </div>
          {e.best && (
            <div className="flex items-start gap-2">
              <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-[#edcc36]" aria-hidden="true" />
              <div>
                <dt className="text-zinc-400">Tu mejor marca</dt>
                <dd className="font-semibold text-white">
                  {fmtKg(Number(e.best.weight_kg))} kg × {e.best.reps ?? '–'} <span className="font-normal text-zinc-500">({fmtDay(e.best.performed_at)})</span>
                </dd>
              </div>
            </div>
          )}
        </dl>
      )}
    </li>
  )
}
