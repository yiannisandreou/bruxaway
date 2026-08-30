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
      care_links: {
        Row: {
          created_at: string
          id: string
          patient_id: string
          physician_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          patient_id: string
          physician_id: string
        }
        Update: {
          created_at?: string
          id?: string
          patient_id?: string
          physician_id?: string
        }
        Relationships: []
      }
      cron_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      device_push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          device_id: string
          end_hour: number
          endpoint: string
          id: string
          p256dh: string
          prompts_per_day: number
          start_hour: number
          timezone: string
          updated_at: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          device_id: string
          end_hour?: number
          endpoint: string
          id?: string
          p256dh: string
          prompts_per_day?: number
          start_hour?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          device_id?: string
          end_hour?: number
          endpoint?: string
          id?: string
          p256dh?: string
          prompts_per_day?: number
          start_hour?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      entries: {
        Row: {
          behavior: string
          contexts: string[]
          created_at: string
          id: string
          note: string | null
          prompted: boolean
          stress: number
          ts: string
          user_id: string
        }
        Insert: {
          behavior: string
          contexts?: string[]
          created_at?: string
          id: string
          note?: string | null
          prompted?: boolean
          stress?: number
          ts: string
          user_id: string
        }
        Update: {
          behavior?: string
          contexts?: string[]
          created_at?: string
          id?: string
          note?: string | null
          prompted?: boolean
          stress?: number
          ts?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          end_hour: number
          full_name: string | null
          id: string
          prompts_per_day: number
          start_hour: number
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          end_hour?: number
          full_name?: string | null
          id: string
          prompts_per_day?: number
          start_hour?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          end_hour?: number
          full_name?: string | null
          id?: string
          prompts_per_day?: number
          start_hour?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      prompt_events: {
        Row: {
          answered: boolean
          device_id: string | null
          fired_at: string
          id: string
          user_id: string | null
        }
        Insert: {
          answered?: boolean
          device_id?: string | null
          fired_at?: string
          id?: string
          user_id?: string | null
        }
        Update: {
          answered?: boolean
          device_id?: string | null
          fired_at?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      push_delivery_failures: {
        Row: {
          detail: string | null
          endpoint: string
          id: string
          occurred_at: string
          status: number | null
        }
        Insert: {
          detail?: string | null
          endpoint: string
          id?: string
          occurred_at?: string
          status?: number | null
        }
        Update: {
          detail?: string | null
          endpoint?: string
          id?: string
          occurred_at?: string
          status?: number | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      role_requests: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          reviewed_at: string | null
          reviewer_id: string | null
          status: Database["public"]["Enums"]["app_role_request_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["app_role_request_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["app_role_request_status"]
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      eligible_prompt_devices: {
        Args: never
        Returns: {
          auth_key: string
          device_id: string
          end_hour: number
          endpoint: string
          fired_today: number
          local_hour: number
          p256dh: string
          prompts_per_day: number
          start_hour: number
        }[]
      }
      eligible_prompt_users: {
        Args: never
        Returns: {
          auth_key: string
          end_hour: number
          endpoint: string
          fired_today: number
          local_hour: number
          p256dh: string
          prompts_per_day: number
          start_hour: number
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_care_linked: {
        Args: { _patient_id: string; _physician_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "patient" | "physician"
      app_role_request_status: "pending" | "approved" | "rejected"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["patient", "physician"],
      app_role_request_status: ["pending", "approved", "rejected"],
    },
  },
} as const
