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
      ai_character_assets: {
        Row: {
          character_id: string
          content: string | null
          created_at: string
          id: string
          metadata: Json
          scenario_id: string | null
          type: string
          url: string | null
          user_id: string
        }
        Insert: {
          character_id: string
          content?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          scenario_id?: string | null
          type: string
          url?: string | null
          user_id: string
        }
        Update: {
          character_id?: string
          content?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          scenario_id?: string | null
          type?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_character_assets_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "ai_characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_character_assets_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "ai_character_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_character_personality: {
        Row: {
          character_id: string
          cute: number
          elegant: number
          emotional: number
          energetic: number
          funny: number
          luxury: number
          luxury_fashion: number
          luxury_lifestyle: number
          minimalist: number
          professional: number
          updated_at: string
          user_id: string
        }
        Insert: {
          character_id: string
          cute?: number
          elegant?: number
          emotional?: number
          energetic?: number
          funny?: number
          luxury?: number
          luxury_fashion?: number
          luxury_lifestyle?: number
          minimalist?: number
          professional?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          character_id?: string
          cute?: number
          elegant?: number
          emotional?: number
          energetic?: number
          funny?: number
          luxury?: number
          luxury_fashion?: number
          luxury_lifestyle?: number
          minimalist?: number
          professional?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_character_personality_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: true
            referencedRelation: "ai_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_character_references: {
        Row: {
          character_id: string
          created_at: string
          id: string
          parsed_style: Json
          platform: string
          status: string
          url: string
          user_id: string
        }
        Insert: {
          character_id: string
          created_at?: string
          id?: string
          parsed_style?: Json
          platform: string
          status?: string
          url: string
          user_id: string
        }
        Update: {
          character_id?: string
          created_at?: string
          id?: string
          parsed_style?: Json
          platform?: string
          status?: string
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_character_references_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "ai_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_character_scenarios: {
        Row: {
          caption: string | null
          character_id: string
          created_at: string
          id: string
          output_config: Json
          prompt: string | null
          scene: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          character_id: string
          created_at?: string
          id?: string
          output_config?: Json
          prompt?: string | null
          scene: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          caption?: string | null
          character_id?: string
          created_at?: string
          id?: string
          output_config?: Json
          prompt?: string | null
          scene?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_character_scenarios_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "ai_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_characters: {
        Row: {
          age: number | null
          avatar_url: string | null
          background_story: string | null
          body_type: string | null
          created_at: string
          description: string | null
          fashion_style: string | null
          favorite_color: string | null
          gender: string | null
          hair_style: string | null
          hobby: string | null
          id: string
          language: string | null
          last_generated_at: string | null
          name: string
          nationality: string | null
          negative_prompt: string | null
          niche: string | null
          occupation: string | null
          personality_text: string | null
          relationship_status: string | null
          status: string
          style: string | null
          updated_at: string
          user_id: string
          voice: string | null
        }
        Insert: {
          age?: number | null
          avatar_url?: string | null
          background_story?: string | null
          body_type?: string | null
          created_at?: string
          description?: string | null
          fashion_style?: string | null
          favorite_color?: string | null
          gender?: string | null
          hair_style?: string | null
          hobby?: string | null
          id?: string
          language?: string | null
          last_generated_at?: string | null
          name: string
          nationality?: string | null
          negative_prompt?: string | null
          niche?: string | null
          occupation?: string | null
          personality_text?: string | null
          relationship_status?: string | null
          status?: string
          style?: string | null
          updated_at?: string
          user_id: string
          voice?: string | null
        }
        Update: {
          age?: number | null
          avatar_url?: string | null
          background_story?: string | null
          body_type?: string | null
          created_at?: string
          description?: string | null
          fashion_style?: string | null
          favorite_color?: string | null
          gender?: string | null
          hair_style?: string | null
          hobby?: string | null
          id?: string
          language?: string | null
          last_generated_at?: string | null
          name?: string
          nationality?: string | null
          negative_prompt?: string | null
          niche?: string | null
          occupation?: string | null
          personality_text?: string | null
          relationship_status?: string | null
          status?: string
          style?: string | null
          updated_at?: string
          user_id?: string
          voice?: string | null
        }
        Relationships: []
      }
      ai_content_plan: {
        Row: {
          character_id: string
          content_type: string
          created_at: string
          day_of_week: number
          id: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          character_id: string
          content_type: string
          created_at?: string
          day_of_week: number
          id?: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          character_id?: string
          content_type?: string
          created_at?: string
          day_of_week?: number
          id?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_content_plan_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "ai_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_influencer_assets: {
        Row: {
          character_id: string
          content: string | null
          created_at: string
          id: string
          kind: string
          meta: Json
          source: string
          url: string | null
          user_id: string
        }
        Insert: {
          character_id: string
          content?: string | null
          created_at?: string
          id?: string
          kind: string
          meta?: Json
          source?: string
          url?: string | null
          user_id: string
        }
        Update: {
          character_id?: string
          content?: string | null
          created_at?: string
          id?: string
          kind?: string
          meta?: Json
          source?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_influencer_assets_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "ai_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_influencer_brain: {
        Row: {
          character_id: string
          learning: Json
          memory: Json
          persona: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          character_id: string
          learning?: Json
          memory?: Json
          persona?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          character_id?: string
          learning?: Json
          memory?: Json
          persona?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_influencer_brain_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: true
            referencedRelation: "ai_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_influencer_memory: {
        Row: {
          character_id: string
          count: number
          id: string
          last_used_at: string | null
          scene_key: string
          user_id: string
        }
        Insert: {
          character_id: string
          count?: number
          id?: string
          last_used_at?: string | null
          scene_key: string
          user_id: string
        }
        Update: {
          character_id?: string
          count?: number
          id?: string
          last_used_at?: string | null
          scene_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_influencer_memory_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "ai_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_influencer_publisher_accounts: {
        Row: {
          access_token: string | null
          character_id: string | null
          created_at: string
          handle: string
          id: string
          meta: Json
          platform: string
          status: string
          updated_at: string
          user_id: string
          webhook_url: string | null
        }
        Insert: {
          access_token?: string | null
          character_id?: string | null
          created_at?: string
          handle: string
          id?: string
          meta?: Json
          platform: string
          status?: string
          updated_at?: string
          user_id: string
          webhook_url?: string | null
        }
        Update: {
          access_token?: string | null
          character_id?: string | null
          created_at?: string
          handle?: string
          id?: string
          meta?: Json
          platform?: string
          status?: string
          updated_at?: string
          user_id?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_influencer_publisher_accounts_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "ai_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_influencer_queue: {
        Row: {
          caption: string | null
          character_id: string
          created_at: string
          day_label: string | null
          hashtag: string | null
          id: string
          idea: string
          payload: Json
          platform: string | null
          scheduled_for: string | null
          slot_time: string | null
          status: string
          thumbnail_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          character_id: string
          created_at?: string
          day_label?: string | null
          hashtag?: string | null
          id?: string
          idea: string
          payload?: Json
          platform?: string | null
          scheduled_for?: string | null
          slot_time?: string | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          caption?: string | null
          character_id?: string
          created_at?: string
          day_label?: string | null
          hashtag?: string | null
          id?: string
          idea?: string
          payload?: Json
          platform?: string | null
          scheduled_for?: string | null
          slot_time?: string | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_influencer_queue_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "ai_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_influencer_strategy: {
        Row: {
          character_id: string
          goals: Json
          ratios: Json
          updated_at: string
          user_id: string
          weekly: Json
        }
        Insert: {
          character_id: string
          goals?: Json
          ratios?: Json
          updated_at?: string
          user_id: string
          weekly?: Json
        }
        Update: {
          character_id?: string
          goals?: Json
          ratios?: Json
          updated_at?: string
          user_id?: string
          weekly?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_influencer_strategy_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: true
            referencedRelation: "ai_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_prices: {
        Row: {
          created_at: string
          is_active: boolean
          label: string
          price_idr: number
          route_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          label: string
          price_idr?: number
          route_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          is_active?: boolean
          label?: string
          price_idr?: number
          route_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          account_holder: string | null
          account_number: string | null
          created_at: string
          id: string
          image_url: string | null
          instructions: string | null
          is_active: boolean
          name: string
          sort_order: number
          type: string
          updated_at: string
        }
        Insert: {
          account_holder?: string | null
          account_number?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          instructions?: string | null
          is_active?: boolean
          name: string
          sort_order?: number
          type: string
          updated_at?: string
        }
        Update: {
          account_holder?: string | null
          account_number?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          instructions?: string | null
          is_active?: boolean
          name?: string
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      purchase_requests: {
        Row: {
          activated_until: string | null
          admin_note: string | null
          created_at: string
          id: string
          note: string | null
          payment_method_id: string | null
          payment_method_name: string | null
          price_idr: number
          proof_image_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          route_key: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activated_until?: string | null
          admin_note?: string | null
          created_at?: string
          id?: string
          note?: string | null
          payment_method_id?: string | null
          payment_method_name?: string | null
          price_idr: number
          proof_image_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          route_key: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activated_until?: string | null
          admin_note?: string | null
          created_at?: string
          id?: string
          note?: string | null
          payment_method_id?: string | null
          payment_method_name?: string | null
          price_idr?: number
          proof_image_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          route_key?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requests_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      route_permissions: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          route_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          route_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          route_key?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_route_permission: {
        Args: { _route_key: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "editor" | "user"
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
      app_role: ["admin", "editor", "user"],
    },
  },
} as const
