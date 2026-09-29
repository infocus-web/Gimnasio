/**
 * Tipos de la base de datos.
 *
 * ⚠️ Este archivo se GENERA con `npm run db:types` (supabase gen types) una vez
 * aplicadas las migraciones 0005–0009 en el proyecto de Supabase. Esta versión
 * mínima, escrita a mano, cubre solo lo que usa el módulo de reservas para que
 * el proyecto compile antes de aplicar las migraciones.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type BookingStatus = 'booked' | 'waitlisted' | 'canceled' | 'late_canceled' | 'checked_in' | 'no_show'

export type Database = {
  __InternalSupabase: { PostgrestVersion: '13' }
  public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      book_class: {
        Args: {
          p_session_id: string
          p_member_id?: string | null
          p_equipment_id?: string | null
          p_idempotency_key?: string | null
          p_allow_waitlist?: boolean
        }
        Returns: Json
      }
      cancel_booking: {
        Args: { p_booking_id: string }
        Returns: Json
      }
      get_checkin_token: {
        Args: { p_member_id?: string | null; p_org_id?: string | null }
        Returns: Json
      }
    }
    Enums: {
      booking_status: BookingStatus
      staff_role: 'owner' | 'admin' | 'staff' | 'trainer'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
