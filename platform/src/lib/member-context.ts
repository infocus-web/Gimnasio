import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { createClient } from '@/lib/supabase/server'
import type { FamilyMember } from '@/types/platform'

export interface OrgInfo {
  id: string
  slug: string
  name: string
  timezone: string
  openingHours: { weekday: number; open: string; close: string }[]
  locationId: string | null
}

export interface MemberContext {
  org: OrgInfo
  userId: string
  meId: string
  family: FamilyMember[]
}

/** Gimnasio por slug. RLS: solo lo ve quien es socio o staff de ese gimnasio. */
export const getOrg = cache(async (slug: string): Promise<OrgInfo | null> => {
  const supabase = await createClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('id, slug, name, timezone, opening_hours')
    .eq('slug', slug)
    .maybeSingle()
  if (!org) return null
  const { data: loc } = await supabase
    .from('locations')
    .select('id')
    .eq('org_id', org.id)
    .eq('active', true)
    .order('created_at')
    .limit(1)
    .maybeSingle()
  return {
    id: org.id,
    slug: org.slug,
    name: org.name,
    timezone: org.timezone,
    openingHours: (org.opening_hours as OrgInfo['openingHours']) ?? [],
    locationId: loc?.id ?? null,
  }
})

export const requireUser = cache(async (next: string) => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}` as Route)
  return user
})

/**
 * Socio logueado + su grupo familiar (si es el pagador de la cuenta).
 * Se filtra explícitamente por user_id / cuenta familiar: si la persona además
 * es staff, RLS le dejaría ver a todos los socios y no queremos eso acá.
 */
export const getMemberContext = cache(async (slug: string): Promise<MemberContext | { error: 'NO_ORG' | 'NOT_A_MEMBER' }> => {
  const user = await requireUser(`/${slug}/app`)
  const org = await getOrg(slug)
  if (!org) return { error: 'NO_ORG' }

  const supabase = await createClient()
  const { data: me } = await supabase
    .from('members')
    .select('id, first_name, last_name, photo_url, billing_account_id')
    .eq('org_id', org.id)
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .maybeSingle()
  if (!me) return { error: 'NOT_A_MEMBER' }

  const family: FamilyMember[] = [
    { id: me.id, firstName: me.first_name, lastName: me.last_name, photoUrl: me.photo_url ?? undefined, isMe: true },
  ]
  if (me.billing_account_id) {
    const { data: account } = await supabase
      .from('billing_accounts')
      .select('id')
      .eq('id', me.billing_account_id)
      .eq('payer_member_id', me.id)
      .maybeSingle()
    if (account) {
      const { data: deps } = await supabase
        .from('members')
        .select('id, first_name, last_name, photo_url')
        .eq('billing_account_id', account.id)
        .neq('id', me.id)
        .neq('status', 'archived')
        .order('first_name')
      for (const d of deps ?? []) {
        family.push({ id: d.id, firstName: d.first_name, lastName: d.last_name, photoUrl: d.photo_url ?? undefined, isMe: false })
      }
    }
  }
  return { org, userId: user.id, meId: me.id, family }
})

/** Staff activo del gimnasio (para la recepción). */
export const getStaffContext = cache(async (slug: string) => {
  const user = await requireUser(`/${slug}/admin`)
  const org = await getOrg(slug)
  if (!org) return null
  const supabase = await createClient()
  const { data: staff } = await supabase
    .from('staff')
    .select('id, role, display_name')
    .eq('org_id', org.id)
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle()
  if (!staff) return null
  return { org, staff }
})
