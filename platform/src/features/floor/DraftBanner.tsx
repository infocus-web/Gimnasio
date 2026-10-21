import { Sparkles, CheckCircle2 } from 'lucide-react'
import type { ActionState } from '@/features/admin/errors'
import { ActionButton } from '@/features/admin/ConfirmAction'

/** Aviso arriba del constructor cuando la rutina es un borrador sugerido por la IA. */
export function DraftBanner({ canEdit, action }: { canEdit: boolean; action: (prev: ActionState) => Promise<ActionState> }) {
  return (
    <div className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
      <p className="flex items-start gap-2 text-sm text-amber-100">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <strong>Borrador sugerido con IA.</strong> Revisá cada ejercicio, las series y las cargas; cambiá o quitá lo que no sirva para este alumno. Cuando
          esté bien, aprobala para poder asignarla.
        </span>
      </p>
      {canEdit && (
        <ActionButton
          action={action}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#edcc36] px-5 text-sm font-bold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Aprobar rutina
        </ActionButton>
      )}
    </div>
  )
}
