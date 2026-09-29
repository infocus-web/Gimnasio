import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database.types'

/** Cliente para Client Components (realtime de cupos, QR que se refresca, etc.). */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
