import type { Metadata } from 'next'
import { Video } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/features/admin/ui'
import { fmtDateTime } from '@/features/admin/format'
import { CamerasView, type CameraInfo } from '@/features/cameras/CamerasView'
import { CameraKeyPanel } from '@/features/cameras/CameraKeyPanel'
import { cameraStreamUrl, createCameraKey } from '@/features/cameras/actions'

export const metadata: Metadata = { title: 'Cámaras' }
export const dynamic = 'force-dynamic'

interface Site {
  tunnel_url: string | null
  cameras: CameraInfo[] | null
  agent_version: string | null
  last_seen_at: string | null
}

export default async function CamerasPage({ params }: PageProps<'/[org]/admin/camaras'>) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx) return null
  const canView = ctx.can('cameras.view')
  const canSetup = ctx.can('org.manage')
  if (!canView && !canSetup) return <p className="text-sm text-zinc-400">No tenés permiso para ver las cámaras.</p>

  const supabase = await createClient()
  const db = supabase as unknown as {
    from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: Site | null }> } } }
  }
  const { data: site } = await db.from('camera_sites').select('tunnel_url, cameras, agent_version, last_seen_at').eq('org_id', ctx.org.id).maybeSingle()
  const cameras = Array.isArray(site?.cameras) ? site.cameras : []
  const online = !!site?.last_seen_at && Date.now() - new Date(site.last_seen_at).getTime() < 3 * 60_000
  const tz = ctx.org.timezone

  return (
    <div className="space-y-5">
      {canView && online && site?.tunnel_url && cameras.length > 0 ? (
        <CamerasView cameras={cameras} getUrl={cameraStreamUrl.bind(null, slug)} />
      ) : canView ? (
        <div className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-sm text-zinc-300">
          <Video className="mt-0.5 h-5 w-5 shrink-0 text-[#edcc36]" aria-hidden="true" />
          <div>
            {!site?.last_seen_at ? (
              <p>Todavía no hay cámaras conectadas.{canSetup ? ' Seguí los pasos de abajo.' : ' Pedile al administrador que las configure.'}</p>
            ) : (
              <p>
                La PC de las cámaras no se conecta desde el {fmtDateTime(site.last_seen_at, tz)}. Revisá que esté prendida y con internet.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {canSetup && (
        <Card title="Configurar las cámaras">
          <div className="space-y-4 text-sm text-zinc-300">
            <p className={online ? 'text-emerald-300' : 'text-zinc-400'}>
              {online
                ? `Conectado · ${cameras.length} cámara(s)${site?.agent_version ? ` · programa v${site.agent_version}` : ''}`
                : site?.last_seen_at
                  ? `Sin conexión desde el ${fmtDateTime(site.last_seen_at, tz)}`
                  : 'Sin configurar'}
            </p>
            <ol className="list-decimal space-y-2 pl-5 text-zinc-300">
              <li>
                En la app <b>Tapo</b> instalá cada cámara en el WiFi del gimnasio. Después, en cada una: engranaje → <b>Ajustes avanzados</b> →{' '}
                <b>Cuenta de la cámara</b> → creá un usuario y contraseña (el mismo en todas).
              </li>
              <li>
                Anotá la <b>IP</b> de cada cámara (engranaje → Información del dispositivo) y, si podés, fijala en el router para que no cambie.
              </li>
              <li>Generá la clave acá abajo.</li>
              <li>
                En la PC del gimnasio (la del intermediario del molinete), abrí <b>CamarasEvolution.exe</b> con clic derecho →{' '}
                <b>Ejecutar como administrador</b> y seguí el asistente: te pide la clave, la cuenta de las cámaras y el nombre e IP de cada una.
              </li>
              <li>En un minuto las cámaras aparecen arriba. La PC tiene que quedar prendida y con internet.</li>
            </ol>
            <CameraKeyPanel hasKey={!!site} action={createCameraKey.bind(null, slug)} />
            <p className="text-xs text-zinc-500">
              Las imágenes no se guardan en la plataforma ni quedan públicas: viajan directo de la PC del gimnasio a quien las mira, y solo con un
              pase que da el panel a los usuarios con permiso. Poné carteles de &ldquo;zona videovigilada&rdquo; y no instales cámaras en vestuarios ni
              baños.
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}
