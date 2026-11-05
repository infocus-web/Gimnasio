'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, BookmarkPlus, Check, Loader2, MessageCircle, Send, X } from 'lucide-react'
import { MESSAGE_TEMPLATES, fillMessage, whatsappLink, type ClassVars, type MessageTemplate } from './whatsapp'
import { logWhatsappMessage } from './message-actions'
import { quickSaveTemplate } from './template-actions'
import { InfoTip } from '@/components/InfoTip'

export interface ComposerStudent {
  id: string
  name: string
  /** Ya normalizado (549…) o null si no tiene / no es válido */
  phone: string | null
  /** Etiquetas para los filtros (ej. 'stale', 'vencido', 'espera') */
  tags: string[]
}

export interface ComposerFilter {
  /** 'all' = todos; si no, se muestran los alumnos que tienen esa etiqueta */
  key: string
  label: string
}

const DEFAULT_FILTERS: ComposerFilter[] = [{ key: 'all', label: 'Todos' }]

export function WhatsAppComposer({
  slug,
  senderName,
  students,
  templates = MESSAGE_TEMPLATES,
  filters = DEFAULT_FILTERS,
  classInfo,
  buttonLabel = 'Mensaje por WhatsApp',
  preselect,
}: {
  slug: string
  senderName: string
  students: ComposerStudent[]
  /** Mensajes predefinidos (del gimnasio + del profe) */
  templates?: MessageTemplate[]
  filters?: ComposerFilter[]
  /** Si se abre desde una clase: completa {clase} {dia} {hora} */
  classInfo?: ClassVars
  buttonLabel?: string
  /** Etiqueta a marcar al abrir ('all' = todos los que tienen teléfono) */
  preselect?: string
}) {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<MessageTemplate[]>(templates)
  const [templateKey, setTemplateKey] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [filter, setFilter] = useState(filters[0]?.key ?? 'all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [step, setStep] = useState<'compose' | 'send'>('compose')
  const [sent, setSent] = useState<Set<string>>(new Set())
  // Guardar el texto como mensaje predefinido
  const [saving, setSaving] = useState<'closed' | 'open' | 'busy'>('closed')
  const [saveLabel, setSaveLabel] = useState('')
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const reachable = students.filter((s) => s.phone)
  const matches = (s: ComposerStudent, key: string) => key === 'all' || s.tags.includes(key)
  const visible = useMemo(() => students.filter((s) => matches(s, filter)), [students, filter])
  const recipients = students.filter((s) => s.phone && selected.has(s.id))
  const preview = recipients[0] ?? reachable[0]
  const vars = (name: string) => ({ nombre: name, profe: senderName, ...classInfo })

  const openComposer = () => {
    setOpen(true)
    if (preselect) setSelected(new Set(students.filter((s) => s.phone && matches(s, preselect)).map((s) => s.id)))
  }
  const pickTemplate = (key: string) => {
    const t = list.find((x) => x.key === key)
    if (!t) return
    setTemplateKey(key)
    setBody(t.body)
    setSaveMsg(null)
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
    // Solo se guarda el id si es un mensaje de la base (la columna admite 40 caracteres)
    void logWhatsappMessage(slug, { memberId: s.id, phone: s.phone!, body: text, templateKey: templateKey && templateKey.length <= 40 ? templateKey : null })
  }

  const saveTemplate = async () => {
    setSaving('busy')
    const res = await quickSaveTemplate(slug, { label: saveLabel, body })
    if (res.ok) {
      setList((prev) => [res.template, ...prev])
      setTemplateKey(res.template.key)
      setSaving('closed')
      setSaveLabel('')
      setSaveMsg({ ok: true, text: `Guardado en tus mensajes como «${res.template.label}».` })
    } else {
      setSaving('open')
      setSaveMsg({ ok: false, text: res.message })
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openComposer}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#25D366]/60 bg-[#25D366]/10 px-4 text-sm font-bold text-[#7ee2a8] hover:bg-[#25D366]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]"
      >
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        {buttonLabel}
      </button>
    )
  }

  const editedTemplate = templateKey !== null && list.find((t) => t.key === templateKey)?.body !== body
  const canSave = body.trim().length > 0 && (templateKey === null || editedTemplate)

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
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">1 · Elegí un mensaje predefinido o escribí uno</p>
            <div className="flex flex-wrap gap-2">
              {list.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => pickTemplate(t.key)}
                  aria-pressed={templateKey === t.key}
                  title={t.mine ? 'Mensaje tuyo' : 'Mensaje del gimnasio'}
                  className={`min-h-[40px] rounded-xl border px-3 text-sm ${
                    templateKey === t.key
                      ? 'border-[#edcc36] bg-[#edcc36] font-semibold text-black'
                      : t.mine
                        ? 'border-[#edcc36]/40 text-zinc-200 hover:border-[#edcc36]'
                        : 'border-zinc-800 text-zinc-300 hover:border-zinc-600'
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
                  setSaveMsg(null)
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
              <strong className="text-zinc-300">{'{nombre}'}</strong> se cambia por el nombre de cada uno
              {classInfo ? (
                <>
                  ; <strong className="text-zinc-300">{'{clase}'}</strong>, <strong className="text-zinc-300">{'{dia}'}</strong> y{' '}
                  <strong className="text-zinc-300">{'{hora}'}</strong> por los de esta clase
                </>
              ) : null}
              . Completá lo que esté entre [corchetes].
            </p>

            {/* Guardar como predefinido */}
            {canSave && saving === 'closed' && (
              <button
                type="button"
                onClick={() => {
                  setSaving('open')
                  setSaveMsg(null)
                }}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-zinc-700 px-3 text-xs font-semibold text-zinc-200 hover:border-[#edcc36]/60"
              >
                <BookmarkPlus className="h-4 w-4 text-[#edcc36]" aria-hidden="true" /> Guardar como mensaje predefinido
              </button>
            )}
            {saving !== 'closed' && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#edcc36]/30 p-2">
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Nombre del mensaje</span>
                  <input
                    value={saveLabel}
                    onChange={(e) => setSaveLabel(e.target.value)}
                    maxLength={40}
                    autoFocus
                    placeholder="Nombre corto, ej. «Recordatorio sábado»"
                    className="min-h-[40px] w-full rounded-lg border border-zinc-800 bg-black px-3 text-sm text-white placeholder:text-zinc-600 focus:border-[#edcc36] focus:outline-none"
                  />
                </label>
                <button
                  type="button"
                  disabled={saving === 'busy' || !saveLabel.trim()}
                  onClick={saveTemplate}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#edcc36] px-3 text-sm font-bold text-black disabled:opacity-50"
                >
                  {saving === 'busy' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Guardar
                </button>
                <button type="button" onClick={() => setSaving('closed')} className="min-h-[40px] px-2 text-xs text-zinc-400 hover:text-white">
                  Cancelar
                </button>
              </div>
            )}
            {saveMsg && (
              <p role={saveMsg.ok ? 'status' : 'alert'} className={`text-xs ${saveMsg.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                {saveMsg.text}
              </p>
            )}

            {body && preview && (
              <div className="rounded-xl bg-[#0b3d2a]/50 p-3 text-sm text-zinc-100">
                <p className="mb-1 text-[11px] uppercase tracking-wide text-[#7ee2a8]">Así le llega a {preview.name.split(' ')[0]}</p>
                <p className="whitespace-pre-line">{fillMessage(body, vars(preview.name))}</p>
              </div>
            )}
          </div>

          {/* 2 · Para quién */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">2 · ¿A quién se lo mandás?</p>
            <div className="flex flex-wrap items-center gap-2">
              {filters.length > 1 &&
                filters.map((f) => (
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
              {filters.length > 1 && <span className="mx-1 h-5 w-px bg-zinc-800" aria-hidden="true" />}
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

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!body.trim() || recipients.length === 0}
              onClick={() => setStep('send')}
              className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] text-base font-extrabold text-black disabled:opacity-40"
            >
              <Send className="h-5 w-5" aria-hidden="true" /> Preparar envío ({recipients.length})
            </button>
            <InfoTip label="Preparar envío">
              <p><strong>Todavía no manda nada.</strong> Arma la lista de las personas que marcaste, cada una con el mensaje personalizado con su nombre.</p>
              <p>Después tocás cada nombre: se abre tu WhatsApp con el mensaje escrito, lo enviás vos y volvés para el siguiente. Sale desde tu número.</p>
            </InfoTip>
          </div>
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
              const text = fillMessage(body, vars(s.name))
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
