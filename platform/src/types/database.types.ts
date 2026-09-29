export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      access_commands: {
        Row: {
          attempts: number
          command: string
          created_at: string
          device_id: string
          done_at: string | null
          id: number
          kind: string
          member_id: string | null
          org_id: string
          pin: number | null
          return_code: number | null
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          command: string
          created_at?: string
          device_id: string
          done_at?: string | null
          id?: never
          kind: string
          member_id?: string | null
          org_id: string
          pin?: number | null
          return_code?: number | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          command?: string
          created_at?: string
          device_id?: string
          done_at?: string | null
          id?: never
          kind?: string
          member_id?: string | null
          org_id?: string
          pin?: number | null
          return_code?: number | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_commands_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "access_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      access_device_log: {
        Row: {
          body: string | null
          created_at: string
          id: number
          ip: string | null
          method: string | null
          path: string | null
          query: string | null
          result: string | null
          serial: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: never
          ip?: string | null
          method?: string | null
          path?: string | null
          query?: string | null
          result?: string | null
          serial?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: never
          ip?: string | null
          method?: string | null
          path?: string | null
          query?: string | null
          result?: string | null
          serial?: string | null
        }
        Relationships: []
      }
      access_device_users: {
        Row: {
          device_id: string
          has_bio: boolean
          managed: boolean
          member_id: string | null
          name: string | null
          org_id: string
          pin: number
          state: string
          updated_at: string
        }
        Insert: {
          device_id: string
          has_bio?: boolean
          managed?: boolean
          member_id?: string | null
          name?: string | null
          org_id: string
          pin: number
          state?: string
          updated_at?: string
        }
        Update: {
          device_id?: string
          has_bio?: boolean
          managed?: boolean
          member_id?: string | null
          name?: string | null
          org_id?: string
          pin?: number
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_device_users_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "access_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_device_users_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "coach_client_overview"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "access_device_users_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_device_users_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_device_users_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "payment_ledger"
            referencedColumns: ["payer_member_id"]
          },
        ]
      }
      access_devices: {
        Row: {
          active: boolean
          attlog_stamp: string | null
          created_at: string
          id: string
          info: Json
          last_ip: string | null
          last_seen_at: string | null
          location_id: string
          name: string
          operlog_stamp: string | null
          org_id: string
          pending_ip: string | null
          pending_ip_at: string | null
          serial_number: string
          trusted_ip: string | null
        }
        Insert: {
          active?: boolean
          attlog_stamp?: string | null
          created_at?: string
          id?: string
          info?: Json
          last_ip?: string | null
          last_seen_at?: string | null
          location_id: string
          name?: string
          operlog_stamp?: string | null
          org_id: string
          pending_ip?: string | null
          pending_ip_at?: string | null
          serial_number: string
          trusted_ip?: string | null
        }
        Update: {
          active?: boolean
          attlog_stamp?: string | null
          created_at?: string
          id?: string
          info?: Json
          last_ip?: string | null
          last_seen_at?: string | null
          location_id?: string
          name?: string
          operlog_stamp?: string | null
          org_id?: string
          pending_ip?: string | null
          pending_ip_at?: string | null
          serial_number?: string
          trusted_ip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_devices_location_id_org_id_fkey"
            columns: ["location_id", "org_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "access_devices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      access_templates: {
        Row: {
          fields: string
          org_id: string
          pin: number
          pin_key: string
          source_device_id: string | null
          tbl: string
          tkey: string
          updated_at: string
        }
        Insert: {
          fields: string
          org_id: string
          pin: number
          pin_key?: string
          source_device_id?: string | null
          tbl: string
          tkey: string
          updated_at?: string
        }
        Update: {
          fields?: string
          org_id?: string
          pin?: number
          pin_key?: string
          source_device_id?: string | null
          tbl?: string
          tkey?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_templates_source_device_id_fkey"
            columns: ["source_device_id"]
            isOneToOne: false
            referencedRelation: "access_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      access_unknown_devices: {
        Row: {
          hits: number
          info: Json
          ip: string | null
          last_seen_at: string
          serial_number: string
        }
        Insert: {
          hits?: number
          info?: Json
          ip?: string | null
          last_seen_at?: string
          serial_number: string
        }
        Update: {
          hits?: number
          info?: Json
          ip?: string | null
          last_seen_at?: string
          serial_number?: string
        }
        Relationships: []
      }
      automation_runs: {
        Row: {
          created_at: string
          dedupe_key: string
          event_id: number | null
          id: number
          last_error: string | null
          member_id: string | null
          next_step: number
          org_id: string
          run_after: string
          status: string
          updated_at: string
          workflow_id: string
        }
        Insert: {
          created_at?: string
          dedupe_key: string
          event_id?: number | null
          id?: never
          last_error?: string | null
          member_id?: string | null
          next_step?: number
          org_id: string
          run_after?: string
          status?: string
          updated_at?: string
          workflow_id: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string
          event_id?: number | null
          id?: never
          last_error?: string | null
          member_id?: string | null
          next_step?: number
          org_id?: string
          run_after?: string
          status?: string
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "domain_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_workflow_id_org_id_fkey"
            columns: ["workflow_id", "org_id"]
            isOneToOne: false
            referencedRelation: "automation_workflows"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      automation_steps: {
        Row: {
          action: string
          config: Json
          id: string
          org_id: string
          position: number
          workflow_id: string
        }
        Insert: {
          action: string
          config?: Json
          id?: string
          org_id: string
          position: number
          workflow_id: string
        }
        Update: {
          action?: string
          config?: Json
          id?: string
          org_id?: string
          position?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_steps_workflow_id_org_id_fkey"
            columns: ["workflow_id", "org_id"]
            isOneToOne: false
            referencedRelation: "automation_workflows"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      automation_workflows: {
        Row: {
          active: boolean
          conditions: Json
          created_at: string
          id: string
          name: string
          org_id: string
          trigger: string
        }
        Insert: {
          active?: boolean
          conditions?: Json
          created_at?: string
          id?: string
          name: string
          org_id: string
          trigger: string
        }
        Update: {
          active?: boolean
          conditions?: Json
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_workflows_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_accounts: {
        Row: {
          created_at: string
          delinquent: boolean
          id: string
          org_id: string
          payer_member_id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_customer_id: string | null
        }
        Insert: {
          created_at?: string
          delinquent?: boolean
          id?: string
          org_id: string
          payer_member_id: string
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_customer_id?: string | null
        }
        Update: {
          created_at?: string
          delinquent?: boolean
          id?: string
          org_id?: string
          payer_member_id?: string
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_customer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_accounts_payer_member_id_org_id_fkey"
            columns: ["payer_member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "coach_client_overview"
            referencedColumns: ["member_id", "org_id"]
          },
          {
            foreignKeyName: "billing_accounts_payer_member_id_org_id_fkey"
            columns: ["payer_member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "billing_accounts_payer_member_id_org_id_fkey"
            columns: ["payer_member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      body_metrics: {
        Row: {
          body_fat_pct: number | null
          id: string
          measured_at: string
          measurements: Json
          member_id: string
          org_id: string
          weight_kg: number | null
        }
        Insert: {
          body_fat_pct?: number | null
          id?: string
          measured_at?: string
          measurements?: Json
          member_id: string
          org_id: string
          weight_kg?: number | null
        }
        Update: {
          body_fat_pct?: number | null
          id?: string
          measured_at?: string
          measurements?: Json
          member_id?: string
          org_id?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "body_metrics_member_id_org_id_fkey"
            columns: ["member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "coach_client_overview"
            referencedColumns: ["member_id", "org_id"]
          },
          {
            foreignKeyName: "body_metrics_member_id_org_id_fkey"
            columns: ["member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "body_metrics_member_id_org_id_fkey"
            columns: ["member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      bookings: {
        Row: {
          booked_by: string | null
          canceled_at: string | null
          checked_in_at: string | null
          created_at: string
          credit_consumed: boolean
          during: unknown
          equipment_id: string | null
          id: string
          idempotency_key: string | null
          member_id: string
          membership_id: string | null
          org_id: string
          session_id: string
          source: string
          status: Database["public"]["Enums"]["booking_status"]
          waitlist_position: number | null
        }
        Insert: {
          booked_by?: string | null
          canceled_at?: string | null
          checked_in_at?: string | null
          created_at?: string
          credit_consumed?: boolean
          during: unknown
          equipment_id?: string | null
          id?: string
          idempotency_key?: string | null
          member_id: string
          membership_id?: string | null
          org_id: string
          session_id: string
          source?: string
          status?: Database["public"]["Enums"]["booking_status"]
          waitlist_position?: number | null
        }
        Update: {
          booked_by?: string | null
          canceled_at?: string | null
          checked_in_at?: string | null
          created_at?: string
          credit_consumed?: boolean
          during?: unknown
          equipment_id?: string | null
          id?: string
          idempotency_key?: string | null
          member_id?: string
          membership_id?: string | null
          org_id?: string
          session_id?: string
          source?: string
          status?: Database["public"]["Enums"]["booking_status"]
          waitlist_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_equipment_id_org_id_fkey"
            columns: ["equipment_id", "org_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "bookings_member_id_org_id_fkey"
            columns: ["member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "coach_client_overview"
            referencedColumns: ["member_id", "org_id"]
          },
          {
            foreignKeyName: "bookings_member_id_org_id_fkey"
            columns: ["member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "bookings_member_id_org_id_fkey"
            columns: ["member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "bookings_membership_id_org_id_fkey"
            columns: ["membership_id", "org_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "bookings_session_id_org_id_fkey"
            columns: ["session_id", "org_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "bookings_session_id_org_id_fkey"
            columns: ["session_id", "org_id"]
            isOneToOne: false
            referencedRelation: "class_sessions_availability"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      checkins: {
        Row: {
          allowed: boolean
          booking_id: string | null
          created_at: string
          id: number
          location_id: string
          member_id: string
          method: Database["public"]["Enums"]["checkin_method"]
          org_id: string
          reason: string | null
          scanned_by: string | null
        }
        Insert: {
          allowed: boolean
          booking_id?: string | null
          created_at?: string
          id?: never
          location_id: string
          member_id: string
          method: Database["public"]["Enums"]["checkin_method"]
          org_id: string
          reason?: string | null
          scanned_by?: string | null
        }
        Update: {
          allowed?: boolean
          booking_id?: string | null
          created_at?: string
          id?: never
          location_id?: string
          member_id?: string
          method?: Database["public"]["Enums"]["checkin_method"]
          org_id?: string
          reason?: string | null
          scanned_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkins_booking_id_org_id_fkey"
            columns: ["booking_id", "org_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "checkins_booking_id_org_id_fkey"
            columns: ["booking_id", "org_id"]
            isOneToOne: false
            referencedRelation: "session_roster"
            referencedColumns: ["booking_id", "org_id"]
          },
          {
            foreignKeyName: "checkins_location_id_org_id_fkey"
            columns: ["location_id", "org_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "checkins_member_id_org_id_fkey"
            columns: ["member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "coach_client_overview"
            referencedColumns: ["member_id", "org_id"]
          },
          {
            foreignKeyName: "checkins_member_id_org_id_fkey"
            columns: ["member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "checkins_member_id_org_id_fkey"
            columns: ["member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      class_series: {
        Row: {
          capacity: number
          class_type_id: string
          duration_min: number
          id: string
          instructor_id: string
          org_id: string
          room_id: string
          start_time: string
          valid_from: string
          valid_until: string | null
          weekday: number
        }
        Insert: {
          capacity: number
          class_type_id: string
          duration_min: number
          id?: string
          instructor_id: string
          org_id: string
          room_id: string
          start_time: string
          valid_from?: string
          valid_until?: string | null
          weekday: number
        }
        Update: {
          capacity?: number
          class_type_id?: string
          duration_min?: number
          id?: string
          instructor_id?: string
          org_id?: string
          room_id?: string
          start_time?: string
          valid_from?: string
          valid_until?: string | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "class_series_class_type_id_org_id_fkey"
            columns: ["class_type_id", "org_id"]
            isOneToOne: false
            referencedRelation: "class_types"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "class_series_instructor_id_org_id_fkey"
            columns: ["instructor_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "class_series_room_id_org_id_fkey"
            columns: ["room_id", "org_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      class_sessions: {
        Row: {
          booking_closes_min: number
          booking_opens_at: string | null
          cancel_reason: string | null
          capacity: number
          class_type_id: string
          created_at: string
          during: unknown
          ends_at: string
          id: string
          instructor_id: string
          org_id: string
          room_id: string
          series_id: string | null
          starts_at: string
          status: Database["public"]["Enums"]["session_status"]
          waitlist_capacity: number
        }
        Insert: {
          booking_closes_min?: number
          booking_opens_at?: string | null
          cancel_reason?: string | null
          capacity: number
          class_type_id: string
          created_at?: string
          during?: unknown
          ends_at: string
          id?: string
          instructor_id: string
          org_id: string
          room_id: string
          series_id?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["session_status"]
          waitlist_capacity?: number
        }
        Update: {
          booking_closes_min?: number
          booking_opens_at?: string | null
          cancel_reason?: string | null
          capacity?: number
          class_type_id?: string
          created_at?: string
          during?: unknown
          ends_at?: string
          id?: string
          instructor_id?: string
          org_id?: string
          room_id?: string
          series_id?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          waitlist_capacity?: number
        }
        Relationships: [
          {
            foreignKeyName: "class_sessions_class_type_id_org_id_fkey"
            columns: ["class_type_id", "org_id"]
            isOneToOne: false
            referencedRelation: "class_types"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "class_sessions_instructor_id_org_id_fkey"
            columns: ["instructor_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "class_sessions_room_id_org_id_fkey"
            columns: ["room_id", "org_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "class_sessions_series_id_org_id_fkey"
            columns: ["series_id", "org_id"]
            isOneToOne: false
            referencedRelation: "class_series"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      class_types: {
        Row: {
          active: boolean
          color: string
          default_capacity: number
          default_duration_min: number
          description: string | null
          equipment_kind: string | null
          id: string
          image_url: string | null
          name: string
          org_id: string
        }
        Insert: {
          active?: boolean
          color?: string
          default_capacity?: number
          default_duration_min?: number
          description?: string | null
          equipment_kind?: string | null
          id?: string
          image_url?: string | null
          name: string
          org_id: string
        }
        Update: {
          active?: boolean
          color?: string
          default_capacity?: number
          default_duration_min?: number
          description?: string | null
          equipment_kind?: string | null
          id?: string
          image_url?: string | null
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_events: {
        Row: {
          attempts: number
          id: number
          member_id: string | null
          occurred_at: string
          org_id: string
          payload: Json
          processed_at: string | null
          type: string
        }
        Insert: {
          attempts?: number
          id?: never
          member_id?: string | null
          occurred_at?: string
          org_id: string
          payload?: Json
          processed_at?: string | null
          type: string
        }
        Update: {
          attempts?: number
          id?: never
          member_id?: string | null
          occurred_at?: string
          org_id?: string
          payload?: Json
          processed_at?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "domain_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          grid_col: number | null
          grid_row: number | null
          id: string
          kind: string
          label: string
          location_id: string
          org_id: string
          room_id: string | null
          status: Database["public"]["Enums"]["equipment_status"]
        }
        Insert: {
          grid_col?: number | null
          grid_row?: number | null
          id?: string
          kind: string
          label: string
          location_id: string
          org_id: string
          room_id?: string | null
          status?: Database["public"]["Enums"]["equipment_status"]
        }
        Update: {
          grid_col?: number | null
          grid_row?: number | null
          id?: string
          kind?: string
          label?: string
          location_id?: string
          org_id?: string
          room_id?: string | null
          status?: Database["public"]["Enums"]["equipment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "equipment_location_id_org_id_fkey"
            columns: ["location_id", "org_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "equipment_room_id_org_id_fkey"
            columns: ["room_id", "org_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      exercises: {
        Row: {
          created_at: string
          created_by: string | null
          equipment: string | null
          id: string
          instructions: string | null
          muscle_group: string | null
          name: string
          org_id: string | null
          thumbnail_url: string | null
          video_url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          equipment?: string | null
          id?: string
          instructions?: string | null
          muscle_group?: string | null
          name: string
          org_id?: string | null
          thumbnail_url?: string | null
          video_url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          equipment?: string | null
          id?: string
          instructions?: string | null
          muscle_group?: string | null
          name?: string
          org_id?: string | null
          thumbnail_url?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercises_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_due_cents: number
          amount_paid_cents: number
          billing_account_id: string
          created_at: string
          currency: string
          due_at: string | null
          id: string
          membership_id: string | null
          number: string | null
          org_id: string
          period_end: string | null
          period_start: string | null
          provider: Database["public"]["Enums"]["payment_provider"] | null
          provider_invoice_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
        }
        Insert: {
          amount_due_cents: number
          amount_paid_cents?: number
          billing_account_id: string
          created_at?: string
          currency: string
          due_at?: string | null
          id?: string
          membership_id?: string | null
          number?: string | null
          org_id: string
          period_end?: string | null
          period_start?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"] | null
          provider_invoice_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
        }
        Update: {
          amount_due_cents?: number
          amount_paid_cents?: number
          billing_account_id?: string
          created_at?: string
          currency?: string
          due_at?: string | null
          id?: string
          membership_id?: string | null
          number?: string | null
          org_id?: string
          period_end?: string | null
          period_start?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"] | null
          provider_invoice_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
        }
        Relationships: [
          {
            foreignKeyName: "invoices_billing_account_id_org_id_fkey"
            columns: ["billing_account_id", "org_id"]
            isOneToOne: false
            referencedRelation: "billing_accounts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "invoices_membership_id_org_id_fkey"
            columns: ["membership_id", "org_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          id: string
          name: string
          org_id: string
          timezone: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          name: string
          org_id: string
          timezone?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          timezone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      member_secrets: {
        Row: {
          member_id: string
          qr_secret: string
          rotated_at: string
        }
        Insert: {
          member_id: string
          qr_secret?: string
          rotated_at?: string
        }
        Update: {
          member_id?: string
          qr_secret?: string
          rotated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_secrets_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "coach_client_overview"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "member_secrets_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_secrets_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_secrets_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "payment_ledger"
            referencedColumns: ["payer_member_id"]
          },
        ]
      }
      members: {
        Row: {
          access_pin: number | null
          billing_account_id: string | null
          biometric_consent_at: string | null
          birth_date: string | null
          created_at: string
          document_id: string | null
          email: string | null
          emergency_contact: Json | null
          first_name: string
          home_location_id: string | null
          id: string
          last_checkin_at: string | null
          last_name: string
          medical_notes: string | null
          org_id: string
          phone: string | null
          photo_url: string | null
          status: Database["public"]["Enums"]["member_status"]
          tags: string[]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          access_pin?: number | null
          billing_account_id?: string | null
          biometric_consent_at?: string | null
          birth_date?: string | null
          created_at?: string
          document_id?: string | null
          email?: string | null
          emergency_contact?: Json | null
          first_name: string
          home_location_id?: string | null
          id?: string
          last_checkin_at?: string | null
          last_name?: string
          medical_notes?: string | null
          org_id: string
          phone?: string | null
          photo_url?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          tags?: string[]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          access_pin?: number | null
          billing_account_id?: string | null
          biometric_consent_at?: string | null
          birth_date?: string | null
          created_at?: string
          document_id?: string | null
          email?: string | null
          emergency_contact?: Json | null
          first_name?: string
          home_location_id?: string | null
          id?: string
          last_checkin_at?: string | null
          last_name?: string
          medical_notes?: string | null
          org_id?: string
          phone?: string | null
          photo_url?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          tags?: string[]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "members_billing_account_fk"
            columns: ["billing_account_id", "org_id"]
            isOneToOne: false
            referencedRelation: "billing_accounts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "members_home_location_id_org_id_fkey"
            columns: ["home_location_id", "org_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_members: {
        Row: {
          added_at: string
          member_id: string
          membership_id: string
          org_id: string
        }
        Insert: {
          added_at?: string
          member_id: string
          membership_id: string
          org_id: string
        }
        Update: {
          added_at?: string
          member_id?: string
          membership_id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_members_member_id_org_id_fkey"
            columns: ["member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "coach_client_overview"
            referencedColumns: ["member_id", "org_id"]
          },
          {
            foreignKeyName: "membership_members_member_id_org_id_fkey"
            columns: ["member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "membership_members_member_id_org_id_fkey"
            columns: ["member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "membership_members_membership_id_org_id_fkey"
            columns: ["membership_id", "org_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      membership_plans: {
        Row: {
          active: boolean
          billing_interval: string | null
          booking_window_days: number
          class_credits: number | null
          created_at: string
          credits_valid_days: number | null
          currency: string
          description: string | null
          id: string
          includes_open_gym: boolean
          interval_count: number
          is_public: boolean
          kind: Database["public"]["Enums"]["plan_kind"]
          max_bookings_per_week: number | null
          max_members: number
          name: string
          org_id: string
          price_cents: number
          provider_price_ids: Json
          sort: number
        }
        Insert: {
          active?: boolean
          billing_interval?: string | null
          booking_window_days?: number
          class_credits?: number | null
          created_at?: string
          credits_valid_days?: number | null
          currency: string
          description?: string | null
          id?: string
          includes_open_gym?: boolean
          interval_count?: number
          is_public?: boolean
          kind?: Database["public"]["Enums"]["plan_kind"]
          max_bookings_per_week?: number | null
          max_members?: number
          name: string
          org_id: string
          price_cents: number
          provider_price_ids?: Json
          sort?: number
        }
        Update: {
          active?: boolean
          billing_interval?: string | null
          booking_window_days?: number
          class_credits?: number | null
          created_at?: string
          credits_valid_days?: number | null
          currency?: string
          description?: string | null
          id?: string
          includes_open_gym?: boolean
          interval_count?: number
          is_public?: boolean
          kind?: Database["public"]["Enums"]["plan_kind"]
          max_bookings_per_week?: number | null
          max_members?: number
          name?: string
          org_id?: string
          price_cents?: number
          provider_price_ids?: Json
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "membership_plans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          billing_account_id: string
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          credits_remaining: number | null
          current_period_end: string
          current_period_start: string
          id: string
          org_id: string
          paused_until: string | null
          plan_id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_subscription_id: string | null
          started_at: string
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
        }
        Insert: {
          billing_account_id: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          credits_remaining?: number | null
          current_period_end: string
          current_period_start: string
          id?: string
          org_id: string
          paused_until?: string | null
          plan_id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_subscription_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
        }
        Update: {
          billing_account_id?: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          credits_remaining?: number | null
          current_period_end?: string
          current_period_start?: string
          id?: string
          org_id?: string
          paused_until?: string | null
          plan_id?: string
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_subscription_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_billing_account_id_org_id_fkey"
            columns: ["billing_account_id", "org_id"]
            isOneToOne: false
            referencedRelation: "billing_accounts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_plan_id_org_id_fkey"
            columns: ["plan_id", "org_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      organizations: {
        Row: {
          branding: Json
          busy_threshold: number
          country: string
          created_at: string
          currency: string
          default_payment_provider: Database["public"]["Enums"]["payment_provider"]
          grace_days: number
          id: string
          late_cancel_minutes: number
          name: string
          opening_hours: Json
          public_profile: Json
          qr_step_seconds: number
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          branding?: Json
          busy_threshold?: number
          country?: string
          created_at?: string
          currency?: string
          default_payment_provider?: Database["public"]["Enums"]["payment_provider"]
          grace_days?: number
          id?: string
          late_cancel_minutes?: number
          name: string
          opening_hours?: Json
          public_profile?: Json
          qr_step_seconds?: number
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          branding?: Json
          busy_threshold?: number
          country?: string
          created_at?: string
          currency?: string
          default_payment_provider?: Database["public"]["Enums"]["payment_provider"]
          grace_days?: number
          id?: string
          late_cancel_minutes?: number
          name?: string
          opening_hours?: Json
          public_profile?: Json
          qr_step_seconds?: number
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_cents: number
          billing_account_id: string
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          invoice_id: string | null
          note: string | null
          org_id: string
          paid_at: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_payment_id: string | null
          recorded_by: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          billing_account_id: string
          created_at?: string
          currency: string
          failure_reason?: string | null
          id?: string
          invoice_id?: string | null
          note?: string | null
          org_id: string
          paid_at?: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_payment_id?: string | null
          recorded_by?: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          billing_account_id?: string
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          invoice_id?: string | null
          note?: string | null
          org_id?: string
          paid_at?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_payment_id?: string | null
          recorded_by?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_billing_account_id_org_id_fkey"
            columns: ["billing_account_id", "org_id"]
            isOneToOne: false
            referencedRelation: "billing_accounts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "payments_invoice_id_org_id_fkey"
            columns: ["invoice_id", "org_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          description: string
        }
        Insert: {
          code: string
          description: string
        }
        Update: {
          code?: string
          description?: string
        }
        Relationships: []
      }
      plan_class_types: {
        Row: {
          class_type_id: string
          org_id: string
          plan_id: string
        }
        Insert: {
          class_type_id: string
          org_id: string
          plan_id: string
        }
        Update: {
          class_type_id?: string
          org_id?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_class_types_class_type_id_org_id_fkey"
            columns: ["class_type_id", "org_id"]
            isOneToOne: false
            referencedRelation: "class_types"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "plan_class_types_plan_id_org_id_fkey"
            columns: ["plan_id", "org_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      program_assignments: {
        Row: {
          created_at: string
          ends_on: string | null
          id: string
          member_id: string
          org_id: string
          program_id: string
          starts_on: string
          status: string
          trainer_id: string
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          id?: string
          member_id: string
          org_id: string
          program_id: string
          starts_on?: string
          status?: string
          trainer_id: string
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          id?: string
          member_id?: string
          org_id?: string
          program_id?: string
          starts_on?: string
          status?: string
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_assignments_member_id_org_id_fkey"
            columns: ["member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "coach_client_overview"
            referencedColumns: ["member_id", "org_id"]
          },
          {
            foreignKeyName: "program_assignments_member_id_org_id_fkey"
            columns: ["member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "program_assignments_member_id_org_id_fkey"
            columns: ["member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "program_assignments_program_id_org_id_fkey"
            columns: ["program_id", "org_id"]
            isOneToOne: false
            referencedRelation: "workout_programs"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "program_assignments_trainer_id_org_id_fkey"
            columns: ["trainer_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      program_exercises: {
        Row: {
          exercise_id: string
          id: string
          notes: string | null
          org_id: string
          position: number
          rest_seconds: number | null
          target_reps: string | null
          target_sets: number | null
          target_weight_kg: number | null
          workout_id: string
        }
        Insert: {
          exercise_id: string
          id?: string
          notes?: string | null
          org_id: string
          position?: number
          rest_seconds?: number | null
          target_reps?: string | null
          target_sets?: number | null
          target_weight_kg?: number | null
          workout_id: string
        }
        Update: {
          exercise_id?: string
          id?: string
          notes?: string | null
          org_id?: string
          position?: number
          rest_seconds?: number | null
          target_reps?: string | null
          target_sets?: number | null
          target_weight_kg?: number | null
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_exercises_workout_id_org_id_fkey"
            columns: ["workout_id", "org_id"]
            isOneToOne: false
            referencedRelation: "program_workouts"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      program_workouts: {
        Row: {
          day_index: number
          id: string
          name: string
          org_id: string
          program_id: string
        }
        Insert: {
          day_index: number
          id?: string
          name: string
          org_id: string
          program_id: string
        }
        Update: {
          day_index?: number
          id?: string
          name?: string
          org_id?: string
          program_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_workouts_program_id_org_id_fkey"
            columns: ["program_id", "org_id"]
            isOneToOne: false
            referencedRelation: "workout_programs"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission: string
          role: Database["public"]["Enums"]["staff_role"]
        }
        Insert: {
          permission: string
          role: Database["public"]["Enums"]["staff_role"]
        }
        Update: {
          permission?: string
          role?: Database["public"]["Enums"]["staff_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_fkey"
            columns: ["permission"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
        ]
      }
      rooms: {
        Row: {
          active: boolean
          capacity: number
          id: string
          location_id: string
          name: string
          org_id: string
        }
        Insert: {
          active?: boolean
          capacity: number
          id?: string
          location_id: string
          name: string
          org_id: string
        }
        Update: {
          active?: boolean
          capacity?: number
          id?: string
          location_id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_location_id_org_id_fkey"
            columns: ["location_id", "org_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      set_logs: {
        Row: {
          duration_s: number | null
          exercise_id: string
          id: number
          org_id: string
          reps: number | null
          rpe: number | null
          set_number: number
          weight_kg: number | null
          workout_log_id: string
        }
        Insert: {
          duration_s?: number | null
          exercise_id: string
          id?: never
          org_id: string
          reps?: number | null
          rpe?: number | null
          set_number: number
          weight_kg?: number | null
          workout_log_id: string
        }
        Update: {
          duration_s?: number | null
          exercise_id?: string
          id?: never
          org_id?: string
          reps?: number | null
          rpe?: number | null
          set_number?: number
          weight_kg?: number | null
          workout_log_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "set_logs_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "set_logs_workout_log_id_org_id_fkey"
            columns: ["workout_log_id", "org_id"]
            isOneToOne: false
            referencedRelation: "workout_logs"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      staff: {
        Row: {
          active: boolean
          bio: string | null
          created_at: string
          display_name: string
          document_id: string | null
          id: string
          org_id: string
          phone: string | null
          photo_url: string | null
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Insert: {
          active?: boolean
          bio?: string | null
          created_at?: string
          display_name: string
          document_id?: string | null
          id?: string
          org_id: string
          phone?: string | null
          photo_url?: string | null
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Update: {
          active?: boolean
          bio?: string | null
          created_at?: string
          display_name?: string
          document_id?: string | null
          id?: string
          org_id?: string
          phone?: string | null
          photo_url?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          display_name: string
          document_id: string | null
          email: string
          id: string
          invited_by: string | null
          org_id: string
          phone: string | null
          role: Database["public"]["Enums"]["staff_role"]
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          display_name: string
          document_id?: string | null
          email: string
          id?: string
          invited_by?: string | null
          org_id: string
          phone?: string | null
          role: Database["public"]["Enums"]["staff_role"]
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          display_name?: string
          document_id?: string | null
          email?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
        }
        Relationships: [
          {
            foreignKeyName: "staff_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_permission_overrides: {
        Row: {
          granted: boolean
          permission: string
          staff_id: string
        }
        Insert: {
          granted: boolean
          permission: string
          staff_id: string
        }
        Update: {
          granted?: boolean
          permission?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_permission_overrides_permission_fkey"
            columns: ["permission"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "staff_permission_overrides_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_requests: {
        Row: {
          created_at: string
          document_id: string
          email: string
          first_name: string
          id: string
          last_name: string
          message: string | null
          org_id: string
          phone: string
          requested_role: Database["public"]["Enums"]["staff_role"]
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          document_id: string
          email: string
          first_name: string
          id?: string
          last_name: string
          message?: string | null
          org_id: string
          phone: string
          requested_role: Database["public"]["Enums"]["staff_role"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          message?: string | null
          org_id?: string
          phone?: string
          requested_role?: Database["public"]["Enums"]["staff_role"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_clients: {
        Row: {
          member_id: string
          org_id: string
          since: string
          trainer_id: string
        }
        Insert: {
          member_id: string
          org_id: string
          since?: string
          trainer_id: string
        }
        Update: {
          member_id?: string
          org_id?: string
          since?: string
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_clients_member_id_org_id_fkey"
            columns: ["member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "coach_client_overview"
            referencedColumns: ["member_id", "org_id"]
          },
          {
            foreignKeyName: "trainer_clients_member_id_org_id_fkey"
            columns: ["member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "trainer_clients_member_id_org_id_fkey"
            columns: ["member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "trainer_clients_trainer_id_org_id_fkey"
            columns: ["trainer_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          error: string | null
          event_id: string
          payload: Json
          processed_at: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          received_at: string
        }
        Insert: {
          error?: string | null
          event_id: string
          payload: Json
          processed_at?: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          received_at?: string
        }
        Update: {
          error?: string | null
          event_id?: string
          payload?: Json
          processed_at?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"]
          received_at?: string
        }
        Relationships: []
      }
      workout_logs: {
        Row: {
          assignment_id: string | null
          duration_min: number | null
          effort_rpe: number | null
          id: string
          member_id: string
          notes: string | null
          org_id: string
          performed_at: string
          workout_id: string | null
        }
        Insert: {
          assignment_id?: string | null
          duration_min?: number | null
          effort_rpe?: number | null
          id?: string
          member_id: string
          notes?: string | null
          org_id: string
          performed_at?: string
          workout_id?: string | null
        }
        Update: {
          assignment_id?: string | null
          duration_min?: number | null
          effort_rpe?: number | null
          id?: string
          member_id?: string
          notes?: string | null
          org_id?: string
          performed_at?: string
          workout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_logs_assignment_id_org_id_fkey"
            columns: ["assignment_id", "org_id"]
            isOneToOne: false
            referencedRelation: "program_assignments"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "workout_logs_member_id_org_id_fkey"
            columns: ["member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "coach_client_overview"
            referencedColumns: ["member_id", "org_id"]
          },
          {
            foreignKeyName: "workout_logs_member_id_org_id_fkey"
            columns: ["member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "workout_logs_member_id_org_id_fkey"
            columns: ["member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "workout_logs_workout_id_org_id_fkey"
            columns: ["workout_id", "org_id"]
            isOneToOne: false
            referencedRelation: "program_workouts"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      workout_programs: {
        Row: {
          author_id: string
          created_at: string
          description: string | null
          goal: string | null
          id: string
          is_template: boolean
          level: string | null
          name: string
          org_id: string
        }
        Insert: {
          author_id: string
          created_at?: string
          description?: string | null
          goal?: string | null
          id?: string
          is_template?: boolean
          level?: string | null
          name: string
          org_id: string
        }
        Update: {
          author_id?: string
          created_at?: string
          description?: string | null
          goal?: string | null
          id?: string
          is_template?: boolean
          level?: string | null
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_programs_author_id_org_id_fkey"
            columns: ["author_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
    }
    Views: {
      class_sessions_availability: {
        Row: {
          booking_closes_min: number | null
          capacity: number | null
          class_name: string | null
          class_type_id: string | null
          color: string | null
          ends_at: string | null
          equipment_kind: string | null
          id: string | null
          instructor_id: string | null
          instructor_name: string | null
          instructor_photo_url: string | null
          org_id: string | null
          room_id: string | null
          room_name: string | null
          spots_left: number | null
          starts_at: string | null
          status: Database["public"]["Enums"]["session_status"] | null
          uses_equipment: boolean | null
          waitlist_left: number | null
        }
        Relationships: [
          {
            foreignKeyName: "class_sessions_class_type_id_org_id_fkey"
            columns: ["class_type_id", "org_id"]
            isOneToOne: false
            referencedRelation: "class_types"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "class_sessions_instructor_id_org_id_fkey"
            columns: ["instructor_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "class_sessions_room_id_org_id_fkey"
            columns: ["room_id", "org_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      coach_client_overview: {
        Row: {
          last_checkin_at: string | null
          last_workout_at: string | null
          medical_notes: string | null
          member_id: string | null
          member_name: string | null
          org_id: string | null
          phone: string | null
          photo_url: string | null
          program_name: string | null
          since: string | null
          trainer_id: string | null
          trainer_name: string | null
          workouts_30d: number | null
        }
        Relationships: [
          {
            foreignKeyName: "members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      member_directory: {
        Row: {
          billing_account_id: string | null
          birth_date: string | null
          created_at: string | null
          credits_remaining: number | null
          current_period_end: string | null
          document_id: string | null
          email: string | null
          first_name: string | null
          has_app: boolean | null
          id: string | null
          is_payer: boolean | null
          last_checkin_at: string | null
          last_name: string | null
          medical_notes: string | null
          membership_id: string | null
          membership_status:
            | Database["public"]["Enums"]["membership_status"]
            | null
          org_id: string | null
          payer_member_id: string | null
          phone: string | null
          photo_url: string | null
          plan_id: string | null
          plan_name: string | null
          status: Database["public"]["Enums"]["member_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "members_billing_account_fk"
            columns: ["billing_account_id", "org_id"]
            isOneToOne: false
            referencedRelation: "billing_accounts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_ledger: {
        Row: {
          amount_cents: number | null
          billing_account_id: string | null
          created_at: string | null
          currency: string | null
          id: string | null
          note: string | null
          org_id: string | null
          paid_at: string | null
          payer_member_id: string | null
          payer_name: string | null
          period_end: string | null
          plan_name: string | null
          provider: Database["public"]["Enums"]["payment_provider"] | null
          recorded_by_name: string | null
          status: Database["public"]["Enums"]["payment_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_billing_account_id_org_id_fkey"
            columns: ["billing_account_id", "org_id"]
            isOneToOne: false
            referencedRelation: "billing_accounts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      session_roster: {
        Row: {
          booking_id: string | null
          created_at: string | null
          equipment_label: string | null
          medical_notes: string | null
          member_id: string | null
          member_name: string | null
          org_id: string | null
          phone: string | null
          session_id: string | null
          source: string | null
          status: Database["public"]["Enums"]["booking_status"] | null
          waitlist_position: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_member_id_org_id_fkey"
            columns: ["member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "coach_client_overview"
            referencedColumns: ["member_id", "org_id"]
          },
          {
            foreignKeyName: "bookings_member_id_org_id_fkey"
            columns: ["member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "bookings_member_id_org_id_fkey"
            columns: ["member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "bookings_session_id_org_id_fkey"
            columns: ["session_id", "org_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "bookings_session_id_org_id_fkey"
            columns: ["session_id", "org_id"]
            isOneToOne: false
            referencedRelation: "class_sessions_availability"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
    }
    Functions: {
      access_device_confirm_ip: {
        Args: { p_device: string }
        Returns: undefined
      }
      access_device_delete: { Args: { p_device: string }; Returns: undefined }
      access_device_query_users: {
        Args: { p_device: string }
        Returns: undefined
      }
      access_device_register: {
        Args: {
          p_location?: string
          p_name: string
          p_org: string
          p_serial: string
        }
        Returns: string
      }
      access_device_resync: { Args: { p_device: string }; Returns: number }
      access_device_update: {
        Args: { p_active: boolean; p_device: string; p_name: string }
        Returns: undefined
      }
      access_enroll: {
        Args: { p_bio_type?: number; p_device: string; p_member: string }
        Returns: number
      }
      access_forget_pin: {
        Args: { p_device: string; p_pin: number }
        Returns: undefined
      }
      access_link_pin: {
        Args: { p_device: string; p_member: string; p_pin: number }
        Returns: undefined
      }
      access_reconcile_all: { Args: never; Returns: number }
      access_unknown_nearby: {
        Args: { p_ip: string; p_org: string }
        Returns: {
          info: Json
          last_seen_at: string
          serial_number: string
        }[]
      }
      admin_assign_plan: {
        Args: { p_member: string; p_plan: string; p_start?: string }
        Returns: string
      }
      admin_create_member: {
        Args: {
          p_birth_date?: string
          p_document_id?: string
          p_email?: string
          p_first_name: string
          p_last_name?: string
          p_org: string
          p_payer_id?: string
          p_phone?: string
          p_plan_id?: string
          p_start?: string
        }
        Returns: string
      }
      adms_hello: {
        Args: { p_info?: Json; p_ip: string; p_sn: string }
        Returns: Json
      }
      adms_log: {
        Args: {
          p_body: string
          p_ip: string
          p_method: string
          p_path: string
          p_query: string
          p_result: string
          p_sn: string
        }
        Returns: undefined
      }
      adms_poll: {
        Args: { p_ip: string; p_max_bytes?: number; p_sn: string }
        Returns: Json
      }
      adms_push: {
        Args: {
          p_ip: string
          p_records: Json
          p_sn: string
          p_stamp: string
          p_table: string
        }
        Returns: Json
      }
      adms_results: {
        Args: { p_ip: string; p_results: Json; p_sn: string }
        Returns: number
      }
      apply_series_to_future: { Args: { p_series: string }; Returns: number }
      book_class: {
        Args: {
          p_allow_waitlist?: boolean
          p_equipment_id?: string
          p_idempotency_key?: string
          p_member_id?: string
          p_session_id: string
        }
        Returns: Json
      }
      cancel_booking: { Args: { p_booking_id: string }; Returns: Json }
      cancel_session: {
        Args: { p_reason?: string; p_session: string }
        Returns: number
      }
      checkin_scan: {
        Args: {
          p_location_id: string
          p_member_id?: string
          p_method?: Database["public"]["Enums"]["checkin_method"]
          p_token?: string
        }
        Returns: Json
      }
      create_organization: {
        Args: { p_display_name?: string; p_name: string; p_slug: string }
        Returns: {
          branding: Json
          busy_threshold: number
          country: string
          created_at: string
          currency: string
          default_payment_provider: Database["public"]["Enums"]["payment_provider"]
          grace_days: number
          id: string
          late_cancel_minutes: number
          name: string
          opening_hours: Json
          public_profile: Json
          qr_step_seconds: number
          slug: string
          timezone: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_occupancy: { Args: { p_org_id: string }; Returns: Json }
      end_series: { Args: { p_series: string }; Returns: Json }
      enqueue_inactivity_events: { Args: never; Returns: number }
      expire_memberships: { Args: never; Returns: number }
      generate_sessions: {
        Args: { p_org?: string; p_weeks?: number }
        Returns: Json
      }
      get_checkin_token: {
        Args: { p_member_id?: string; p_org_id?: string }
        Returns: Json
      }
      link_existing_user: {
        Args: { p_email: string; p_org: string }
        Returns: string
      }
      mark_attendance: {
        Args: {
          p_booking: string
          p_status: Database["public"]["Enums"]["booking_status"]
        }
        Returns: undefined
      }
      my_permissions: { Args: { p_org: string }; Returns: string[] }
      my_staff_role: { Args: { p_org: string }; Returns: string }
      new_token: { Args: never; Returns: string }
      org_report: { Args: { p_months?: number; p_org: string }; Returns: Json }
      peak_hours: {
        Args: { p_org_id: string; p_weeks?: number }
        Returns: {
          avg_checkins: number
          hour: number
          weekday: number
        }[]
      }
      public_gym_profile: { Args: { p_slug: string }; Returns: Json }
      record_payment: {
        Args: {
          p_amount_cents: number
          p_member: string
          p_method: Database["public"]["Enums"]["payment_provider"]
          p_note?: string
          p_plan?: string
          p_renew?: boolean
        }
        Returns: Json
      }
      session_equipment_map: {
        Args: { p_session_id: string }
        Returns: {
          grid_col: number
          grid_row: number
          id: string
          label: string
          mine: boolean
          taken: boolean
        }[]
      }
      staff_contacts: {
        Args: { p_org: string }
        Returns: {
          document_id: string
          phone: string
          staff_id: string
        }[]
      }
      submit_staff_request: {
        Args: {
          p_document_id: string
          p_email: string
          p_first_name: string
          p_last_name: string
          p_message?: string
          p_phone: string
          p_role: string
          p_slug: string
        }
        Returns: string
      }
      today_ar: { Args: never; Returns: string }
      void_payment: {
        Args: { p_payment: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      booking_status:
        | "booked"
        | "waitlisted"
        | "canceled"
        | "late_canceled"
        | "checked_in"
        | "no_show"
      checkin_method:
        | "qr"
        | "manual"
        | "facial"
        | "fingerprint"
        | "nfc"
        | "palm"
      equipment_status: "active" | "maintenance" | "retired"
      invoice_status: "draft" | "open" | "paid" | "void" | "uncollectible"
      member_status: "lead" | "active" | "frozen" | "archived"
      membership_status:
        | "trialing"
        | "active"
        | "past_due"
        | "paused"
        | "canceled"
        | "expired"
      payment_provider:
        | "stripe"
        | "mercadopago"
        | "cash"
        | "transfer"
        | "card_terminal"
        | "other"
      payment_status:
        | "pending"
        | "succeeded"
        | "failed"
        | "refunded"
        | "canceled"
      plan_kind: "recurring" | "class_pack" | "drop_in" | "trial"
      session_status: "scheduled" | "canceled" | "completed"
      staff_role: "owner" | "admin" | "staff" | "trainer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      booking_status: [
        "booked",
        "waitlisted",
        "canceled",
        "late_canceled",
        "checked_in",
        "no_show",
      ],
      checkin_method: ["qr", "manual", "facial", "fingerprint", "nfc", "palm"],
      equipment_status: ["active", "maintenance", "retired"],
      invoice_status: ["draft", "open", "paid", "void", "uncollectible"],
      member_status: ["lead", "active", "frozen", "archived"],
      membership_status: [
        "trialing",
        "active",
        "past_due",
        "paused",
        "canceled",
        "expired",
      ],
      payment_provider: [
        "stripe",
        "mercadopago",
        "cash",
        "transfer",
        "card_terminal",
        "other",
      ],
      payment_status: [
        "pending",
        "succeeded",
        "failed",
        "refunded",
        "canceled",
      ],
      plan_kind: ["recurring", "class_pack", "drop_in", "trial"],
      session_status: ["scheduled", "canceled", "completed"],
      staff_role: ["owner", "admin", "staff", "trainer"],
    },
  },
} as const
