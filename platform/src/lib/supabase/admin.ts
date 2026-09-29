import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

/**
 * Cliente con la SECRET KEY: saltea RLS.
 * Uso exclusivo: webhooks de pagos, crons y el worker de automatizaciones.
 * Nunca para responder a una acción de un usuario (para eso: ./server.ts).
 */
export function createAdminClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
