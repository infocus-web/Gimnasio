import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata, Route } from 'next'
import { ArrowLeft, Printer, ExternalLink, CheckCircle2 } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/features/admin/ui'
import { MachineForm } from '@/features/floor/MachineForms'
import { saveMachine } from '@/features/floor/actions'
import { machineUrl } from '@/features/floor/qr'

export const metadata: Metadata = { title: 'Máquina' }

export default async function MachinePage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; machineId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { org: slug, machineId } = await params
  const isNew = (await searchParams).nueva === '1'
  const ctx = await getAdminContext(slug)
  if (!ctx) return null
  if (ctx.staff.role !== 'trainer' && !ctx.can('training.manage_all')) {
    return <p className="text-sm text-zinc-400">Esta sección es para profesores.</p>
  }
  if (!/^[0-9a-f-]{36}$/.test(machineId)) notFound()
  const supabase = await createClient()
  const [{ data: machine }, { data: exercises }] = await Promise.all([
    supabase
      .from('machines')
      .select('id, name, area, photo_url, code, active, machine_exercises(exercise_id, position)')
      .eq('id', machineId)
      .eq('org_id', ctx.org.id)
      .maybeSingle(),
    supabase.from('exercises').select('id, name, muscle_group, video_url').or(`org_id.eq.${ctx.org.id},org_id.is.null`).order('name'),
  ])
  if (!machine) notFound()
  const links = ((machine.machine_exercises ?? []) as unknown as { exercise_id: string; position: number }[]).sort((a, b) => a.position - b.position)
  const url = await machineUrl(slug, machine.code)

  return (
    <div className="space-y-5">
      <Link href={`/${slug}/admin/maquinas` as Route} className="inline-flex min-h-[44px] items-center gap-1 text-sm text-zinc-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Máquinas
      </Link>
      <h1 className="text-2xl font-extrabold text-white">{machine.name}</h1>

      {isNew && (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Máquina creada. Ahora imprimí su cartel y pegalo en un lugar visible.
        </p>
      )}

      <Card title="Cartel con QR">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/${slug}/maquina/carteles?id=${machine.id}` as Route}
            className="btn-tac inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#edcc36] px-5 text-sm font-bold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir QR
          </Link>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-semibold text-zinc-200 hover:border-[#edcc36]/60"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" /> Ver lo que ve el socio
          </a>
        </div>
        <p className="mt-3 break-all font-mono text-xs text-zinc-500">{url}</p>
      </Card>

      <Card title="Datos y ejercicios">
        <MachineForm
          action={saveMachine.bind(null, slug, machine.id)}
          exercises={exercises ?? []}
          values={{ name: machine.name, area: machine.area, photo_url: machine.photo_url, active: machine.active, exerciseIds: links.map((l) => l.exercise_id) }}
          submitLabel="Guardar cambios"
        />
      </Card>
    </div>
  )
}
