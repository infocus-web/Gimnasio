import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { NO_CASH_DISCOUNT, type CashDiscount } from './cash-discount'

/** Configuración de precio online / descuento en efectivo del gimnasio (pública, sin login). */
export const getCashDiscount = cache(async (slug: string): Promise<CashDiscount> => {
  const supabase = await createClient()
  const db = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
  }
  const { data, error } = await db.rpc('mp_surcharge_info', { p_slug: slug })
  if (error || !data) return NO_CASH_DISCOUNT
  const d = data as Partial<CashDiscount>
  return { mode: d.mode ?? 'none', fixed_cents: Number(d.fixed_cents ?? 0), pct: Number(d.pct ?? 0) }
})
