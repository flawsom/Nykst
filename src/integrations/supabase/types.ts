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
      advantages_feedback: {
        Row: {
          created_at: string
          email: string
          feedback: Json
          id: string
          linkedin: string | null
        }
        Insert: {
          created_at?: string
          email: string
          feedback?: Json
          id?: string
          linkedin?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          feedback?: Json
          id?: string
          linkedin?: string | null
        }
        Relationships: []
      }
      pre_registration: {
        Row: {
          closing_thoughts: string | null
          company_size: string | null
          created_at: string
          dream_feature: string | null
          email: string | null
          first_name: string
          frustration: string | null
          hard_won_insight: string | null
          hardest_parts: string[]
          id: string
          knowledge_location: string | null
          linkedin: string | null
          role: string | null
          time_understanding_code: string | null
          would_use: string | null
          x_account: string | null
        }
        Insert: {
          closing_thoughts?: string | null
          company_size?: string | null
          created_at?: string
          dream_feature?: string | null
          email?: string | null
          first_name: string
          frustration?: string | null
          hard_won_insight?: string | null
          hardest_parts?: string[]
          id?: string
          knowledge_location?: string | null
          linkedin?: string | null
          role?: string | null
          time_understanding_code?: string | null
          would_use?: string | null
          x_account?: string | null
        }
        Update: {
          closing_thoughts?: string | null
          company_size?: string | null
          created_at?: string
          dream_feature?: string | null
          email?: string | null
          first_name?: string
          frustration?: string | null
          hard_won_insight?: string | null
          hardest_parts?: string[]
          id?: string
          knowledge_location?: string | null
          linkedin?: string | null
          role?: string | null
          time_understanding_code?: string | null
          would_use?: string | null
          x_account?: string | null
        }
        Relationships: []
      }
      pre_registrations: {
        Row: {
          closing_thoughts: string | null
          company_size: string | null
          created_at: string
          dream_feature: string | null
          email: string
          first_name: string
          frustration: string | null
          hardest_parts: string[]
          id: string
          role: string | null
          time_understanding_code: string | null
          would_use: string | null
        }
        Insert: {
          closing_thoughts?: string | null
          company_size?: string | null
          created_at?: string
          dream_feature?: string | null
          email: string
          first_name: string
          frustration?: string | null
          hardest_parts?: string[]
          id?: string
          role?: string | null
          time_understanding_code?: string | null
          would_use?: string | null
        }
        Update: {
          closing_thoughts?: string | null
          company_size?: string | null
          created_at?: string
          dream_feature?: string | null
          email?: string
          first_name?: string
          frustration?: string | null
          hardest_parts?: string[]
          id?: string
          role?: string | null
          time_understanding_code?: string | null
          would_use?: string | null
        }
        Relationships: []
      }
      repository_ingestions: {
        Row: {
          created_at: string
          id: string
          payload: Json | null
          provider: string
          provider_user_id: string
          provider_username: string | null
          repository_full_name: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json | null
          provider: string
          provider_user_id: string
          provider_username?: string | null
          repository_full_name: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json | null
          provider?: string
          provider_user_id?: string
          provider_username?: string | null
          repository_full_name?: string
          status?: string
        }
        Relationships: []
      }
      production_signals: {
        Row: {
          created_at: string
          delivery_id: string
          event_type: string
          fingerprint: string
          id: string
          occurred_at: string
          payload: Json
          repository_full_name: string | null
          severity: string
          source: string
          summary: string
          title: string
        }
        Insert: {
          created_at?: string
          delivery_id: string
          event_type: string
          fingerprint: string
          id?: string
          occurred_at?: string
          payload?: Json
          repository_full_name?: string | null
          severity?: string
          source: string
          summary: string
          title: string
        }
        Update: {
          created_at?: string
          delivery_id?: string
          event_type?: string
          fingerprint?: string
          id?: string
          occurred_at?: string
          payload?: Json
          repository_full_name?: string | null
          severity?: string
          source?: string
          summary?: string
          title?: string
        }
        Relationships: []
      }
      root_cause_diagnoses: {
        Row: {
          confidence: string
          created_at: string
          dependencies: Json
          evidence: Json
          explanation: string
          id: string
          model_name: string | null
          model_provider: string | null
          recommended_next_steps: Json
          repository_full_name: string | null
          signal_id: string
          status: string
          title: string
        }
        Insert: {
          confidence?: string
          created_at?: string
          dependencies?: Json
          evidence?: Json
          explanation: string
          id?: string
          model_name?: string | null
          model_provider?: string | null
          recommended_next_steps?: Json
          repository_full_name?: string | null
          signal_id: string
          status?: string
          title: string
        }
        Update: {
          confidence?: string
          created_at?: string
          dependencies?: Json
          evidence?: Json
          explanation?: string
          id?: string
          model_name?: string | null
          model_provider?: string | null
          recommended_next_steps?: Json
          repository_full_name?: string | null
          signal_id?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      mcp_access_tokens: {
        Row: {
          created_at: string
          id: string
          label: string
          last_used_at: string | null
          provider: string
          provider_user_id: string
          provider_username: string
          revoked_at: string | null
          token_hash: string
          token_prefix: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string
          last_used_at?: string | null
          provider?: string
          provider_user_id: string
          provider_username: string
          revoked_at?: string | null
          token_hash: string
          token_prefix: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          last_used_at?: string | null
          provider?: string
          provider_user_id?: string
          provider_username?: string
          revoked_at?: string | null
          token_hash?: string
          token_prefix?: string
        }
        Relationships: []
      }
      user_ai_keys: {
        Row: {
          ai_provider: string
          api_base_url: string | null
          auth_provider: string
          created_at: string
          id: string
          key_ciphertext: string
          key_last4: string
          model_name: string | null
          provider_user_id: string
          updated_at: string
        }
        Insert: {
          ai_provider: string
          api_base_url?: string | null
          auth_provider?: string
          created_at?: string
          id?: string
          key_ciphertext: string
          key_last4: string
          model_name?: string | null
          provider_user_id: string
          updated_at?: string
        }
        Update: {
          ai_provider?: string
          api_base_url?: string | null
          auth_provider?: string
          created_at?: string
          id?: string
          key_ciphertext?: string
          key_last4?: string
          model_name?: string | null
          provider_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      integration_connections: {
        Row: {
          created_at: string
          expires_at: string | null
          external_id: string
          id: string
          kind: string
          label: string
          meta: Json
          provider: string
          provider_user_id: string
          secrets: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          external_id: string
          id?: string
          kind: string
          label?: string
          meta?: Json
          provider?: string
          provider_user_id: string
          secrets: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          external_id?: string
          id?: string
          kind?: string
          label?: string
          meta?: Json
          provider?: string
          provider_user_id?: string
          secrets?: string
          updated_at?: string
        }
        Relationships: []
      }
      nykst_subscriptions: {
        Row: {
          active_until: string | null
          created_at: string
          id: string
          plan: string
          provider_user_id: string
          provider_username: string
          status: string
          updated_at: string
        }
        Insert: {
          active_until?: string | null
          created_at?: string
          id?: string
          plan?: string
          provider_user_id: string
          provider_username: string
          status?: string
          updated_at?: string
        }
        Update: {
          active_until?: string | null
          created_at?: string
          id?: string
          plan?: string
          provider_user_id?: string
          provider_username?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      nykst_payment_submissions: {
        Row: {
          amount_npr: number
          created_at: string
          id: string
          payer_note: string | null
          plan: string
          provider: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          subscription_id: string
          transaction_reference: string
        }
        Insert: {
          amount_npr?: number
          created_at?: string
          id?: string
          payer_note?: string | null
          plan?: string
          provider?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          subscription_id: string
          transaction_reference: string
        }
        Update: {
          amount_npr?: number
          created_at?: string
          id?: string
          payer_note?: string | null
          plan?: string
          provider?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          subscription_id?: string
          transaction_reference?: string
        }
        Relationships: [
          {
            foreignKeyName: "nykst_payment_submissions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "nykst_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
