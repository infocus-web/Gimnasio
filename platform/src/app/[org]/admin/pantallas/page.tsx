import type { Metadata } from 'next'
import { Tv } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/features/admin/ui'
import { fmtDateTime } from '@/features/admin/format'
import { ConfirmAction } from '@/features/admin/ConfirmAction'
import { KioskSlidesManager } from '@/features/admin/KioskSlidesManager'
import { kioskSlideUrl } from '@/features/admin/kiosk-slides'
import { addKioskSlide, deleteKioskSlide, moveKioskSlide, toggleKioskSlide, updateKioskSlide } from '@/features/admin/kiosk-slide-actions'
import { isPromoOrientation, isPromoPosition, isPromoStyle } from '@/features/screens/promo'
import { TvCodeForm, TvLinkPanel, TvSettingsForm } from '@/features/floor/MachineForms'
import { claimTvCode, linkTv, saveTvSettings, unlinkTv } from '@/features/floor/actions'

export const metadata: Metadata = { title: 'Pantallas' }

/**
 * Pantallas del gimnasio:
 *  - Publicidad: imágenes que pasan la tablet del molinete (cuando nadie la usa) y los televisores.
 *  - TV de la sala: vincular el televisor y elegir qué muestra.
 */
export default async function ScreensPage({ params }: PageProps<'/[org]/admin/pantallas'>) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx) return null
  const canAds = ctx.can('org.manage')
  const canTv = ctx.can('training.manage_all') || ctx.can('org.manage')
  if (!canAds && !canTv) return <p className="text-sm text-zinc-400">Solo el dueño o un administrador maneja las pantallas.</p>

  const supabase = await createClient()
  const [{ data }, tv] = await Promise.all([
    canAds
      ? supabase
          .from('kiosk_slides')
          .select('id, image_path, active, badge, title, subtitle, style, text_position, orientation')
          .eq('org_id', ctx.org.id)
          .order('sort')
          .order('created_at')
      : Promise.resolve({ data: [] }),
    canTv ? supabase.rpc('floor_tv_settings', { p_org: ctx.org.id }) : Promise.resolve({ data: null }),
  ])
  const slides = (data ?? []).flatMap((s) => {
    const url = kioskSlideUrl(s.image_path)
    if (!url) return []
    return [
      {
        id: s.id,
        url,
        active: s.active,
        badge: s.badge,
        title: s.title,
        subtitle: s.subtitle,
        style: isPromoStyle(s.style) ? s.style : ('impacto' as const),
        position: isPromoPosition(s.text_position) ? s.text_position : ('bottom' as const),
        orientation: isPromoOrientation(s.orientation) ? s.orientation : ('both' as const),
      },
    ]
  })
  const tvSettings = (tv.data ?? null) as { linked: boolean; seen_at: string | null; ranking_enabled: boolean; message: string | null; web_enabled?: boolean } | null

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Pantallas</h1>
        <p className="text-sm text-zinc-400">La tablet del molinete y los televisores del gimnasio.</p>
      </div>

      {canAds && (
        <Card title="Publicidad">
          <p className="mb-4 text-sm text-zinc-400">
            Las imágenes que pasan <strong className="text-zinc-200">la tablet del molinete</strong> (cuando nadie la usa) y{' '}
            <strong className="text-zinc-200">los televisores</strong> (intercaladas con las clases y el ranking), en este orden.
            A cada una le podés poner textos animados y elegir si es vertical (tablet), horizontal (TVs) o para las dos.
            Los cambios llegan solos en unos minutos.
          </p>
          <KioskSlidesManager
            orgId={ctx.org.id}
            slides={slides}
            add={addKioskSlide.bind(null, slug)}
            remove={deleteKioskSlide.bind(null, slug)}
            toggle={toggleKioskSlide.bind(null, slug)}
            move={moveKioskSlide.bind(null, slug)}
            save={updateKioskSlide.bind(null, slug)}
          />
        </Card>
      )}

      {canTv && tvSettings && (
        <Card
          title="TV de la sala"
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
              <p className="flex items-start gap-2 text-sm text-zinc-300">
                <Tv className="mt-0.5 h-4 w-4 shrink-0 text-[#edcc36]" aria-hidden="true" /> Muestra la hora, cuánta gente hay, las clases que siguen hoy, el ranking del mes,
                los cumpleaños, tu mensaje y la publicidad de arriba. Va rotando sola. Cuando un profe pone su pizarra, la TV la muestra durante la clase.
              </p>
              {tvSettings.linked && (
                <TvLinkPanel
                  slug={slug}
                  linked
                  statusOnly
                  seenAt={tvSettings.seen_at}
                  seenLabel={tvSettings.seen_at ? fmtDateTime(tvSettings.seen_at, ctx.org.timezone) : null}
                  action={linkTv.bind(null, slug)}
                />
              )}
              <p className="pt-1 text-sm font-semibold text-white">{tvSettings.linked ? 'Vincular de nuevo u otro televisor' : 'Vincular la TV'}</p>
              <TvCodeForm slug={slug} action={claimTvCode.bind(null, slug)} />
            </div>
            <TvSettingsForm action={saveTvSettings.bind(null, slug)} ranking={tvSettings.ranking_enabled} message={tvSettings.message} />
          </div>
        </Card>
      )}
    </div>
  )
}
