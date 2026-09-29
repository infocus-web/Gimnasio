import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { voidPayment } from '@/features/admin/billing-actions'
import { fmtTime, formatMoney, startOfToday, todayYMD } from '@/features/admin/format'
import { METHOD_LABELS, VoidPaymentForm } from '@/features/admin/PaymentForms'

export const metadata: Metadata = { title: 'Caja' }

function shiftDay(ymd: string, days: number) {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export default async function CajaPage({ params, searchParams }: PageProps<'/[org]/admin/pagos'>) {
  const { org: slug } = await params
  const sp = await searchParams
  const ctx = (await getAdminContext(slug))!
  if (!ctx.can('billing.read')) return <p className="text-sm text-zinc-400">No tenés permiso para ver la caja.</p>

  const tz = ctx.org.timezone
  const today = todayYMD(tz)
  const day = typeof sp.dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.dia) ? sp.dia : today
  // Rango del día en la zona del gimnasio
  const offsetMs = Date.parse(`${today}T00:00:00Z`) - Date.parse(startOfToday(tz))
  const from = new Date(Date.parse(`${day}T00:00:00Z`) - offsetMs).toISOString()
  const to = new Date(Date.parse(`${shiftDay(day, 1)}T00:00:00Z`) - offsetMs).toISOString()

  const supabase = await createClient()
  const { data: rows } = await supabase
    .from('payment_ledger')
    .select('id, paid_at, amount_cents, currency, provider, status, note, payer_member_id, payer_name, plan_name, recorded_by_name')
    .eq('org_id', ctx.org.id)
    .gte('paid_at', from)
    .lt('paid_at', to)
    .order('paid_at', { ascending: false })

  const ok = (rows ?? []).filter((r) => r.status === 'succeeded')
  const total = ok.reduce((s, r) => s + Number(r.amount_cents), 0)
  const byMethod = new Map<string, number>()
  for (const r of ok) byMethod.set(r.provider!, (byMethod.get(r.provider!) ?? 0) + Number(r.amount_cents))
  const label = new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(`${day}T12:00:00Z`),
  )
  const canVoid = ctx.can('billing.write')

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/${slug}/admin/pagos?dia=${shiftDay(day, -1)}` as Route} aria-label="Día anterior"
          className="grid h-11 w-11 place-items-center rounded-xl border border-zinc-800 text-zinc-300 hover:text-white">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div className="text-center">
          <p className="text-sm font-semibold capitalize text-white">{day === today ? `Hoy, ${label}` : label}</p>
          {day !== today && (
            <Link href={`/${slug}/admin/pagos` as Route} className="text-xs text-[#edcc36]">
              Volver a hoy
            </Link>
          )}
        </div>
        <Link href={`/${slug}/admin/pagos?dia=${shiftDay(day, 1)}` as Route} aria-label="Día siguiente"
          className="grid h-11 w-11 place-items-center rounded-xl border border-zinc-800 text-zinc-300 hover:text-white">
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="col-span-2 rounded-2xl border border-[#edcc36]/30 bg-[#edcc36]/5 p-4 lg:col-span-1">
          <p className="text-xs text-zinc-400">Total cobrado</p>
          <p className="text-3xl font-extrabold tabular-nums text-white">{formatMoney(total)}</p>
          <p className="text-xs text-zinc-500">{ok.length} cobros</p>
        </div>
        {[...byMethod.entries()].map(([m, v]) => (
          <div key={m} className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4">
            <p className="text-xs text-zinc-400">{METHOD_LABELS[m] ?? m}</p>
            <p className="text-xl font-bold tabular-nums text-white">{formatMoney(v)}</p>
          </div>
        ))}
      </div>

      {rows && rows.length > 0 ? (
        <ul className="divide-y divide-zinc-900 overflow-hidden rounded-2xl border border-zinc-800/80">
          {rows.map((r) => (
            <li key={r.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 bg-black px-4 py-3 ${r.status !== 'succeeded' ? 'opacity-50' : ''}`}>
              <span className="w-12 shrink-0 text-xs tabular-nums text-zinc-500">{r.paid_at ? fmtTime(r.paid_at, tz) : ''}</span>
              <span className="min-w-0 flex-1">
                <Link href={`/${slug}/admin/socios/${r.payer_member_id}` as Route} className="font-semibold text-white hover:text-[#edcc36]">
                  {r.payer_name}
                </Link>
                <span className="block text-xs text-zinc-500">
                  {[r.plan_name, METHOD_LABELS[r.provider!] ?? r.provider, r.note, r.recorded_by_name && `cobró ${r.recorded_by_name}`]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <span className={`tabular-nums font-bold ${r.status === 'succeeded' ? 'text-white' : 'text-zinc-500 line-through'}`}>
                {formatMoney(Number(r.amount_cents), r.currency ?? 'ARS')}
              </span>
              {canVoid && r.status === 'succeeded' && <VoidPaymentForm action={voidPayment.bind(null, slug, r.id!)} />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          No hubo cobros este día. Los cobros se registran desde la ficha de cada socio.
        </p>
      )}
    </div>
  )
}
