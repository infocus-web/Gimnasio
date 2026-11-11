import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/cuenta/borrar — el socio borra su cuenta desde la app de iPhone (exigencia de Apple, guía 5.1.1(v)).
 *
 * Headers: Authorization: Bearer <access_token de la sesión de la app>
 *
 * Qué se borra: el usuario de Supabase Auth (email, contraseña, Google/Apple). Con eso deja de poder entrar.
 * Qué queda: la ficha del socio, sus pagos y su historial de ingresos (members.user_id pasa a null por
 * "on delete set null"); el gimnasio los necesita por contabilidad y no se pueden borrar (0018_audit_fixes).
 * El personal del gimnasio (dueño, profes, recepción) no puede borrarse por acá: se hace desde el panel.
 */
export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SECRET_KEY) return json({ error: 'server_not_configured' }, 503)

  const auth = req.headers.get('authorization') ?? ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (!token) return json({ error: 'not_authenticated' }, 401)

  const admin = createAdminClient()
  // getUser valida el JWT contra Supabase Auth (firma y vencimiento)
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  const user = userData?.user
  if (userError || !user) return json({ error: 'not_authenticated' }, 401)

  const { data: staff, error: staffError } = await admin.from('staff').select('id').eq('user_id', user.id).limit(1)
  if (staffError) {
    console.error('[cuenta/borrar] staff', staffError.message)
    return json({ error: 'error' }, 500)
  }
  if (staff && staff.length > 0) return json({ error: 'is_staff' }, 409)

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
  if (deleteError) {
    console.error('[cuenta/borrar] deleteUser', deleteError.message)
    return json({ error: 'error' }, 500)
  }
  return json({ ok: true })
}
