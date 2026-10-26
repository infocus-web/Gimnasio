'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Eye, Loader2, Mail, Save } from 'lucide-react'
import type { ActionState } from '@/features/admin/errors'
import { Notice, inputClass, useActionForm } from '@/features/admin/ui'
import { NOTICE_META, renderTemplate, sampleVars, type Notice as NoticeT } from './shared'

type FormAction = (prev: ActionState, form: FormData) => Promise<ActionState>

function ActionButton({ formAction, children, icon, primary }: { formAction: (f: FormData) => void; children: React.ReactNode; icon: React.ReactNode; primary?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      formAction={formAction}
      disabled={pending}
      className={
        primary
          ? 'btn-tac inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#edcc36] px-5 text-sm font-bold text-black disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white'
          : 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-semibold text-zinc-200 hover:border-[#edcc36]/60 hover:text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]'
      }
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  )
}

export function NoticeEditor({
  notice,
  orgName,
  giftDays,
  canManage,
  save,
  test,
}: {
  notice: NoticeT
  orgName: string
  giftDays: number
  canManage: boolean
  save: FormAction
  test: FormAction
}) {
  const meta = NOTICE_META[notice.kind]
  const [enabled, setEnabled] = useState(notice.enabled)
  const [subject, setSubject] = useState(notice.subject)
  const [body, setBody] = useState(notice.body)
  const [showPreview, setShowPreview] = useState(false)
  const [saveState, doSave] = useActionForm(save)
  const [testState, doTest] = useActionForm(test)
  const vars = sampleVars(notice.kind, orgName, 'Martina', giftDays)
  const id = `notice-${notice.kind}`

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4 sm:p-5">
      <form className="space-y-4">
        <input type="hidden" name="kind" value={notice.kind} />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-base font-bold text-white">{meta.title}</h2>
            <p className="mt-0.5 text-xs text-zinc-400">{meta.when}</p>
          </div>
          <label className="flex min-h-[44px] shrink-0 cursor-pointer items-center gap-2">
            <span className={`text-xs font-semibold ${enabled ? 'text-[#edcc36]' : 'text-zinc-500'}`}>{enabled ? 'Activado' : 'Apagado'}</span>
            <input
              type="checkbox"
              name="enabled"
              role="switch"
              aria-checked={enabled}
              aria-label={`Activar aviso ${meta.title}`}
              checked={enabled}
              disabled={!canManage}
              onChange={(e) => setEnabled(e.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className={`relative h-7 w-12 rounded-full border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[#edcc36] ${
                enabled ? 'border-[#edcc36] bg-[#edcc36]' : 'border-zinc-700 bg-zinc-900'
              } ${canManage ? '' : 'opacity-50'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full transition-all ${enabled ? 'left-6 bg-black' : 'left-0.5 bg-zinc-500'}`} />
            </span>
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-zinc-400">Asunto</span>
          <input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} readOnly={!canManage} maxLength={150} required className={inputClass} />
          {saveState.fieldErrors?.subject && <span className="block text-xs text-red-300">{saveState.fieldErrors.subject}</span>}
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-zinc-400">Texto del email</span>
          <textarea
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            readOnly={!canManage}
            maxLength={1500}
            rows={4}
            required
            className={`${inputClass} py-2 leading-relaxed`}
          />
          <span className="block text-xs text-zinc-500">
            Podés usar: {meta.vars.map((v) => <code key={v} className="mr-1.5 rounded bg-zinc-900 px-1 py-0.5 text-[11px] text-zinc-300">{v}</code>)}
          </span>
          {saveState.fieldErrors?.body && <span className="block text-xs text-red-300">{saveState.fieldErrors.body}</span>}
        </label>

        <div>
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            aria-expanded={showPreview}
            className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-[#edcc36] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
            {showPreview ? 'Ocultar vista previa' : 'Ver vista previa'}
          </button>
          {showPreview && (
            <div className="mt-2 overflow-hidden rounded-xl border border-zinc-800">
              <p className="btn-tac bg-[#edcc36] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wider text-black">{orgName}</p>
              <div className="space-y-2 bg-black p-4">
                <p className="text-base font-bold text-white">{renderTemplate(subject, vars)}</p>
                {renderTemplate(body, vars)
                  .split('\n')
                  .filter((l) => l.trim())
                  .map((l, i) => (
                    <p key={i} className="text-sm leading-relaxed text-zinc-300">{l}</p>
                  ))}
                <span className="btn-tac mt-2 inline-block rounded-lg bg-[#edcc36] px-4 py-2 text-sm font-bold text-black">Abrir la app</span>
                <p className="pt-1 text-[11px] text-zinc-600">Ejemplo con datos de muestra (socia &quot;Martina&quot;).</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {canManage && (
            <ActionButton formAction={doSave} primary icon={<Save className="h-4 w-4" aria-hidden="true" />}>
              Guardar
            </ActionButton>
          )}
          <ActionButton formAction={doTest} icon={<Mail className="h-4 w-4" aria-hidden="true" />}>
            Enviar prueba a mi email
          </ActionButton>
        </div>
        <Notice state={saveState} />
        <Notice state={testState} />
      </form>
    </section>
  )
}
