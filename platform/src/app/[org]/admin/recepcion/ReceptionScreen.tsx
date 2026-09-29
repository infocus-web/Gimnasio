'use client'

import { useMemo, useState } from 'react'
import { ReceptionScanner } from '@/components/scanner/ReceptionScanner'
import { createClient } from '@/lib/supabase/client'
import type { CheckinResult } from '@/types/platform'

interface RawResult {
  found: boolean
  allowed?: boolean
  duplicate?: boolean
  reason?: string | null
  member?: { first_name: string; last_name: string; photo_url: string | null; medical_notes: string | null }
}

const REASONS = ['QR_EXPIRED_OR_INVALID', 'MEMBER_NOT_FOUND', 'NO_ACTIVE_MEMBERSHIP', 'IN_GRACE_PERIOD', 'MEMBER_FROZEN'] as const

function toResult(raw: RawResult): CheckinResult {
  const reason =
    raw.reason === 'QR_INVALID' ? 'QR_EXPIRED_OR_INVALID'
    : raw.reason === 'MEMBER_ARCHIVED' ? 'MEMBER_NOT_FOUND'
    : (REASONS as readonly string[]).includes(raw.reason ?? '') ? (raw.reason as CheckinResult['reason'])
    : null
  return {
    found: raw.found,
    allowed: !!raw.allowed,
    duplicate: raw.duplicate,
    reason,
    member: raw.member
      ? {
          firstName: raw.member.first_name,
          lastName: raw.member.last_name,
          photoUrl: raw.member.photo_url ?? undefined,
          medicalNotes: raw.member.medical_notes ?? undefined,
        }
      : undefined,
  }
}

export function ReceptionScreen({ orgId, locationId }: { orgId: string; locationId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [result, setResult] = useState<CheckinResult | null>(null)
  const [loading, setLoading] = useState(false)

  const scan = async (text: string) => {
    setLoading(true)
    const { data, error } = await supabase.rpc('checkin_scan', { p_location_id: locationId, p_token: text.trim() })
    setLoading(false)
    setResult(error ? { found: false, allowed: false, reason: 'QR_EXPIRED_OR_INVALID' } : toResult(data as unknown as RawResult))
  }

  // Búsqueda manual: DNI exacto primero; si no, nombre/apellido con un único resultado.
  const search = async (term: string) => {
    const q = term.trim()
    if (!q) return
    setLoading(true)
    let memberId: string | null = null
    const byDoc = await supabase.from('members').select('id').eq('org_id', orgId).eq('document_id', q).limit(1).maybeSingle()
    if (byDoc.data) memberId = byDoc.data.id
    else {
      const pattern = `%${q.replace(/[%_]/g, '')}%`
      const byName = await supabase
        .from('members')
        .select('id')
        .eq('org_id', orgId)
        .neq('status', 'archived')
        .or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`)
        .limit(2)
      if (byName.data?.length === 1) memberId = byName.data[0]!.id
    }
    if (!memberId) {
      setLoading(false)
      setResult({ found: false, allowed: false, reason: 'MEMBER_NOT_FOUND' })
      return
    }
    const { data, error } = await supabase.rpc('checkin_scan', {
      p_location_id: locationId,
      p_member_id: memberId,
      p_method: 'manual',
    })
    setLoading(false)
    setResult(error ? { found: false, allowed: false, reason: 'MEMBER_NOT_FOUND' } : toResult(data as unknown as RawResult))
  }

  return (
    <ReceptionScanner
      lastResult={result}
      onScan={scan}
      onSearch={search}
      onClearResult={() => setResult(null)}
      isLoading={loading}
    />
  )
}
