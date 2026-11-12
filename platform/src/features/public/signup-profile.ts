import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { signedUrl } from '@/features/admin/member-files'

/** Ficha del socio que se está inscribiendo online (paso 1: datos + foto). */
export interface SignupProfile {
  orgId: string
  memberId: string
  firstName: string
  lastName: string
  document: string | null
  phone: string | null
  birthDate: string | null
  photoPath: string | null
  /** Link firmado (1 hora) para mostrar la foto */
  photoSrc: string | null
  /** Datos completos: ya puede pasar a elegir el plan */
  complete: boolean
}

/**
 * Ficha de esta cuenta en el gimnasio, si ya existe.
 * Se lee con la clave secreta porque el gimnasio todavía no es visible para alguien
 * sin ficha; se filtra SIEMPRE por la cuenta logueada (userId) y el slug.
 */
export async function getSignupProfile(slug: string, userId: string): Promise<SignupProfile | null> {
  const admin = createAdminClient()
  const { data: org } = await admin.from('organizations').select('id').eq('slug', slug).maybeSingle()
  if (!org) return null
  const { data: m } = await admin
    .from('members')
    .select('id, first_name, last_name, document_id, phone, birth_date, photo_url, status')
    .eq('org_id', org.id)
    .eq('user_id', userId)
    .neq('status', 'archived')
    .maybeSingle()
  if (!m) return null
  return {
    orgId: org.id,
    memberId: m.id,
    firstName: m.first_name,
    lastName: m.last_name,
    document: m.document_id,
    phone: m.phone,
    birthDate: m.birth_date,
    photoPath: m.photo_url,
    photoSrc: await signedUrl(admin, m.photo_url, 3600),
    complete:
      m.first_name.length >= 2 && m.last_name.length >= 2 && !!m.document_id && (m.phone ?? '').replace(/\D/g, '').length >= 8 && !!m.photo_url,
  }
}
