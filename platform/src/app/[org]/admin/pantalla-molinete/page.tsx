import type { Metadata } from 'next'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/features/admin/ui'
import { KioskSlidesManager } from '@/features/admin/KioskSlidesManager'
import { kioskSlideUrl } from '@/features/admin/kiosk-slides'
import { addKioskSlide, deleteKioskSlide, moveKioskSlide, toggleKioskSlide } from '@/features/admin/kiosk-slide-actions'

export const metadata: Metadata = { title: 'Pantalla del molinete' }

/** Imágenes que pasa la tablet del molinete mientras nadie la usa. */
export default async function KioskScreenPage({ params }: PageProps<'/[org]/admin/pantalla-molinete'>) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx) return null
  if (!ctx.can('org.manage')) return <p className="text-sm text-zinc-400">Solo el dueño o un administrador elige la publicidad de la tablet.</p>

  const supabase = await createClient()
  const { data } = await supabase
    .from('kiosk_slides')
    .select('id, image_path, active')
    .eq('org_id', ctx.org.id)
    .order('sort')
    .order('created_at')
  const slides = (data ?? []).flatMap((s) => {
    const url = kioskSlideUrl(s.image_path)
    return url ? [{ id: s.id, url, active: s.active }] : []
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Pantalla del molinete</h1>
        <p className="text-sm text-zinc-400">
          Las imágenes que pasa la tablet cuando nadie la está usando, en este orden. Cada una se ve 7 segundos.
          Los cambios llegan a la tablet en unos minutos, sin tocarla.
        </p>
      </div>
      <Card title="Publicidad">
        <KioskSlidesManager
          orgId={ctx.org.id}
          slides={slides}
          add={addKioskSlide.bind(null, slug)}
          remove={deleteKioskSlide.bind(null, slug)}
          toggle={toggleKioskSlide.bind(null, slug)}
          move={moveKioskSlide.bind(null, slug)}
        />
      </Card>
    </div>
  )
}
