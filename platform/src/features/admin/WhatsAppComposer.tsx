'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, Check, MessageCircle, Send, X } from 'lucide-react'
import { MESSAGE_TEMPLATES, fillMessage, whatsappLink } from './whatsapp'
import { logWhatsappMessage } from './message-actions'

export interface ComposerStudent {
  id: string
  name: string
  /** Ya normalizado (549…) o null si no tiene / no es válido */
  phone: string | null
  /** Hace más de 7 días que no entrena (o nunca) */
  stale: boolean
  hasProgram: boolean
}

type Filter = 'all' | 'stale' | 'noProgram'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'stale', label: 'No entrenan hace +7 días' },
  { key: 'noProgram', label: 'Sin rutina' },
]

export function WhatsAppComposer({ slug, senderName, students }: { slug: string; senderName: string; students: ComposerStudent[] }) {
  const [open, setOpen] = useState(false)
  const [templateKey, setTemplateKey] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [step, setStep] = useState<'compose' | 'send'>('compose')
  const [sent, setSent] = useState<Set<string>>(new Set())

  const reachable = students.filter((s) => s.phone)
  const visible = useMemo(
    () => students.filter((s) => (filter === 'stale' ? s.stale : filter === 'noProgram' ? !s.hasProgram : true)),
    [students, filter],
  )
  const recipients = students.filter((s) => s.phone && selected.has(s.id))
  const preview = recipients[0] ?? reachable[0]

  const pickTemplate = (key: string) => {
    const t = MESSAGE_TEMPLATES.find((x) => x.key === key)
    if (!t) return
    setTemplateKey(key)
    setBody(t.body)
  }
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const selectVisible = () => setSelected(new Set([...selected, ...visible.filter((s) => s.phone).map((s) => s.id)]))
  const reset = () => {
    setStep('compose')
    setSent(new Set())
  }

  const markSent = (s: ComposerStudent, text: string) => {
    setSent((prev) => new Set(prev).add(s.id))
    void logWhatsappMessage(slug, { memberId: s.id, phone: s.phone!, body: text, templateKey })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#25D366]/60 bg-[#25D366]/10 px-4 text-sm font-bold text-[#7ee2a8] hover:bg-[#25D366]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]"
      >
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        Mensaje por WhatsApp
      </button>
    )
  }

  return (
    <section aria-label="Mensaje por WhatsApp" className="space-y-4 rounded-2xl border border-[#25D366]/40 bg-zinc-950 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-white">
          <MessageCircle className="h-5 w-5 text-[#25D366]" aria-hidden="true" /> Mensaje por WhatsApp
        </h2>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            reset()
          }}
          aria-label="Cerrar"
          className="grid min-h-[44px] min-w-[44px] place-items-center rounded-xl text-zinc-400 hover:text-white"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {step === 'compose' ? (
        <>
          {/* 1 · Mensaje */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">1 · Elegí o escribí el mensaje</p>
            <div className="flex flex-wrap gap-2">
              {MESSAGE_TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => pickTemplate(t.key)}
                  aria-pressed={templateKey === t.key}
                  className={`min-h-[40px] rounded-xl border px-3 text-sm ${
                    templateKey === t.key ? 'border-[#edcc36] bg-[#edcc36] font-semibold text-black' : 'border-zinc-800 text-zinc-300 hover:border-zinc-600'
                  }`}
                >
                  {t.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setTemplateKey(null)
                  setBody('¡Hola {nombre}! ')
                }}
                aria-pressed={templateKey === null && body !== ''}
                className="min-h-[40px] rounded-xl border border-dashed border-zinc-700 px-3 text-sm text-zinc-300 hover:border-zinc-500"
              >
                Escribir uno nuevo
              </button>
            </div>
            <label htmlFor="wa-body" className="sr-only">Texto del mensaje</label>
            <textarea
              id="wa-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              maxLength={1500}
              placeholder="Elegí un mensaje de arriba o escribí el tuyo"
              className="w-full rounded-xl border border-zinc-800 bg-black p-3 text-sm text-white placeholder:text-zinc-600 focus:border-[#edcc36] focus:outline-none"
            />
            <p className="text-xs text-zinc-500">
              <strong className="text-zinc-300">{'{nombre}'}</strong> se cambia por el nombre de cada alumno. Completá lo que esté entre [corchetes].
            </p>
            {body && preview && (
              <div className="rounded-xl bg-[#0b3d2a]/50 p-3 text-sm text-zinc-100">
                <p className="mb-1 text-[11px] uppercase tracking-wide text-[#7ee2a8]">Así le llega a {preview.name.split(' ')[0]}</p>
                <p className="whitespace-pre-line">{fillMessage(body, { nombre: preview.name, profe: senderName })}</p>
              </div>
            )}
          </div>

          {/* 2 · Para quién */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">2 · ¿A quién se lo mandás?</p>
            <div className="flex flex-wrap items-center gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  aria-pressed={filter === f.key}
                  className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold ${
                    filter === f.key ? 'border-[#edcc36] text-[#edcc36]' : 'border-zinc-800 text-zinc-400'
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <span className="mx-1 h-5 w-px bg-zinc-800" aria-hidden="true" />
              <button type="button" onClick={selectVisible} className="min-h-[36px] px-2 text-xs font-semibold text-zinc-300 underline-offset-2 hover:underline">
                Marcar todos
              </button>
              <button type="button" onClick={() => setSelected(new Set())} className="min-h-[36px] px-2 text-xs font-semibold text-zinc-500 underline-offset-2 hover:underline">
                Ninguno
              </button>
            </div>
            <ul className="max-h-72 divide-y divide-zinc-900 overflow-y-auto rounded-xl border border-zinc-800">
              {visible.map((s) => (
                <li key={s.id}>
                  <label className={`flex min-h-[44px] items-center gap-3 px-3 py-2 ${s.phone ? 'cursor-pointer hover:bg-zinc-900' : 'opacity-50'}`}>
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      disabled={!s.phone}
                      onChange={() => toggle(s.id)}
                      className="h-5 w-5 accent-[#edcc36]"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-white">{s.name}</span>
                    {!s.phone && <span className="text-xs text-zinc-500">sin teléfono</span>}
                  </label>
                </li>
              ))}
              {visible.length === 0 && <li className="p-4 text-center text-sm text-zinc-500">Nadie en este filtro.</li>}
            </ul>
            {students.length > reachable.length && (
              <p className="text-xs text-zinc-500">
                {students.length - reachable.length} sin teléfono cargado: pedile a recepción que lo agregue en la ficha.
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={!body.trim() || recipients.length === 0}
            onClick={() => setStep('send')}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] text-base font-extrabold text-black disabled:opacity-40"
          >
            <Send className="h-5 w-5" aria-hidden="true" /> Preparar envío ({recipients.length})
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={reset} className="inline-flex min-h-[44px] items-center gap-1 text-sm text-zinc-300 hover:text-white">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver
            </button>
            <p className="text-sm font-semibold text-white" aria-live="polite">
              {sent.size} de {recipients.length} enviados
            </p>
          </div>
          <p className="text-xs text-zinc-400">
            Tocá cada uno: se abre tu WhatsApp con el mensaje escrito, lo mandás y volvés acá para el siguiente.
          </p>
          <ul className="divide-y divide-zinc-900 rounded-xl border border-zinc-800">
            {recipients.map((s) => {
              const text = fillMessage(body, { nombre: s.name, profe: senderName })
              const done = sent.has(s.id)
              return (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-white">{s.name}</span>
                  {done ? (
                    <span className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-[#7ee2a8]">
                      <Check className="h-4 w-4" aria-hidden="true" /> Abierto
                    </span>
                  ) : (
                    <a
                      href={whatsappLink(s.phone!, text)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => markSent(s, text)}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-bold text-black"
                    >
                      <MessageCircle className="h-4 w-4" aria-hidden="true" /> Abrir WhatsApp
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
