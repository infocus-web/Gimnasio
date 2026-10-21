import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { CalendarClock, Cake, FileWarning } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { OpenTurnstileButton } from '@/features/admin/AccessForms'
import { openTurnstile } from '@/features/admin/access-actions'
import { todayYMD } from '@/features/admin/format'
import { ReceptionScreen } from './ReceptionScreen'

export const metadata: Metadata = { title: 'Recepción' }

export default async function RecepcionPage({ params }: PageProps<'/[org]/admin/recepcion'>) {
  const { org: slug } = await params
  const ctx = (await getAdminContext(slug))!

  if (!ctx.can('checkins.manage') || !ctx.org.locationId) {
    return <p className="text-sm text-zinc-400">Tu rol no tiene acceso a la recepción.</p>
  }

  const supabase = await createClient()
  const today = todayYMD(ctx.org.timezone)
  const now = new Date()
  const in7 = new Date(now.getTime() + 7 * 86_400_000)

  const [{ data: turnstiles }, { data: expiring }, { data: births }, { count: noCert }] = await Promise.all([
    // Molinetes con intermediario: botón para abrir a mano
    supabase.from('access_devices').select('id, name, info').eq('org_id', ctx.org.id).eq('active', true).order('created_at'),
    // Planes que vencen en los próximos 7 días
    supabase
      .from('member_directory')
      .select('id, first_name, last_name, current_period_end')
      .eq('org_id', ctx.org.id)
      .eq('status', 'active')
      .gte('current_period_end', now.toISOString())
      .lte('current_period_end', in7.toISOString())
      .order('current_period_end')
      .limit(30),
    // Cumpleaños de hoy (se filtra el día abajo: la base no compara mes/día directo)
    supabase.from('members').select('id, first_name, last_name, birth_date').eq('org_id', ctx.org.id).eq('status', 'active').not('birth_date', 'is', null),
    // Socios activos sin apto físico
    supabase
      .from('member_directory')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', ctx.org.id)
      .eq('status', 'active')
      .eq('has_medical_cert', false),
  ])
  const openers = (turnstiles ?? []).filter((d) => (d.info as { agent_token_at?: string } | null)?.agent_token_at)
  const md = today.slice(5)
  const birthdays = (births ?? []).filter((b) => b.birth_date?.slice(5) === md)
  const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000))

  const alerts = (
    <div className="space-y-3">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
          <CalendarClock className="h-4 w-4 text-[#edcc36]" aria-hidden="true" /> Vencen esta semana
          <span className="ml-auto rounded-md bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300">{expiring?.length ?? 0}</span>
        </h2>
        {expiring?.length ? (
          <ul className="space-y-1 text-sm">
            {expiring.slice(0, 8).map((m) => (
              <li key={m.id}>
                <Link href={`/${slug}/admin/socios/${m.id}` as Route} className="flex justify-between gap-2 rounded-lg px-1 py-1 hover:bg-zinc-900">
                  <span className="truncate text-zinc-200">
                    {m.first_name} {m.last_name}
                  </span>
                  <span className="shrink-0 text-xs text-amber-300">
                    {daysLeft(m.current_period_end!) === 0 ? 'hoy' : `en ${daysLeft(m.current_period_end!)} d`}
                  </span>
                </Link>
              </li>
            ))}
            {expiring.length > 8 && (
              <li>
                <Link href={`/${slug}/admin/socios?estado=por_vencer` as Route} className="px-1 text-xs text-[#edcc36] hover:underline">
                  Ver los {expiring.length}
                </Link>
              </li>
            )}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">Nadie vence en los próximos 7 días.</p>
        )}
      </section>

      {birthdays.length > 0 && (
        <section className="rounded-2xl border border-[#edcc36]/30 bg-[#edcc36]/5 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
            <Cake className="h-4 w-4 text-[#edcc36]" aria-hidden="true" /> Cumpleaños de hoy
          </h2>
          <ul className="space-y-1 text-sm">
            {birthdays.map((b) => (
              <li key={b.id}>
                <Link href={`/${slug}/admin/socios/${b.id}` as Route} className="block rounded-lg px-1 py-1 text-zinc-200 hover:bg-zinc-900">
                  🎂 {b.first_name} {b.last_name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(noCert ?? 0) > 0 && (
        <Link
          href={`/${slug}/admin/socios` as Route}
          className="flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-100 hover:bg-amber-500/10"
        >
          <FileWarning className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
          {noCert} {noCert === 1 ? 'socio activo no tiene' : 'socios activos no tienen'} apto físico cargado.
        </Link>
      )}
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Recepción</h1>
          <p className="text-sm text-zinc-400">Escaneá el QR del socio o buscalo por nombre, DNI o N° de socio.</p>
        </div>
        {openers.length > 0 && (
          <div className="flex flex-wrap items-start gap-3">
            {openers.map((d) => (
              <OpenTurnstileButton
                key={d.id}
                action={openTurnstile.bind(null, slug, d.id)}
                label={openers.length > 1 ? `Abrir ${d.name}` : 'Abrir molinete'}
              />
            ))}
          </div>
        )}
      </div>
      <ReceptionScreen
        slug={slug}
        orgId={ctx.org.id}
        locationId={ctx.org.locationId}
        timezone={ctx.org.timezone}
        canBill={ctx.can('billing.write')}
        alerts={alerts}
      />
    </div>
  )
}
