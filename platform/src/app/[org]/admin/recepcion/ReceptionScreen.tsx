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

  const [matches, setMatches] = useState<{ id: string; name: string; doc: string | null; plan: string | null }[]>([])

  const checkinMember = async (memberId: string) => {
    setMatches([])
    setLoading(true)
    const { data, error } = await supabase.rpc('checkin_scan', {
      p_location_id: locationId,
      p_member_id: memberId,
      p_method: 'manual',
    })
    setLoading(false)
    setResult(error ? { found: false, allowed: false, reason: 'MEMBER_NOT_FOUND' } : toResult(data as unknown as RawResult))
  }

  // Búsqueda manual: DNI exacto, o nombre y apellido en cualquier orden ("juan perez", "perez").
  // Con varios resultados se muestra una lista para elegir.
  const search = async (term: string) => {
    const q = term.replace(/[,()*%\\:._]/g, ' ').trim()
    if (!q) return
    setLoading(true)
    setMatches([])
    const doc = q.replace(/\D/g, '')
    let query = supabase
      .from('member_directory')
      .select('id, first_name, last_name, document_id, plan_name')
      .eq('org_id', orgId)
      .neq('status', 'archived')
      .limit(8)
    if (doc.length >= 6 && doc.length === q.replace(/\s/g, '').length) {
      query = query.eq('document_id', doc)
    } else {
      for (const t of q.split(/\s+/).slice(0, 3)) {
        query = query.or(`first_name.ilike.%${t}%,last_name.ilike.%${t}%`)
      }
    }
    const { data } = await query.order('last_name')
    const rows = (data ?? []).map((m) => ({
      id: m.id!,
      name: `${m.first_name} ${m.last_name}`.trim(),
      doc: m.document_id,
      plan: m.plan_name,
    }))
    if (rows.length === 1) return checkinMember(rows[0]!.id)
    setLoading(false)
    if (rows.length === 0) {
      setResult({ found: false, allowed: false, reason: 'MEMBER_NOT_FOUND' })
      return
    }
    setMatches(rows)
  }

  return (
    <div className="space-y-4">
      <ReceptionScanner
        lastResult={result}
        onScan={scan}
        onSearch={search}
        onClearResult={() => setResult(null)}
        isLoading={loading}
      />
      {matches.length > 0 && (
        <section aria-label="Resultados de la búsqueda" className="mx-auto max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="mb-2 text-sm font-bold text-zinc-300">Hay {matches.length} coincidencias: elegí a quién dar entrada</h2>
          <ul className="divide-y divide-zinc-900">
            {matches.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => checkinMember(m.id)}
                  className="flex min-h-[52px] w-full items-center justify-between gap-3 px-2 text-left hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]">
                  <span>
                    <span className="block font-semibold text-white">{m.name}</span>
                    <span className="text-xs text-zinc-500">{[m.doc && `DNI ${m.doc}`, m.plan].filter(Boolean).join(' · ') || 'Sin plan'}</span>
                  </span>
                  <span className="rounded-lg bg-[#edcc36] px-3 py-1.5 text-xs font-bold text-black">Dar entrada</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
