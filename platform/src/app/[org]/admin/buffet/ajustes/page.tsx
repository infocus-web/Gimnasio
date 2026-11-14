import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { ExternalLink, Megaphone } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { Card } from '@/features/admin/ui'
import { mpConfigured } from '@/features/payments/mercadopago'
import { buffetDb } from '@/features/buffet/data'
import { saveBuffetSettings } from '@/features/buffet/actions'
import { BuffetSettingsForm, BuffetShareLink } from '@/features/buffet/AdminForms'
import { MissingMigration, NoAccess, isMissingTable } from '@/features/buffet/admin-shared'
import { buffetImageUrl } from '@/features/buffet/types'

export const metadata: Metadata = { title: 'Buffet · Ajustes y publicidad' }

export default async function BuffetSettingsPage({ params }: PageProps<'/[org]/admin/buffet/ajustes'>) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx) return null
  if (!ctx.can('buffet.manage')) return <NoAccess />
  const db = await buffetDb()
  const { data, error } = await db.from('buffet_settings').select('*').eq('org_id', ctx.org.id).maybeSingle()
  if (isMissingTable(error)) return <MissingMigration />
  const s = (data ?? {}) as Record<string, unknown>
  const h = await headers()
  const site = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`
  const publicUrl = `${site}/${slug}/buffet`
  const str = (k: string) => (typeof s[k] === 'string' ? (s[k] as string) : '')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Ajustes y publicidad</h1>
        <p className="text-sm text-zinc-400">Cómo se ve el buffet en la web del gimnasio y en la app, y cómo se toman los pedidos.</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Buffet">
          <BuffetSettingsForm
            action={saveBuffetSettings.bind(null, slug)}
            mpReady={mpConfigured()}
            initial={{
              enabled: s.enabled === true,
              name: str('name') || 'Buffet',
              tagline: str('tagline'),
              description: str('description'),
              pickupText: str('pickup_text'),
              whatsapp: str('whatsapp'),
              orderCutoff: (str('order_cutoff') || '12:00').slice(0, 5),
              daysAhead: typeof s.days_ahead === 'number' ? s.days_ahead : 6,
              acceptOnline: s.accept_online !== false,
              acceptAtPickup: s.accept_at_pickup !== false,
              coverUrl: buffetImageUrl(str('cover_path') || null),
            }}
          />
        </Card>
        <div className="space-y-5">
          <Card title="Dónde se publicita">
            <ul className="space-y-3 text-sm text-zinc-300">
              <li className="flex gap-2"><Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-[#edcc36]" aria-hidden="true" /> En la portada de la web, con el menú de hoy y la carta.</li>
              <li className="flex gap-2"><Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-[#edcc36]" aria-hidden="true" /> En la app del socio, debajo de su QR de acceso (lo ven cada vez que entran al gym).</li>
              <li className="flex gap-2"><Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-[#edcc36]" aria-hidden="true" /> En su propia página para compartir por WhatsApp e Instagram:</li>
            </ul>
            <div className="mt-3 space-y-2">
              <BuffetShareLink url={publicUrl} text={`Mirá el menú del ${str('name') || 'Buffet'} de ${ctx.org.name} y pedí tu vianda:`} />
              <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-[40px] items-center gap-1.5 text-xs font-semibold text-[#edcc36] hover:underline">
                Ver la página <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
            <p className="mt-3 text-xs text-zinc-500">Tip: un plato con foto vende mucho más. Cargá fotos en la Carta.</p>
          </Card>
        </div>
      </div>
    </div>
  )
}
