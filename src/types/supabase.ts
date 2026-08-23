/**
 * Tipos do banco de dados Supabase.
 *
 * Gerado a partir do projeto Supabase conectado (fpbcruinppjbwtinzrdg),
 * refletindo as migrations 001-003 e 005-007 já aplicadas (004, de
 * billing, permanece só como arquivo local, não aplicada). Para
 * regenerar:
 *
 *   npx supabase gen types typescript --project-id fpbcruinppjbwtinzrdg > src/types/supabase.ts
 */

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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          company_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          company_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          company_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          business_type: Database["public"]["Enums"]["business_type"]
          created_at: string
          id: string
          name: string
          status: Database["public"]["Enums"]["company_status"]
          updated_at: string
        }
        Insert: {
          business_type?: Database["public"]["Enums"]["business_type"]
          created_at?: string
          id?: string
          name: string
          status?: Database["public"]["Enums"]["company_status"]
          updated_at?: string
        }
        Update: {
          business_type?: Database["public"]["Enums"]["business_type"]
          created_at?: string
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["company_status"]
          updated_at?: string
        }
        Relationships: []
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["company_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["company_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["company_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_raffle_entries: {
        Row: {
          company_id: string
          customer_email_snapshot: string | null
          customer_id: string | null
          customer_name_snapshot: string
          customer_phone_snapshot: string | null
          id: string
          is_winner: boolean
          raffle_id: string
          winner_position: number | null
        }
        Insert: {
          company_id: string
          customer_email_snapshot?: string | null
          customer_id?: string | null
          customer_name_snapshot: string
          customer_phone_snapshot?: string | null
          id?: string
          is_winner?: boolean
          raffle_id: string
          winner_position?: number | null
        }
        Update: {
          company_id?: string
          customer_email_snapshot?: string | null
          customer_id?: string | null
          customer_name_snapshot?: string
          customer_phone_snapshot?: string | null
          id?: string
          is_winner?: boolean
          raffle_id?: string
          winner_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_raffle_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_raffle_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_raffle_entries_raffle_id_fkey"
            columns: ["raffle_id"]
            isOneToOne: false
            referencedRelation: "customer_raffles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_raffles: {
        Row: {
          company_id: string
          criteria: Json
          executed_at: string
          executed_by: string
          id: string
          name: string | null
          participant_count: number
          winner_count: number
        }
        Insert: {
          company_id: string
          criteria?: Json
          executed_at?: string
          executed_by: string
          id?: string
          name?: string | null
          participant_count: number
          winner_count: number
        }
        Update: {
          company_id?: string
          criteria?: Json
          executed_at?: string
          executed_by?: string
          id?: string
          name?: string | null
          participant_count?: number
          winner_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_raffles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          address_number: string | null
          city: string | null
          company_id: string
          complement: string | null
          created_at: string
          document: string | null
          email: string | null
          id: string
          name: string
          neighborhood: string | null
          notes: string | null
          phone: string | null
          postal_code: string | null
          state: string | null
          status: Database["public"]["Enums"]["customer_status"]
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          address_number?: string | null
          city?: string | null
          company_id: string
          complement?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name: string
          neighborhood?: string | null
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          address_number?: string | null
          city?: string | null
          company_id?: string
          complement?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          neighborhood?: string | null
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          status: Database["public"]["Enums"]["product_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          category_id: string | null
          company_id: string
          cost_price: number
          created_at: string
          description: string | null
          id: string
          minimum_stock: number
          name: string
          sale_price: number
          sku: string | null
          status: Database["public"]["Enums"]["product_status"]
          stock_quantity: number
          unit: Database["public"]["Enums"]["product_unit"]
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          category_id?: string | null
          company_id: string
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          minimum_stock?: number
          name: string
          sale_price?: number
          sku?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          stock_quantity?: number
          unit?: Database["public"]["Enums"]["product_unit"]
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          category_id?: string | null
          company_id?: string
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          minimum_stock?: number
          name?: string
          sale_price?: number
          sku?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          stock_quantity?: number
          unit?: Database["public"]["Enums"]["product_unit"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          last_login_at: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          last_login_at?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          last_login_at?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      service_categories: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          status: Database["public"]["Enums"]["service_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: Database["public"]["Enums"]["service_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["service_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          category_id: string | null
          company_id: string
          cost_price: number
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          name: string
          sale_price: number
          status: Database["public"]["Enums"]["service_status"]
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          company_id: string
          cost_price?: number
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          name: string
          sale_price?: number
          status?: Database["public"]["Enums"]["service_status"]
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          company_id?: string
          cost_price?: number
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          name?: string
          sale_price?: number
          status?: Database["public"]["Enums"]["service_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_company_with_owner: {
        Args: {
          p_business_type?: Database["public"]["Enums"]["business_type"]
          p_name: string
        }
        Returns: {
          business_type: Database["public"]["Enums"]["business_type"]
          created_at: string
          id: string
          name: string
          status: Database["public"]["Enums"]["company_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "companies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      business_type:
        | "bakery"
        | "car_wash"
        | "automotive_detailing"
        | "grocery"
        | "restaurant"
        | "snack_bar"
        | "beauty_salon"
        | "workshop"
        | "service_provider"
        | "other"
      company_role: "owner" | "admin" | "employee"
      company_status: "active" | "inactive"
      customer_status: "active" | "inactive"
      product_status: "active" | "inactive"
      product_unit: "un" | "kg" | "g" | "l" | "ml" | "m" | "cx" | "pct" | "kit"
      service_status: "active" | "inactive"
      user_role: "user" | "admin" | "super_admin"
      user_status: "active" | "inactive" | "suspended"
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
      business_type: [
        "bakery",
        "car_wash",
        "automotive_detailing",
        "grocery",
        "restaurant",
        "snack_bar",
        "beauty_salon",
        "workshop",
        "service_provider",
        "other",
      ],
      company_role: ["owner", "admin", "employee"],
      company_status: ["active", "inactive"],
      customer_status: ["active", "inactive"],
      product_status: ["active", "inactive"],
      product_unit: ["un", "kg", "g", "l", "ml", "m", "cx", "pct", "kit"],
      service_status: ["active", "inactive"],
      user_role: ["user", "admin", "super_admin"],
      user_status: ["active", "inactive", "suspended"],
    },
  },
} as const
