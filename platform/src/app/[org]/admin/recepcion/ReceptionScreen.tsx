'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import {
  AlertTriangle,
  CreditCard,
  DoorOpen,
  ExternalLink,
  FileWarning,
  Fingerprint,
  Hand,
  Loader2,
  QrCode,
  ScanFace,
  StickyNote,
  User,
  UserCheck,
  X,
} from 'lucide-react'
import { ReceptionScanner } from '@/components/scanner/ReceptionScanner'
import { createClient } from '@/lib/supabase/client'
import type { CheckinResult } from '@/types/platform'

interface RawResult {
  found: boolean
  allowed?: boolean
  duplicate?: boolean
  reason?: string | null
  member?: { id: string; first_name: string; last_name: string; photo_url: string | null; medical_notes: string | null }
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

interface Quick {
  id: string
  first_name: string | null
  last_name: string | null
  member_number: number | null
  plan_name: string | null
  membership_status: string | null
  current_period_end: string | null
  status: string | null
  photo_url: string | null
  medical_notes: string | null
  has_medical_cert: boolean | null
  medical_cert_expires_on: string | null
  phone: string | null
  document_id: string | null
}

interface Entry {
  id: number
  created_at: string
  allowed: boolean
  reason: string | null
  method: string
  member_id: string
  members: { first_name: string; last_name: string; access_pin: number | null } | null
}

const METHOD: Record<string, { label: string; Icon: typeof QrCode }> = {
  qr: { label: 'QR', Icon: QrCode },
  manual: { label: 'Recepción', Icon: UserCheck },
  facial: { label: 'Cara', Icon: ScanFace },
  palm: { label: 'Palma', Icon: Hand },
  fingerprint: { label: 'Huella', Icon: Fingerprint },
  nfc: { label: 'Tarjeta', Icon: CreditCard },
}

const DENIED: Record<string, string> = {
  NO_ACTIVE_MEMBERSHIP: 'Sin plan vigente',
  MEMBER_FROZEN: 'Congelado',
  MEMBER_ARCHIVED: 'Dado de baja',
  PAYMENT_PAST_DUE: 'Pago pendiente',
  MEMBERSHIP_EXPIRED: 'Plan vencido',
  PLAN_WITHOUT_GYM: 'Plan sin musculación',
  RECENT_ENTRY: 'Ya había entrado',
}

/** Inicio del día en la zona horaria del gimnasio, como ISO (para "Entradas de hoy"). */
function startOfDayIso(tz: string) {
  const now = new Date()
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const offset =
    new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(now)
      .find((p) => p.type === 'timeZoneName')
      ?.value.replace('GMT', '') || '+00:00'
  return new Date(`${ymd}T00:00:00${offset === '' ? '+00:00' : offset}`).toISOString()
}

const fmtTime = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const fmtDay = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('es-AR', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso),
  )

export function ReceptionScreen({
  slug,
  orgId,
  locationId,
  timezone,
  canBill,
  alerts,
}: {
  slug: string
  orgId: string
  locationId: string
  timezone: string
  canBill: boolean
  alerts: React.ReactNode
}) {
  const supabase = useMemo(() => createClient(), [])
  const [result, setResult] = useState<CheckinResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [quick, setQuick] = useState<(Quick & { photo: string | null }) | null>(null)
  const [quickLoading, setQuickLoading] = useState(false)
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [matches, setMatches] = useState<{ id: string; name: string; doc: string | null; num: number | null; plan: string | null }[]>([])

  const signed = useCallback(
    async (path: string | null | undefined, secs = 300) => {
      if (!path) return null
      if (/^https?:\/\//.test(path)) return path
      const { data } = await supabase.storage.from('socios').createSignedUrl(path, secs)
      return data?.signedUrl ?? null
    },
    [supabase],
  )

  // La foto del socio está en almacenamiento privado: link que vence en 5 minutos
  const withPhoto = async (r: CheckinResult): Promise<CheckinResult> => {
    const url = await signed(r.member?.photoUrl)
    return r.member ? { ...r, member: { ...r.member, photoUrl: url ?? undefined } } : r
  }

  const loadEntries = useCallback(async () => {
    const { data } = await supabase
      .from('checkins')
      .select('id, created_at, allowed, reason, method, member_id, members(first_name, last_name, access_pin)')
      .eq('org_id', orgId)
      .gte('created_at', startOfDayIso(timezone))
      .order('created_at', { ascending: false })
      .limit(60)
    setEntries((data ?? []) as unknown as Entry[])
  }, [supabase, orgId, timezone])

  useEffect(() => {
    void loadEntries()
    const t = setInterval(() => void loadEntries(), 15_000)
    return () => clearInterval(t)
  }, [loadEntries])

  const openQuick = useCallback(
    async (memberId: string) => {
      setMatches([])
      setQuickLoading(true)
      const { data } = await supabase
        .from('member_directory')
        .select(
          'id, first_name, last_name, member_number, plan_name, membership_status, current_period_end, status, photo_url, medical_notes, has_medical_cert, medical_cert_expires_on, phone, document_id',
        )
        .eq('id', memberId)
        .maybeSingle()
      setQuickLoading(false)
      if (!data) return setQuick(null)
      setQuick({ ...(data as Quick), photo: await signed(data.photo_url, 900) })
    },
    [supabase, signed],
  )

  const afterCheckin = async (raw: RawResult | null, fallbackReason: CheckinResult['reason']) => {
    setResult(raw ? await withPhoto(toResult(raw)) : { found: false, allowed: false, reason: fallbackReason })
    if (raw?.member?.id) void openQuick(raw.member.id)
    void loadEntries()
  }

  const scanning = useRef(false)
  const scan = async (text: string) => {
    if (scanning.current) return // una lectura por vez (cámara o lector USB)
    scanning.current = true
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('checkin_scan', { p_location_id: locationId, p_token: text.trim() })
      await afterCheckin(error ? null : (data as unknown as RawResult), 'QR_EXPIRED_OR_INVALID')
    } finally {
      setLoading(false)
      scanning.current = false
    }
  }
  const clearResult = useCallback(() => setResult(null), [])

  const checkinMember = async (memberId: string) => {
    setMatches([])
    setLoading(true)
    const { data, error } = await supabase.rpc('checkin_scan', {
      p_location_id: locationId,
      p_member_id: memberId,
      p_method: 'manual',
    })
    setLoading(false)
    await afterCheckin(error ? null : (data as unknown as RawResult), 'MEMBER_NOT_FOUND')
  }

  // Búsqueda: N° de socio o DNI exactos, o nombre y apellido en cualquier orden.
  // Un resultado: se abre su ficha rápida (la entrada se da con un botón). Varios: lista para elegir.
  const search = async (term: string) => {
    const q = term.replace(/[,()*%\\:._]/g, ' ').trim()
    if (!q) return
    setLoading(true)
    setMatches([])
    const digits = q.replace(/\D/g, '')
    const onlyDigits = digits.length > 0 && digits.length === q.replace(/[\s.]/g, '').length
    let query = supabase
      .from('member_directory')
      .select('id, first_name, last_name, document_id, plan_name, member_number')
      .eq('org_id', orgId)
      .neq('status', 'archived')
      .limit(8)
    if (onlyDigits && digits.length <= 6) query = query.eq('member_number', Number(digits))
    else if (onlyDigits) query = query.eq('document_id', digits)
    else for (const t of q.split(/\s+/).slice(0, 3)) query = query.or(`first_name.ilike.%${t}%,last_name.ilike.%${t}%`)
    const { data } = await query.order('last_name')
    setLoading(false)
    const rows = (data ?? []).map((m) => ({
      id: m.id!,
      name: `${m.first_name} ${m.last_name}`.trim(),
      doc: m.document_id,
      num: m.member_number,
      plan: m.plan_name,
    }))
    if (rows.length === 1) return void openQuick(rows[0]!.id)
    if (rows.length === 0) {
      setQuick(null)
      setResult({ found: false, allowed: false, reason: 'MEMBER_NOT_FOUND' })
      return
    }
    setQuick(null)
    setMatches(rows)
  }

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
  const certExpired = !!quick?.medical_cert_expires_on && quick.medical_cert_expires_on < today
  const periodEnd = quick?.current_period_end ? new Date(quick.current_period_end) : null
  const days = periodEnd ? Math.ceil((periodEnd.getTime() - Date.now()) / 86_400_000) : null
  const planOk = !!periodEnd && days !== null && days >= 0 && ['active', 'trialing'].includes(quick?.membership_status ?? '')
  const allowedToday = entries?.filter((e) => e.allowed).length ?? 0

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <ReceptionScanner
          lastResult={result}
          onScan={scan}
          onSearch={search}
          onClearResult={clearResult}
          isLoading={loading}
        />

        {matches.length > 0 && (
          <section aria-label="Resultados de la búsqueda" className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <h2 className="mb-2 text-sm font-bold text-zinc-300">Hay {matches.length} coincidencias: elegí al socio</h2>
            <ul className="divide-y divide-zinc-900">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => void openQuick(m.id)}
                    className="flex min-h-[52px] w-full items-center justify-between gap-3 px-2 text-left hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
                  >
                    <span>
                      <span className="block font-semibold text-white">{m.name}</span>
                      <span className="text-xs text-zinc-500">
                        {[m.num && `N° ${m.num}`, m.doc && `DNI ${m.doc}`, m.plan ?? 'Sin plan'].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="text-xs font-semibold text-[#edcc36]">Ver</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(quick || quickLoading) && (
          <section aria-label="Ficha rápida del socio" className="relative rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
            {quickLoading || !quick ? (
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando ficha…
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setQuick(null)}
                  aria-label="Cerrar ficha"
                  className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-900 hover:text-white"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
                    {quick.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={quick.photo} alt={`Foto de ${quick.first_name}`} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-zinc-600">
                        <User className="h-10 w-10" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <h2 className="pr-10 text-xl font-extrabold text-white">
                        {quick.first_name} {quick.last_name}
                      </h2>
                      <p className="text-xs text-zinc-400">
                        {[quick.member_number && `N° de socio ${quick.member_number}`, quick.document_id && `DNI ${quick.document_id}`, quick.phone]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs font-semibold">
                      {quick.status === 'frozen' ? (
                        <span className="rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-sky-200">Congelado</span>
                      ) : quick.status === 'archived' ? (
                        <span className="rounded-md border border-zinc-700 px-2 py-1 text-zinc-400">Dado de baja</span>
                      ) : planOk ? (
                        <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-emerald-200">
                          {quick.plan_name} · vence {fmtDay(quick.current_period_end!, timezone)}
                          {days !== null && days <= 7 ? ` (en ${days} d)` : ''}
                        </span>
                      ) : (
                        <span className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-red-200">
                          {quick.plan_name
                            ? `${quick.plan_name} · ${quick.membership_status === 'past_due' ? 'pago pendiente' : `vencido${quick.current_period_end ? ` el ${fmtDay(quick.current_period_end, timezone)}` : ''}`}`
                            : 'Sin plan'}
                        </span>
                      )}
                      {!quick.has_medical_cert ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-200">
                          <FileWarning className="h-3.5 w-3.5" aria-hidden="true" /> Sin apto físico
                        </span>
                      ) : certExpired ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-red-200">
                          <FileWarning className="h-3.5 w-3.5" aria-hidden="true" /> Apto vencido
                        </span>
                      ) : (
                        <span className="rounded-md border border-zinc-700 px-2 py-1 text-zinc-300">Apto físico al día</span>
                      )}
                    </div>
                    {quick.medical_notes && (
                      <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-2.5 text-sm text-amber-100">
                        <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" /> {quick.medical_notes}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => void checkinMember(quick.id)}
                        disabled={loading}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#edcc36] px-5 text-sm font-bold text-black disabled:opacity-60"
                      >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <DoorOpen className="h-4 w-4" aria-hidden="true" />}
                        Dar entrada
                      </button>
                      {canBill && (
                        <Link
                          href={`/${slug}/admin/socios/${quick.id}#cobrar` as Route}
                          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-semibold text-zinc-200 hover:border-[#edcc36]/60"
                        >
                          <CreditCard className="h-4 w-4" aria-hidden="true" /> Cobrar / renovar
                        </Link>
                      )}
                      <Link
                        href={`/${slug}/admin/socios/${quick.id}` as Route}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-semibold text-zinc-200 hover:border-[#edcc36]/60"
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" /> Ficha completa
                      </Link>
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>
        )}
      </div>

      <aside className="space-y-3">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
            Entradas de hoy
            <span className="ml-auto rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-200">{allowedToday}</span>
          </h2>
          {entries === null ? (
            <p className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando…
            </p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-zinc-500">Todavía no entró nadie hoy.</p>
          ) : (
            <ul className="max-h-[420px] space-y-0.5 overflow-y-auto pr-1 text-sm">
              {entries.map((e) => {
                const m = METHOD[e.method] ?? METHOD.manual!
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => void openQuick(e.member_id)}
                      className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-zinc-900"
                    >
                      <span className="w-11 shrink-0 font-mono text-xs tabular-nums text-zinc-500">{fmtTime(e.created_at, timezone)}</span>
                      <m.Icon className={`h-3.5 w-3.5 shrink-0 ${e.allowed ? 'text-emerald-300' : 'text-red-400'}`} aria-label={m.label} />
                      <span className={`min-w-0 flex-1 truncate ${e.allowed ? 'text-zinc-200' : 'text-zinc-400 line-through decoration-red-500/60'}`}>
                        {e.members ? `${e.members.first_name} ${e.members.last_name}` : 'Socio'}
                      </span>
                      {!e.allowed && (
                        <span className="flex shrink-0 items-center gap-1 text-[11px] text-red-300">
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                          {DENIED[e.reason ?? ''] ?? 'Rechazado'}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
        {alerts}
      </aside>
    </div>
  )
}
