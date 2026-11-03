'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Loader2, MessageSquareHeart, X } from 'lucide-react'
import { useMember } from './MemberProvider'

/**
 * Encuesta NPS dentro de la app (a los 30 días del alta y una vez por trimestre).
 * Siempre la responde el propio socio (nunca por un familiar). "Ahora no" la saltea hasta el próximo trimestre.
 */
export function SurveyPrompt() {
  const { supabase, meId, org } = useMember()
  const [campaign, setCampaign] = useState<string | null>(null)
  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<null | 'thanks'>(null)
  const [error, setError] = useState<string | null>(null)
  const pathname = usePathname()
  // No tapar el pase de acceso ni el entrenamiento en curso
  const hidden = /\/app\/(pase|entrenar)(\/|$)/.test(pathname ?? '')

  useEffect(() => {
    let cancelled = false
    void supabase.rpc('member_survey', { p_member: meId }).then(({ data }) => {
      if (!cancelled && data && typeof data === 'object' && 'campaign' in data) setCampaign(String((data as { campaign: string }).campaign))
    })
    return () => {
      cancelled = true
    }
  }, [supabase, meId])

  async function send(withScore: boolean) {
    if (!campaign || busy) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('survey_answer', {
      p_member: meId,
      p_campaign: campaign,
      p_score: withScore ? score : null,
      p_comment: withScore ? comment : null,
    })
    setBusy(false)
    if (error && !/SURVEY_NOT_PENDING/.test(error.message)) {
      setError('No se pudo enviar. Probá de nuevo.')
      return
    }
    if (withScore) setDone('thanks')
    else setCampaign(null)
  }

  if (done) {
    return (
      <div role="status" className="mb-4 flex items-start justify-between gap-3 rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
        <span>¡Gracias por tu respuesta! La leemos todas para mejorar.</span>
        <button type="button" onClick={() => { setDone(null); setCampaign(null) }} aria-label="Cerrar" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-emerald-500/20">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    )
  }
  if (!campaign || hidden) return null

  const tone = (n: number) => (n <= 6 ? 'hover:border-red-400' : n <= 8 ? 'hover:border-zinc-400' : 'hover:border-emerald-400')

  return (
    <section aria-labelledby="nps-title" className="mb-4 space-y-3 rounded-3xl border border-[#edcc36]/40 bg-zinc-950 p-4">
      <div className="flex items-start gap-2">
        <MessageSquareHeart className="mt-0.5 h-5 w-5 shrink-0 text-[#edcc36]" aria-hidden="true" />
        <h2 id="nps-title" className="text-sm font-bold text-white">
          Del 0 al 10, ¿cuánto recomendarías {org.name} a un amigo?
        </h2>
      </div>
      <div className="grid grid-cols-11 gap-1" role="radiogroup" aria-label="Puntaje de 0 a 10">
        {Array.from({ length: 11 }, (_, n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={score === n}
            onClick={() => setScore(n)}
            className={`min-h-[44px] rounded-lg border text-sm font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36] ${
              score === n ? 'border-[#edcc36] bg-[#edcc36] text-black' : `border-zinc-800 bg-zinc-900 text-zinc-200 ${tone(n)}`
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-zinc-500">
        <span>Nada probable</span>
        <span>Muy probable</span>
      </div>
      {score !== null && (
        <label className="block space-y-1">
          <span className="text-xs text-zinc-400">{score <= 6 ? '¿Qué podemos mejorar?' : score <= 8 ? '¿Qué le falta para ser un 10?' : '¿Qué es lo que más te gusta?'} (opcional)</span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            rows={2}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus-visible:border-[#edcc36] focus-visible:outline-none"
          />
        </label>
      )}
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => void send(false)} disabled={busy} className="min-h-[44px] px-1 text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-60">
          Ahora no
        </button>
        <button
          type="button"
          onClick={() => void send(true)}
          disabled={busy || score === null}
          className="btn-tac inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#edcc36] px-5 text-sm font-bold text-black disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Enviar
        </button>
      </div>
    </section>
  )
}
