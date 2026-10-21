import { AlertTriangle } from 'lucide-react'
import { SubNav } from '@/features/admin/SubNav'
import { getAdminContext } from '@/features/admin/context'
import { emailConfigured } from '@/features/engagement/email'

export default async function ComunicacionLayout({ children, params }: LayoutProps<'/[org]/admin/comunicacion'>) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx) return null // sin sesión de staff: el layout del panel ya muestra el aviso
  if (!ctx.can('members.write')) return <p className="text-sm text-zinc-400">No tenés permiso para ver Comunicación.</p>
  const base = `/${slug}/admin/comunicacion`
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-white">Comunicación</h1>
      {!emailConfigured() && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-semibold">Falta conectar el envío de emails.</strong> Los avisos se preparan igual y quedan
            pendientes; se mandan solos apenas se cargue la clave de Resend (RESEND_API_KEY) en Vercel.
          </span>
        </p>
      )}
      <SubNav
        items={[
          { href: base, label: 'Avisos automáticos' },
          { href: `${base}/riesgo`, label: 'En riesgo' },
          { href: `${base}/referidos`, label: 'Referidos' },
          { href: `${base}/historial`, label: 'Historial' },
          { href: `${base}/reglas`, label: 'Reglas' },
        ]}
      />
      {children}
    </div>
  )
}
