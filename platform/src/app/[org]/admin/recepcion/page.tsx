import type { Metadata } from 'next'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { OpenTurnstileButton } from '@/features/admin/AccessForms'
import { openTurnstile } from '@/features/admin/access-actions'
import { ReceptionScreen } from './ReceptionScreen'

export const metadata: Metadata = { title: 'Recepción' }

export default async function RecepcionPage({ params }: PageProps<'/[org]/admin/recepcion'>) {
  const { org: slug } = await params
  const ctx = (await getAdminContext(slug))!

  if (!ctx.can('checkins.manage') || !ctx.org.locationId) {
    return <p className="text-sm text-zinc-400">Tu rol no tiene acceso a la recepción.</p>
  }

  // Molinetes con intermediario: botón para abrir a mano
  const supabase = await createClient()
  const { data: turnstiles } = await supabase
    .from('access_devices')
    .select('id, name, info')
    .eq('org_id', ctx.org.id)
    .eq('active', true)
    .order('created_at')
  const openers = (turnstiles ?? []).filter((d) => (d.info as { agent_token_at?: string } | null)?.agent_token_at)

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
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
      <ReceptionScreen orgId={ctx.org.id} locationId={ctx.org.locationId} />
    </div>
  )
}
