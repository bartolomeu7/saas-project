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
      company_entitlements: {
        Row: {
          access_expires_at: string | null
          access_starts_at: string | null
          company_id: string
          early_access_enabled: boolean
          exclusive_groups_enabled: boolean
          id: string
          max_additional_users: number
          plan_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          support_enabled: boolean
          tickets_enabled: boolean
          updated_at: string
        }
        Insert: {
          access_expires_at?: string | null
          access_starts_at?: string | null
          company_id: string
          early_access_enabled?: boolean
          exclusive_groups_enabled?: boolean
          id?: string
          max_additional_users?: number
          plan_id?: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          support_enabled?: boolean
          tickets_enabled?: boolean
          updated_at?: string
        }
        Update: {
          access_expires_at?: string | null
          access_starts_at?: string | null
          company_id?: string
          early_access_enabled?: boolean
          exclusive_groups_enabled?: boolean
          id?: string
          max_additional_users?: number
          plan_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          support_enabled?: boolean
          tickets_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_entitlements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_entitlements_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
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
          birth_date: string | null
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
          preferences: Json
          state: string | null
          status: Database["public"]["Enums"]["customer_status"]
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          address_number?: string | null
          birth_date?: string | null
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
          preferences?: Json
          state?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          address_number?: string | null
          birth_date?: string | null
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
          preferences?: Json
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
      payment_events: {
        Row: {
          created_at: string
          event_id: string
          event_type: string
          id: string
          payload: Json | null
          processed: boolean
          processed_at: string | null
          provider: string
          subscription_payment_id: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          event_type: string
          id?: string
          payload?: Json | null
          processed?: boolean
          processed_at?: string | null
          provider: string
          subscription_payment_id?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          event_type?: string
          id?: string
          payload?: Json | null
          processed?: boolean
          processed_at?: string | null
          provider?: string
          subscription_payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_subscription_payment_id_fkey"
            columns: ["subscription_payment_id"]
            isOneToOne: false
            referencedRelation: "subscription_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          access_duration_days: number | null
          additional_user_limit: number
          billing_interval:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          billing_interval_count: number | null
          code: string
          created_at: string
          currency: string
          description: string | null
          early_access_enabled: boolean
          exclusive_groups_enabled: boolean
          id: string
          name: string
          price: number | null
          provider: string | null
          provider_plan_id: string | null
          status: Database["public"]["Enums"]["plan_status"]
          support_enabled: boolean
          tickets_enabled: boolean
          trial: boolean
          updated_at: string
        }
        Insert: {
          access_duration_days?: number | null
          additional_user_limit?: number
          billing_interval?:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          billing_interval_count?: number | null
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          early_access_enabled?: boolean
          exclusive_groups_enabled?: boolean
          id?: string
          name: string
          price?: number | null
          provider?: string | null
          provider_plan_id?: string | null
          status?: Database["public"]["Enums"]["plan_status"]
          support_enabled?: boolean
          tickets_enabled?: boolean
          trial?: boolean
          updated_at?: string
        }
        Update: {
          access_duration_days?: number | null
          additional_user_limit?: number
          billing_interval?:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          billing_interval_count?: number | null
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          early_access_enabled?: boolean
          exclusive_groups_enabled?: boolean
          id?: string
          name?: string
          price?: number | null
          provider?: string | null
          provider_plan_id?: string | null
          status?: Database["public"]["Enums"]["plan_status"]
          support_enabled?: boolean
          tickets_enabled?: boolean
          trial?: boolean
          updated_at?: string
        }
        Relationships: []
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
      sale_items: {
        Row: {
          company_id: string
          created_at: string
          description: string
          discount_amount: number
          id: string
          item_type: Database["public"]["Enums"]["sale_item_type"]
          product_id: string | null
          quantity: number
          sale_id: string
          service_id: string | null
          subtotal: number
          total_amount: number
          unit_cost: number
          unit_price: number
        }
        Insert: {
          company_id: string
          created_at?: string
          description: string
          discount_amount?: number
          id?: string
          item_type: Database["public"]["Enums"]["sale_item_type"]
          product_id?: string | null
          quantity: number
          sale_id: string
          service_id?: string | null
          subtotal: number
          total_amount: number
          unit_cost?: number
          unit_price: number
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string
          discount_amount?: number
          id?: string
          item_type?: Database["public"]["Enums"]["sale_item_type"]
          product_id?: string | null
          quantity?: number
          sale_id?: string
          service_id?: string | null
          subtotal?: number
          total_amount?: number
          unit_cost?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          id: string
          method: Database["public"]["Enums"]["sale_payment_method"]
          notes: string | null
          paid_at: string | null
          sale_id: string
          status: Database["public"]["Enums"]["sale_payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          id?: string
          method: Database["public"]["Enums"]["sale_payment_method"]
          notes?: string | null
          paid_at?: string | null
          sale_id: string
          status?: Database["public"]["Enums"]["sale_payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["sale_payment_method"]
          notes?: string | null
          paid_at?: string | null
          sale_id?: string
          status?: Database["public"]["Enums"]["sale_payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          customer_id: string | null
          discount_amount: number
          estimated_margin: number
          id: string
          notes: string | null
          payment_status: Database["public"]["Enums"]["sale_payment_status"]
          sold_at: string
          status: Database["public"]["Enums"]["sale_status"]
          subtotal: number
          total_amount: number
          total_cost: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          estimated_margin?: number
          id?: string
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["sale_payment_status"]
          sold_at?: string
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal?: number
          total_amount?: number
          total_cost?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          estimated_margin?: number
          id?: string
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["sale_payment_status"]
          sold_at?: string
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal?: number
          total_amount?: number
          total_cost?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
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
      subscription_payments: {
        Row: {
          amount: number
          amount_with_tax: number | null
          company_id: string
          created_at: string
          currency: string
          due_at: string | null
          end_to_end_id: string | null
          external_reference: string | null
          id: string
          paid_at: string | null
          payer_document: string | null
          payer_name: string | null
          pix_qr_code_base64: string | null
          pix_qr_code_text: string | null
          pix_qr_code_url: string | null
          plan_id: string
          provider: string
          provider_transaction_id: string | null
          status: Database["public"]["Enums"]["subscription_payment_status"]
          subscription_id: string | null
          tax_amount: number | null
          updated_at: string
        }
        Insert: {
          amount: number
          amount_with_tax?: number | null
          company_id: string
          created_at?: string
          currency?: string
          due_at?: string | null
          end_to_end_id?: string | null
          external_reference?: string | null
          id?: string
          paid_at?: string | null
          payer_document?: string | null
          payer_name?: string | null
          pix_qr_code_base64?: string | null
          pix_qr_code_text?: string | null
          pix_qr_code_url?: string | null
          plan_id: string
          provider?: string
          provider_transaction_id?: string | null
          status?: Database["public"]["Enums"]["subscription_payment_status"]
          subscription_id?: string | null
          tax_amount?: number | null
          updated_at?: string
        }
        Update: {
          amount?: number
          amount_with_tax?: number | null
          company_id?: string
          created_at?: string
          currency?: string
          due_at?: string | null
          end_to_end_id?: string | null
          external_reference?: string | null
          id?: string
          paid_at?: string | null
          payer_document?: string | null
          payer_name?: string | null
          pix_qr_code_base64?: string | null
          pix_qr_code_text?: string | null
          pix_qr_code_url?: string | null
          plan_id?: string
          provider?: string
          provider_transaction_id?: string | null
          status?: Database["public"]["Enums"]["subscription_payment_status"]
          subscription_id?: string | null
          tax_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancelled_at: string | null
          company_id: string
          created_at: string
          expires_at: string
          id: string
          plan_id: string
          provider: string | null
          provider_customer_id: string | null
          provider_subscription_id: string | null
          starts_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_claimed_by: string | null
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          company_id: string
          created_at?: string
          expires_at: string
          id?: string
          plan_id: string
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          starts_at?: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_claimed_by?: string | null
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          company_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          plan_id?: string
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_claimed_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_sale: {
        Args: { p_reason?: string; p_sale_id: string }
        Returns: {
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          customer_id: string | null
          discount_amount: number
          estimated_margin: number
          id: string
          notes: string | null
          payment_status: Database["public"]["Enums"]["sale_payment_status"]
          sold_at: string
          status: Database["public"]["Enums"]["sale_status"]
          subtotal: number
          total_amount: number
          total_cost: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "sales"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_sale: {
        Args: { p_sale_id: string }
        Returns: {
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          customer_id: string | null
          discount_amount: number
          estimated_margin: number
          id: string
          notes: string | null
          payment_status: Database["public"]["Enums"]["sale_payment_status"]
          sold_at: string
          status: Database["public"]["Enums"]["sale_status"]
          subtotal: number
          total_amount: number
          total_cost: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "sales"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      get_public_plans: {
        Args: never
        Returns: {
          access_duration_days: number
          additional_user_limit: number
          code: string
          currency: string
          description: string
          early_access_enabled: boolean
          exclusive_groups_enabled: boolean
          id: string
          name: string
          price: number
          status: Database["public"]["Enums"]["plan_status"]
          support_enabled: boolean
          tickets_enabled: boolean
          trial: boolean
        }[]
      }
    }
    Enums: {
      billing_interval: "month" | "year"
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
      plan_status: "active" | "inactive"
      product_status: "active" | "inactive"
      product_unit: "un" | "kg" | "g" | "l" | "ml" | "m" | "cx" | "pct" | "kit"
      sale_item_type: "product" | "service"
      sale_payment_method: "cash" | "pix" | "debit" | "credit" | "other"
      sale_payment_status: "pending" | "paid" | "cancelled" | "refunded"
      sale_status: "draft" | "completed" | "cancelled"
      service_status: "active" | "inactive"
      subscription_payment_status:
        | "pending"
        | "paid"
        | "expired"
        | "cancelled"
        | "failed"
        | "refunded"
      subscription_status:
        | "trialing"
        | "pending"
        | "active"
        | "expired"
        | "cancelled"
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
      billing_interval: ["month", "year"],
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
      plan_status: ["active", "inactive"],
      product_status: ["active", "inactive"],
      product_unit: ["un", "kg", "g", "l", "ml", "m", "cx", "pct", "kit"],
      sale_item_type: ["product", "service"],
      sale_payment_method: ["cash", "pix", "debit", "credit", "other"],
      sale_payment_status: ["pending", "paid", "cancelled", "refunded"],
      sale_status: ["draft", "completed", "cancelled"],
      service_status: ["active", "inactive"],
      subscription_payment_status: [
        "pending",
        "paid",
        "expired",
        "cancelled",
        "failed",
        "refunded",
      ],
      subscription_status: [
        "trialing",
        "pending",
        "active",
        "expired",
        "cancelled",
      ],
      user_role: ["user", "admin", "super_admin"],
      user_status: ["active", "inactive", "suspended"],
    },
  },
} as const
