'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, Loader2, MessageCircle, Ticket, UserPlus, X } from 'lucide-react'
import { useMember } from '@/features/member/MemberProvider'
import { normalizeArPhone, whatsappLink } from '@/features/admin/whatsapp'
import { PASS_STATUS, passError, passShareText, passStatus } from '@/features/access-plus/labels'

interface Quota {
  quota: number
  used: number
  left: number
  can_invite: boolean
  reason: string | null
}
interface GuestPass {
  id: string
  code: string
  holder_name: string
  holder_phone: string | null
  holder_document: string | null
  valid_from: string
  valid_until: string
  max_entries: number
  entries_used: number
  revoked_at: string | null
  created_at: string
}

const input =
  'min-h-[48px] w-full rounded-xl border border-zinc-800 bg-black px-3 text-base text-white placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]'

function ymd(tz: string, plusDays = 0) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(Date.now() + plusDays * 86_400_000),
  )
}

export function GuestsScreen({ timezone }: { timezone: string }) {
  const { supabase, org, activeMemberId } = useMember()
  const [quota, setQuota] = useState<Quota | null>(null)
  const [passes, setPasses] = useState<GuestPass[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [created, setCreated] = useState<GuestPass | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const load = useCallback(async () => {
    setLoadError(false)
    const [q, list] = await Promise.all([
      supabase.rpc('member_guest_quota', { p_member: activeMemberId }),
      supabase
        .from('day_passes')
        .select('id, code, holder_name, holder_phone, holder_document, valid_from, valid_until, max_entries, entries_used, revoked_at, created_at')
        .eq('invited_by_member', activeMemberId)
        .eq('kind', 'guest')
        .order('created_at', { ascending: false })
        .limit(30),
    ])
    if (q.error || list.error) {
      setLoadError(true)
      return
    }
    setQuota(q.data as unknown as Quota)
    setPasses((list.data ?? []) as GuestPass[])
  }, [supabase, activeMemberId])

  useEffect(() => {
    void load()
  }, [load])

  const link = (code: string) => `${window.location.origin}/${org.slug}/pase/${code}`
  const share = (p: GuestPass) => {
    const text = passShareText({ holderName: p.holder_name, gymName: org.name, link: link(p.code), validUntil: p.valid_until, timezone, kind: 'guest' })
    const wa = normalizeArPhone(p.holder_phone)
    return wa ? whatsappLink(wa, text) : `https://wa.me/?text=${encodeURIComponent(text)}`
  }
  const day = (iso: string) =>
    new Intl.DateTimeFormat('es-AR', { timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso))

  const submit = async (form: FormData) => {
    setFormError(null)
    setCreated(null)
    const name = String(form.get('name') ?? '').trim()
    const dni = String(form.get('dni') ?? '').replace(/\D/g, '')
    if (name.length < 2) return setFormError('Escribí el nombre y apellido de tu invitado.')
    if (dni.length < 6) return setFormError('Escribí el DNI de tu invitado (solo números).')
    setSaving(true)
    try {
      const { data, error } = await supabase.rpc('member_issue_guest_pass', {
        p_member: activeMemberId,
        p_holder_name: name,
        p_holder_document: dni,
        p_date: String(form.get('date') ?? '') || null,
        p_holder_phone: String(form.get('phone') ?? '').trim() || null,
      })
      if (error) return setFormError(passError(error.message))
      const d = data as { id: string; code: string; valid_from: string; valid_until: string }
      setCreated({
        id: d.id,
        code: d.code,
        holder_name: name,
        holder_phone: String(form.get('phone') ?? '').trim() || null,
        holder_document: dni,
        valid_from: d.valid_from,
        valid_until: d.valid_until,
        max_entries: 1,
        entries_used: 0,
        revoked_at: null,
        created_at: new Date().toISOString(),
      })
      formRef.current?.reset()
      await load()
    } catch {
      setFormError('Sin conexión. Revisá tu internet y probá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const revoke = async (id: string) => {
    const { error } = await supabase.rpc('day_pass_revoke', { p_pass: id })
    setConfirming(null)
    if (error) return setFormError(passError(error.message))
    if (created?.id === id) setCreated(null)
    await load()
  }

  const copy = (p: GuestPass) => {
    navigator.clipboard
      ?.writeText(link(p.code))
      .then(() => {
        setCopied(p.id)
        setTimeout(() => setCopied(null), 2000)
      })
      .catch(() => {})
  }

  if (loadError) {
    return (
      <div role="alert" className="space-y-3 rounded-3xl border border-red-500/40 bg-zinc-950 p-6 text-center">
        <p className="text-sm text-red-200">No pudimos cargar tus invitados.</p>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-[44px] w-full rounded-xl border border-[#edcc36]/40 bg-zinc-900 px-4 text-sm font-semibold text-[#edcc36]"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-extrabold text-white">Invitá a un amigo</h1>
        <p className="text-sm text-zinc-400">Le mandás un pase por WhatsApp y entra con el QR por el molinete. No necesita la app.</p>
      </header>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5" aria-live="polite">
        {!quota ? (
          <div className="h-6 w-56 animate-pulse rounded bg-zinc-900" aria-hidden="true" />
        ) : quota.reason === 'GUESTS_DISABLED' ? (
          <p className="text-sm text-zinc-300">El gimnasio no tiene habilitados los pases de invitado por ahora.</p>
        ) : quota.reason === 'PLAN_NOT_CURRENT' ? (
          <p className="text-sm text-amber-200">Para invitar a alguien necesitás tener tu plan al día. Pasá por recepción.</p>
        ) : (
          <p className="text-base text-zinc-200">
            Te {quota.left === 1 ? 'queda' : 'quedan'} <strong className="text-2xl font-extrabold text-[#edcc36]">{quota.left}</strong> de {quota.quota}{' '}
            {quota.quota === 1 ? 'pase de invitado' : 'pases de invitado'} este mes.
          </p>
        )}
      </section>

      {quota?.can_invite && (
        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault()
            void submit(new FormData(e.currentTarget))
          }}
          className="space-y-3 rounded-3xl border border-zinc-800 bg-zinc-950 p-5" noValidate>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-400">Nombre y apellido de tu invitado</span>
            <input name="name" autoComplete="off" className={input} required />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-400">DNI</span>
            <input name="dni" inputMode="numeric" autoComplete="off" className={input} required />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-400">Celular (opcional, para mandarle el pase)</span>
            <input name="phone" inputMode="tel" autoComplete="off" className={input} placeholder="11 5555-1234" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-400">¿Qué día viene?</span>
            <input name="date" type="date" defaultValue={ymd(timezone)} min={ymd(timezone)} max={ymd(timezone, 30)} className={input} />
          </label>
          {formError && (
            <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
              {formError}
            </p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#edcc36] px-5 text-base font-bold text-black disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <UserPlus className="h-5 w-5" aria-hidden="true" />}
            Crear pase de invitado
          </button>
          <p className="text-xs text-zinc-500">Vale para una entrada el día elegido.</p>
        </form>
      )}
      {!quota?.can_invite && formError && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
          {formError}
        </p>
      )}

      {created && (
        <section role="status" className="space-y-3 rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <p className="text-sm text-emerald-100">
            ¡Listo! Pase creado para <strong className="text-white">{created.holder_name}</strong> ({day(created.valid_from)}). Mandáselo:
          </p>
          <a
            href={share(created)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-base font-bold text-black"
          >
            <MessageCircle className="h-5 w-5" aria-hidden="true" /> Enviar por WhatsApp
          </a>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-bold uppercase tracking-wide text-zinc-400">Tus invitados</h2>
        {passes === null ? (
          <div className="flex items-center gap-2 px-1 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando…
          </div>
        ) : passes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
            <Ticket className="h-8 w-8 text-zinc-700" aria-hidden="true" />
            Todavía no invitaste a nadie.
          </div>
        ) : (
          <ul className="space-y-2">
            {passes.map((p) => {
              const st = passStatus(p)
              const s = PASS_STATUS[st]
              const active = st === 'valid' || st === 'upcoming'
              return (
                <li key={p.id} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">{p.holder_name}</p>
                      <p className="text-xs capitalize text-zinc-400">{day(p.valid_from)}</p>
                    </div>
                    <span className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold ${s.className}`}>{s.label}</span>
                  </div>
                  {active && (
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={share(p)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-emerald-500/40 px-3 text-sm font-semibold text-emerald-200"
                      >
                        <MessageCircle className="h-4 w-4" aria-hidden="true" /> WhatsApp
                      </a>
                      <button
                        type="button"
                        onClick={() => copy(p)}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-700 px-3 text-sm font-semibold text-zinc-200"
                      >
                        {copied === p.id ? <Check className="h-4 w-4 text-emerald-300" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                        {copied === p.id ? 'Copiado' : 'Copiar link'}
                      </button>
                      {p.entries_used === 0 &&
                        (confirming === p.id ? (
                          <span className="flex flex-wrap items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-1.5">
                            <span className="px-1 text-xs text-zinc-300">¿Anular el pase?</span>
                            <button
                              type="button"
                              onClick={() => void revoke(p.id)}
                              className="min-h-[44px] rounded-lg bg-red-600 px-3 text-sm font-bold text-white"
                            >
                              Sí, anular
                            </button>
                            <button type="button" onClick={() => setConfirming(null)} className="min-h-[44px] px-2 text-sm text-zinc-400">
                              No
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirming(p.id)}
                            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-zinc-800 px-3 text-sm text-zinc-400 hover:border-red-500/50 hover:text-red-300"
                          >
                            <X className="h-4 w-4" aria-hidden="true" /> Anular
                          </button>
                        ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
