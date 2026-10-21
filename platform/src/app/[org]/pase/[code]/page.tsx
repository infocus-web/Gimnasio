import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { Ticket } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PASS_KIND, type PassKind, type PassStatus } from '@/features/access-plus/labels'

/** Página pública del pase (link que se manda por WhatsApp). No se indexa ni se guarda en caché. */
export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Tu pase',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
}
export const viewport: Viewport = { themeColor: '#000000' }

interface PublicPass {
  gym: string
  timezone: string
  code: string
  kind: PassKind
  holder_name: string
  valid_from: string
  valid_until: string
  max_entries: number
  entries_used: number
  status: PassStatus
  qr: string | null
}

const STATUS_TEXT: Record<PassStatus, string> = {
  valid: '',
  upcoming: 'Todavía no está habilitado: vas a poder entrar desde la fecha indicada.',
  used: 'Ya usaste todas las entradas de este pase.',
  expired: 'Este pase está vencido.',
  revoked: 'Este pase fue anulado. Consultá en recepción.',
}

export default async function PublicPassPage({ params }: PageProps<'/[org]/pase/[code]'>) {
  const { org: slug, code } = await params
  const supabase = await createClient()
  const { data } = await supabase.rpc('day_pass_public', { p_slug: slug, p_code: code })
  const pass = data as PublicPass | null
  if (!pass) notFound()

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat('es-AR', { timeZone: pass.timezone, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  const qr = pass.qr ? await QRCode.toDataURL(pass.qr, { margin: 2, width: 560, errorCorrectionLevel: 'M' }) : null
  const left = Math.max(0, pass.max_entries - pass.entries_used)

  return (
    <main className="flex min-h-dvh flex-col items-center bg-black px-4 py-8 text-center text-white">
      <p className="text-xs uppercase tracking-widest text-zinc-500">{pass.gym}</p>
      <h1 className="mt-2 text-2xl font-extrabold">{pass.holder_name}</h1>
      <p className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-[#edcc36]/40 bg-[#edcc36]/10 px-3 py-1 text-sm font-semibold text-[#edcc36]">
        <Ticket className="h-4 w-4" aria-hidden="true" /> {PASS_KIND[pass.kind]}
      </p>

      {qr ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt="Código QR del pase para mostrar en el molinete"
            className="mt-6 aspect-square w-full max-w-[340px] rounded-3xl bg-white p-3"
          />
          <p className="mt-4 max-w-sm text-lg font-semibold">Mostrá este QR en la cámara del molinete.</p>
          <p className="mt-1 text-sm text-zinc-400">Subí el brillo de la pantalla para que lo lea más rápido.</p>
        </>
      ) : (
        <p role="status" className="mt-8 max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-zinc-200">
          {STATUS_TEXT[pass.status] || 'Este pase no está disponible.'}
        </p>
      )}

      <dl className="mt-6 w-full max-w-sm space-y-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-left text-sm">
        {pass.status === 'upcoming' && (
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Desde</dt>
            <dd className="text-right text-zinc-200">{fmt(pass.valid_from)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500">Válido hasta</dt>
          <dd className="text-right text-zinc-200">{fmt(pass.valid_until)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500">Entradas</dt>
          <dd className="text-right text-zinc-200">
            {left} de {pass.max_entries} {pass.max_entries === 1 ? 'disponible' : 'disponibles'}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500">Código</dt>
          <dd className="font-mono text-zinc-200">{pass.code}</dd>
        </div>
      </dl>
      <p className="mt-6 max-w-sm text-xs text-zinc-600">Si el molinete no lee el código, pasá por recepción y mostrá esta pantalla.</p>
    </main>
  )
}
