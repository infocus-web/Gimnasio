import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { BuffetPublic } from './types'

/**
 * Cliente sin tipos para las tablas y funciones del buffet (0052): todavía no están en
 * src/types/database.types.ts. Al regenerar los tipos (npm run db:types) se puede sacar.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LooseDb = SupabaseClient<any, 'public', 'public', any, any>
export async function buffetDb(): Promise<LooseDb> {
  return (await createClient()) as unknown as LooseDb
}

/** Carta y menú de los próximos días. null = buffet apagado (o la migración 0052 todavía no se aplicó). */
export async function getBuffetPublic(slug: string): Promise<BuffetPublic | null> {
  const db = await buffetDb()
  const { data, error } = await db.rpc('buffet_public', { p_slug: slug })
  if (error) {
    if (!/does not exist|Could not find/i.test(error.message)) console.error('[buffet]', error.message)
    return null
  }
  return (data as BuffetPublic | null) ?? null
}
