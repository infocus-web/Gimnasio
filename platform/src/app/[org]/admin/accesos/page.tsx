import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { Wifi, WifiOff, ScanFace, AlertTriangle } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/site-url'
import { Card } from '@/features/admin/ui'
import { fmtDateTime } from '@/features/admin/format'
import { CopyValue, DeviceButtons, RegisterDeviceForm, UnlinkedUserRow } from '@/features/admin/AccessForms'
import { deviceAction, forgetDeviceUser, linkDeviceUser, registerDevice } from '@/features/admin/access-actions'

export const metadata: Metadata = { title: 'Accesos' }

const METHOD: Record<string, string> = { facial: 'cara', palm: 'palma', fingerprint: 'huella', nfc: 'tarjeta' }

export default async function AccessPage({ params }: PageProps<'/[org]/admin/accesos'>) {
  const { org: slug } = await params
  const ctx = (await getAdminContext(slug))!
  if (!ctx.can('org.manage')) return <p className="text-sm text-zinc-400">Solo el dueño o un administrador configura los lectores.</p>

  const supabase = await createClient()
  const h = await headers()
  const myIp = (h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0] ?? '').trim()
  const since = new Date(Date.now() - 7 * 86400_000).toISOString()

  const [{ data: devices }, { data: users }, { data: cmds }, { data: detected }, { data: entries }] = await Promise.all([
    supabase
      .from('access_devices')
      .select('id, name, serial_number, active, trusted_ip, pending_ip, last_seen_at, info, created_at')
      .eq('org_id', ctx.org.id)
      .order('created_at'),
    supabase.from('access_device_users').select('device_id, pin, name, managed, state, has_bio, member_id').eq('org_id', ctx.org.id),
    supabase
      .from('access_commands')
      .select('device_id, status, kind')
      .eq('org_id', ctx.org.id)
      .in('status', ['pending', 'sent', 'error'])
      .gte('created_at', since),
    myIp ? supabase.rpc('access_unknown_nearby', { p_org: ctx.org.id, p_ip: myIp }) : Promise.resolve({ data: [] }),
    supabase
      .from('checkins')
      .select('id, member_id, method, reason, created_at')
      .eq('org_id', ctx.org.id)
      .in('method', ['facial', 'palm', 'fingerprint', 'nfc'])
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  const memberIds = [...new Set((entries ?? []).map((e) => e.member_id))]
  const { data: names } = memberIds.length
    ? await supabase.from('members').select('id, first_name, last_name').in('id', memberIds)
    : { data: [] as { id: string; first_name: string; last_name: string }[] }
  const nameOf = new Map((names ?? []).map((n) => [n.id, `${n.first_name} ${n.last_name}`.trim()]))

  const host = new URL(await siteUrl()).host
  const keyMissing = !process.env.SUPABASE_SECRET_KEY
  const online = (t: string | null) => !!t && Date.now() - new Date(t).getTime() < 2 * 60_000

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Accesos</h1>
        <p className="text-sm text-zinc-400">
          Lectores de cara/palma/huella (ZKTeco SpeedFace). El lector abre el molinete por su cuenta; el sistema le carga solo a los socios al
          día y saca a los vencidos o morosos. Cada entrada queda registrada.
        </p>
      </div>

      {keyMissing && (
        <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          Falta cargar <code>SUPABASE_SECRET_KEY</code> en Vercel: sin esa clave el sistema no puede hablar con los lectores.
        </p>
      )}

      <Card title="1 · Configurar el lector">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-zinc-300">
          <li>
            En el lector: <strong className="text-white">Menú → Comunicación (COMM) → Servidor en la nube</strong> (Cloud Server Setting).
          </li>
          <li>
            Modo servidor: <strong className="text-white">ADMS</strong> · Habilitar nombre de dominio: <strong className="text-white">Sí</strong>
          </li>
          <li>
            Dirección del servidor: <CopyValue value={host} />
          </li>
          <li>
            Puerto: <strong className="text-white">443</strong> y <strong className="text-white">HTTPS: Sí</strong> (si tu lector no tiene la opción
            HTTPS, avisanos: se conecta con un puente). Proxy: No.
          </li>
          <li>Guardá. En 1 minuto el lector aparece acá abajo para registrarlo.</li>
        </ol>
      </Card>

      <Card title="2 · Registrar lector">
        <RegisterDeviceForm
          action={registerDevice.bind(null, slug)}
          detected={((detected ?? []) as { serial_number: string }[]).map((d) => d.serial_number)}
        />
      </Card>

      {(devices ?? []).map((d) => {
        const du = (users ?? []).filter((u) => u.device_id === d.id)
        const loaded = du.filter((u) => u.managed && u.state === 'present')
        const withBio = loaded.filter((u) => u.has_bio).length
        const unlinked = du.filter((u) => !u.managed && !u.member_id && u.state === 'present')
        const dc = (cmds ?? []).filter((c) => c.device_id === d.id)
        const pending = dc.filter((c) => c.status !== 'error').length
        const errors = dc.filter((c) => c.status === 'error').length
        const info = (d.info ?? {}) as Record<string, string>
        const isOnline = online(d.last_seen_at)
        return (
          <Card key={d.id} title={d.name}>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className={`inline-flex items-center gap-1.5 font-semibold ${isOnline ? 'text-emerald-300' : 'text-zinc-400'}`}>
                  {isOnline ? <Wifi className="h-4 w-4" aria-hidden="true" /> : <WifiOff className="h-4 w-4" aria-hidden="true" />}
                  {!d.active ? 'Pausado' : isOnline ? 'Conectado' : d.last_seen_at ? `Sin conexión desde ${fmtDateTime(d.last_seen_at)}` : 'Esperando la primera conexión'}
                </span>
                <span className="font-mono text-xs text-zinc-500">S/N {d.serial_number}</span>
                {(info.DeviceName || info.FWVersion) && (
                  <span className="text-xs text-zinc-500">
                    {info.DeviceName} {info.FWVersion ? `· FW ${info.FWVersion}` : ''}
                  </span>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Socios cargados', loaded.length],
                  ['Con cara/palma/huella', withBio],
                  ['Cambios en camino', pending],
                  ['Errores (7 días)', errors],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-xl border border-zinc-800 bg-black p-3">
                    <dt className="text-xs text-zinc-500">{label}</dt>
                    <dd className={`text-xl font-extrabold ${label === 'Errores (7 días)' && errors ? 'text-red-300' : 'text-white'}`}>{value}</dd>
                  </div>
                ))}
              </dl>

              <DeviceButtons
                active={d.active}
                pendingIp={d.pending_ip}
                actions={{
                  resync: deviceAction.bind(null, slug, d.id, 'resync'),
                  query: deviceAction.bind(null, slug, d.id, 'query'),
                  confirmIp: deviceAction.bind(null, slug, d.id, 'confirm_ip'),
                  toggle: deviceAction.bind(null, slug, d.id, d.active ? 'disable' : 'enable'),
                  remove: deviceAction.bind(null, slug, d.id, 'delete'),
                }}
              />

              {unlinked.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 p-3">
                  <p className="flex items-start gap-2 text-sm text-amber-100">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    {unlinked.length === 1 ? 'Hay 1 persona cargada' : `Hay ${unlinked.length} personas cargadas`} a mano en el lector que no
                    están vinculadas a un socio: entran sin control de pagos. Vinculalas con su DNI (conservan la cara) o borralas.
                  </p>
                  <ul className="divide-y divide-zinc-900">
                    {unlinked.slice(0, 50).map((u) => (
                      <UnlinkedUserRow
                        key={u.pin}
                        pin={u.pin}
                        name={u.name ?? ''}
                        link={linkDeviceUser.bind(null, slug, d.id, u.pin)}
                        forget={forgetDeviceUser.bind(null, slug, d.id, u.pin)}
                      />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>
        )
      })}

      <Card title="Últimas entradas por lector">
        {entries && entries.length > 0 ? (
          <ul className="divide-y divide-zinc-900 text-sm">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                <span className="flex items-center gap-2 text-white">
                  <ScanFace className="h-4 w-4 text-[#edcc36]" aria-hidden="true" />
                  {nameOf.get(e.member_id) ?? 'Socio'}
                  <span className="text-xs text-zinc-500">({METHOD[e.method] ?? e.method})</span>
                  {e.reason === 'DEVICE_OUT_OF_SYNC' && <span className="text-xs text-amber-300">· entró sin estar al día (el cambio no había llegado)</span>}
                </span>
                <span className="text-xs text-zinc-500">{fmtDateTime(e.created_at, ctx.org.timezone)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">Todavía no hay entradas desde un lector.</p>
        )}
      </Card>
    </div>
  )
}
