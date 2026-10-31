import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { Plus, Printer, QrCode, Tv, ChevronRight, ExternalLink } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/features/admin/ui'
import { fmtDateTime } from '@/features/admin/format'
import { ConfirmAction } from '@/features/admin/ConfirmAction'
import { MachineForm, TvLinkPanel, TvSettingsForm } from '@/features/floor/MachineForms'
import { InfoTip } from '@/components/InfoTip'
import { linkTv, saveMachine, saveTvSettings, unlinkTv } from '@/features/floor/actions'

export const metadata: Metadata = { title: 'Máquinas' }

export default async function MachinesPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx) return null // sin sesión de staff: el layout ya muestra el aviso
  const canFloor = ctx.staff.role === 'trainer' || ctx.can('training.manage_all')
  const canTv = ctx.can('training.manage_all') || ctx.can('org.manage')
  if (!canFloor && !canTv) {
    return <p className="text-sm text-zinc-400">Esta sección es para profesores y administración.</p>
  }

  const supabase = await createClient()
  const [{ data: machines, error }, { data: exercises }, tv] = await Promise.all([
    supabase
      .from('machines')
      .select('id, name, area, code, active, machine_exercises(exercise_id)')
      .eq('org_id', ctx.org.id)
      .order('active', { ascending: false })
      .order('name'),
    supabase.from('exercises').select('id, name, muscle_group, video_url').or(`org_id.eq.${ctx.org.id},org_id.is.null`).order('name'),
    canTv ? supabase.rpc('floor_tv_settings', { p_org: ctx.org.id }) : Promise.resolve({ data: null }),
  ])
  const tvSettings = (tv.data ?? null) as { linked: boolean; seen_at: string | null; ranking_enabled: boolean; message: string | null } | null
  const base = `/${slug}/admin/maquinas`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Máquinas</h1>
          <p className="text-sm text-zinc-400">Cada máquina lleva un cartel con QR: el socio lo escanea y ve cómo se usa y su último peso.</p>
        </div>
        {canFloor && (machines?.some((m) => m.active) ?? false) && (
          <span className="flex items-center gap-1.5">
          <Link
            href={`/${slug}/maquina/carteles` as Route}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-semibold text-zinc-200 hover:border-[#edcc36]/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
          >
            <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir todos los carteles
          </Link>
          <InfoTip label="Imprimir todos los carteles">
            <p>Abre una página lista para imprimir con el cartel de <strong>cada máquina activa</strong>: nombre y código QR.</p>
            <p>Pegá cada cartel en su máquina. El socio lo escanea con el celular y ve cómo se usa y el último peso que levantó.</p>
          </InfoTip>
          </span>
        )}
      </div>

      {canFloor && (
        <>
          <details className="rounded-2xl border border-dashed border-zinc-700 p-4 open:border-solid open:border-[#edcc36]/40">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 text-sm font-bold text-[#edcc36]">
              <Plus className="h-4 w-4" aria-hidden="true" /> Nueva máquina
            </summary>
            <div className="mt-4">
              <MachineForm action={saveMachine.bind(null, slug, null)} exercises={exercises ?? []} submitLabel="Crear máquina" />
            </div>
          </details>

          {error ? (
            <p role="alert" className="text-sm text-red-300">No pudimos cargar las máquinas. Recargá la página.</p>
          ) : machines?.length ? (
            <ul className="grid gap-3 md:grid-cols-2">
              {machines.map((m) => {
                const n = (m.machine_exercises as unknown as { exercise_id: string }[] | null)?.length ?? 0
                return (
                  <li key={m.id} className={`rounded-2xl border bg-zinc-950 p-4 ${m.active ? 'border-zinc-800/80' : 'border-zinc-900 opacity-60'}`}>
                    <Link href={`${base}/${m.id}` as Route} className="flex items-start gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]">
                      <QrCode className="mt-0.5 h-5 w-5 shrink-0 text-[#edcc36]" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-white">{m.name}</span>
                        <span className="block text-xs text-zinc-500">
                          {[m.area, `${n} ${n === 1 ? 'ejercicio' : 'ejercicios'}`, !m.active && 'fuera de uso'].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <ChevronRight className="h-5 w-5 text-zinc-600" aria-hidden="true" />
                    </Link>
                    {m.active && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link
                          href={`/${slug}/maquina/carteles?id=${m.id}` as Route}
                          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-800 px-3 text-xs font-semibold text-zinc-300 hover:border-[#edcc36]/60 hover:text-white"
                        >
                          <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir QR
                        </Link>
                        <a
                          href={`/${slug}/maquina/${m.code}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-800 px-3 text-xs font-semibold text-zinc-300 hover:border-[#edcc36]/60 hover:text-white"
                        >
                          <ExternalLink className="h-4 w-4" aria-hidden="true" /> Ver lo que ve el socio
                        </a>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4 text-sm text-zinc-400">
              Todavía no cargaste máquinas. Creá la primera arriba, asociale sus ejercicios y después imprimí el cartel con el QR.
            </p>
          )}
        </>
      )}

      {canTv && tvSettings && (
        <Card
          title="Pantalla de TV de la sala"
          action={
            tvSettings.linked ? (
              <ConfirmAction action={unlinkTv.bind(null, slug)} confirmText="El televisor deja de mostrar la pantalla." yesLabel="Sí, desvincular" variant="link">
                Desvincular
              </ConfirmAction>
            ) : undefined
          }
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm text-zinc-300">
                <Tv className="h-4 w-4 text-[#edcc36]" aria-hidden="true" /> Muestra la hora, cuánta gente hay, las clases que siguen hoy, el ranking del mes,
                los cumpleaños y tu mensaje. Va rotando sola cada 15 segundos.
              </p>
              <TvLinkPanel
                slug={slug}
                linked={tvSettings.linked}
                seenAt={tvSettings.seen_at}
                seenLabel={tvSettings.seen_at ? fmtDateTime(tvSettings.seen_at, ctx.org.timezone) : null}
                action={linkTv.bind(null, slug)}
              />
            </div>
            <TvSettingsForm action={saveTvSettings.bind(null, slug)} ranking={tvSettings.ranking_enabled} message={tvSettings.message} />
          </div>
        </Card>
      )}
    </div>
  )
}
