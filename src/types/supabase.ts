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
      accounts_payable: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          created_by: string | null
          description: string
          due_date: string | null
          id: string
          issue_date: string
          paid_at: string | null
          purchase_order_id: string | null
          purchase_receipt_id: string | null
          status: Database["public"]["Enums"]["accounts_payable_status"]
          supplier_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          created_by?: string | null
          description: string
          due_date?: string | null
          id?: string
          issue_date?: string
          paid_at?: string | null
          purchase_order_id?: string | null
          purchase_receipt_id?: string | null
          status?: Database["public"]["Enums"]["accounts_payable_status"]
          supplier_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string | null
          id?: string
          issue_date?: string
          paid_at?: string | null
          purchase_order_id?: string | null
          purchase_receipt_id?: string | null
          status?: Database["public"]["Enums"]["accounts_payable_status"]
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_payable_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_purchase_receipt_id_fkey"
            columns: ["purchase_receipt_id"]
            isOneToOne: false
            referencedRelation: "purchase_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
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
      cash_movements: {
        Row: {
          amount: number
          cash_register_id: string
          company_id: string
          created_at: string
          created_by: string
          description: string
          direction: Database["public"]["Enums"]["cash_movement_direction"]
          id: string
          method: Database["public"]["Enums"]["sale_payment_method"]
          sale_payment_id: string | null
          source: Database["public"]["Enums"]["cash_movement_source"]
        }
        Insert: {
          amount: number
          cash_register_id: string
          company_id: string
          created_at?: string
          created_by: string
          description: string
          direction: Database["public"]["Enums"]["cash_movement_direction"]
          id?: string
          method: Database["public"]["Enums"]["sale_payment_method"]
          sale_payment_id?: string | null
          source: Database["public"]["Enums"]["cash_movement_source"]
        }
        Update: {
          amount?: number
          cash_register_id?: string
          company_id?: string
          created_at?: string
          created_by?: string
          description?: string
          direction?: Database["public"]["Enums"]["cash_movement_direction"]
          id?: string
          method?: Database["public"]["Enums"]["sale_payment_method"]
          sale_payment_id?: string | null
          source?: Database["public"]["Enums"]["cash_movement_source"]
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_sale_payment_id_fkey"
            columns: ["sale_payment_id"]
            isOneToOne: false
            referencedRelation: "sale_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_registers: {
        Row: {
          cash_difference: number | null
          closed_at: string | null
          closed_by: string | null
          company_id: string
          created_at: string
          expected_cash_balance: number | null
          id: string
          informed_cash_balance: number | null
          notes: string | null
          opened_at: string
          opened_by: string
          opening_balance: number
          status: Database["public"]["Enums"]["cash_register_status"]
          updated_at: string
        }
        Insert: {
          cash_difference?: number | null
          closed_at?: string | null
          closed_by?: string | null
          company_id: string
          created_at?: string
          expected_cash_balance?: number | null
          id?: string
          informed_cash_balance?: number | null
          notes?: string | null
          opened_at?: string
          opened_by: string
          opening_balance?: number
          status?: Database["public"]["Enums"]["cash_register_status"]
          updated_at?: string
        }
        Update: {
          cash_difference?: number | null
          closed_at?: string | null
          closed_by?: string | null
          company_id?: string
          created_at?: string
          expected_cash_balance?: number | null
          id?: string
          informed_cash_balance?: number | null
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opening_balance?: number
          status?: Database["public"]["Enums"]["cash_register_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_registers_company_id_fkey"
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
      customer_documents: {
        Row: {
          company_id: string
          created_at: string
          customer_id: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id: string
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          customer_id: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id?: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          customer_id?: string
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
      loyalty_accounts: {
        Row: {
          balance: number
          company_id: string
          created_at: string
          customer_id: string
          id: string
          lifetime_points: number
          updated_at: string
        }
        Insert: {
          balance?: number
          company_id: string
          created_at?: string
          customer_id: string
          id?: string
          lifetime_points?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          company_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          lifetime_points?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_campaigns: {
        Row: {
          bonus_points: number | null
          company_id: string
          created_at: string
          description: string | null
          ends_at: string
          id: string
          multiplier: number | null
          name: string
          product_id: string | null
          service_id: string | null
          starts_at: string
          status: Database["public"]["Enums"]["loyalty_campaign_status"]
          updated_at: string
        }
        Insert: {
          bonus_points?: number | null
          company_id: string
          created_at?: string
          description?: string | null
          ends_at: string
          id?: string
          multiplier?: number | null
          name: string
          product_id?: string | null
          service_id?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["loyalty_campaign_status"]
          updated_at?: string
        }
        Update: {
          bonus_points?: number | null
          company_id?: string
          created_at?: string
          description?: string | null
          ends_at?: string
          id?: string
          multiplier?: number | null
          name?: string
          product_id?: string | null
          service_id?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["loyalty_campaign_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_campaigns_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_campaigns_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_multipliers: {
        Row: {
          company_id: string
          created_at: string
          id: string
          multiplier: number
          product_id: string | null
          service_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          multiplier: number
          product_id?: string | null
          service_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          multiplier?: number
          product_id?: string | null
          service_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_multipliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_multipliers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_multipliers_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_settings: {
        Row: {
          birthday_bonus_points: number
          company_id: string
          created_at: string
          enabled: boolean
          first_purchase_bonus_points: number
          grant_on: Database["public"]["Enums"]["loyalty_grant_on"]
          id: string
          max_redeem_percent_per_sale: number | null
          min_points_to_redeem: number
          min_purchase_amount_for_points: number
          points_expire: boolean
          points_expire_after_days: number | null
          points_per_currency_unit: number
          redemption_value_per_point: number
          updated_at: string
        }
        Insert: {
          birthday_bonus_points?: number
          company_id: string
          created_at?: string
          enabled?: boolean
          first_purchase_bonus_points?: number
          grant_on?: Database["public"]["Enums"]["loyalty_grant_on"]
          id?: string
          max_redeem_percent_per_sale?: number | null
          min_points_to_redeem?: number
          min_purchase_amount_for_points?: number
          points_expire?: boolean
          points_expire_after_days?: number | null
          points_per_currency_unit?: number
          redemption_value_per_point?: number
          updated_at?: string
        }
        Update: {
          birthday_bonus_points?: number
          company_id?: string
          created_at?: string
          enabled?: boolean
          first_purchase_bonus_points?: number
          grant_on?: Database["public"]["Enums"]["loyalty_grant_on"]
          id?: string
          max_redeem_percent_per_sale?: number | null
          min_points_to_redeem?: number
          min_purchase_amount_for_points?: number
          points_expire?: boolean
          points_expire_after_days?: number | null
          points_per_currency_unit?: number
          redemption_value_per_point?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_tier_thresholds: {
        Row: {
          company_id: string
          created_at: string
          id: string
          min_lifetime_points: number
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          min_lifetime_points: number
          name: string
          sort_order: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          min_lifetime_points?: number
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_tier_thresholds_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          balance_after: number
          company_id: string
          created_at: string
          customer_id: string
          expires_at: string | null
          id: string
          performed_by: string | null
          points: number
          reason: string | null
          reference_id: string | null
          reference_type: string | null
          remaining_points: number
          source: Database["public"]["Enums"]["loyalty_transaction_source"]
          type: Database["public"]["Enums"]["loyalty_transaction_type"]
        }
        Insert: {
          balance_after: number
          company_id: string
          created_at?: string
          customer_id: string
          expires_at?: string | null
          id?: string
          performed_by?: string | null
          points: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          remaining_points?: number
          source: Database["public"]["Enums"]["loyalty_transaction_source"]
          type: Database["public"]["Enums"]["loyalty_transaction_type"]
        }
        Update: {
          balance_after?: number
          company_id?: string
          created_at?: string
          customer_id?: string
          expires_at?: string | null
          id?: string
          performed_by?: string | null
          points?: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          remaining_points?: number
          source?: Database["public"]["Enums"]["loyalty_transaction_source"]
          type?: Database["public"]["Enums"]["loyalty_transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
      purchase_order_items: {
        Row: {
          company_id: string
          created_at: string
          description: string
          id: string
          product_id: string
          purchase_order_id: string
          quantity: number
          received_quantity: number
          total_amount: number
          unit_cost: number
        }
        Insert: {
          company_id: string
          created_at?: string
          description: string
          id?: string
          product_id: string
          purchase_order_id: string
          quantity: number
          received_quantity?: number
          total_amount: number
          unit_cost: number
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string
          id?: string
          product_id?: string
          purchase_order_id?: string
          quantity?: number
          received_quantity?: number
          total_amount?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          discount_amount: number
          due_date: string | null
          expected_at: string | null
          id: string
          notes: string | null
          order_number: string | null
          ordered_at: string | null
          received_at: string | null
          status: Database["public"]["Enums"]["purchase_order_status"]
          subtotal: number
          supplier_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          due_date?: string | null
          expected_at?: string | null
          id?: string
          notes?: string | null
          order_number?: string | null
          ordered_at?: string | null
          received_at?: string | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          subtotal?: number
          supplier_id: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          due_date?: string | null
          expected_at?: string | null
          id?: string
          notes?: string | null
          order_number?: string | null
          ordered_at?: string | null
          received_at?: string | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          subtotal?: number
          supplier_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_receipt_items: {
        Row: {
          company_id: string
          created_at: string
          id: string
          previous_cost_price: number
          product_id: string
          purchase_order_item_id: string
          purchase_receipt_id: string
          quantity: number
          total_amount: number
          unit_cost: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          previous_cost_price?: number
          product_id: string
          purchase_order_item_id: string
          purchase_receipt_id: string
          quantity: number
          total_amount: number
          unit_cost: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          previous_cost_price?: number
          product_id?: string
          purchase_order_item_id?: string
          purchase_receipt_id?: string
          quantity?: number
          total_amount?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_receipt_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipt_items_purchase_order_item_id_fkey"
            columns: ["purchase_order_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipt_items_purchase_receipt_id_fkey"
            columns: ["purchase_receipt_id"]
            isOneToOne: false
            referencedRelation: "purchase_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_receipts: {
        Row: {
          company_id: string
          created_at: string
          id: string
          notes: string | null
          purchase_order_id: string
          received_at: string
          received_by: string
          status: Database["public"]["Enums"]["purchase_receipt_status"]
          supplier_id: string
          total_amount: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          notes?: string | null
          purchase_order_id: string
          received_at?: string
          received_by: string
          status?: Database["public"]["Enums"]["purchase_receipt_status"]
          supplier_id: string
          total_amount?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          purchase_order_id?: string
          received_at?: string
          received_by?: string
          status?: Database["public"]["Enums"]["purchase_receipt_status"]
          supplier_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_receipts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipts_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
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
          loyalty_discount_amount: number
          loyalty_points_redeemed: number
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
          loyalty_discount_amount?: number
          loyalty_points_redeemed?: number
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
          loyalty_discount_amount?: number
          loyalty_points_redeemed?: number
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
      stock_movements: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          direction: Database["public"]["Enums"]["stock_movement_direction"]
          id: string
          product_id: string
          quantity: number
          reason: string
          reference_id: string | null
          source: Database["public"]["Enums"]["stock_movement_source"]
          stock_after: number
          stock_before: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          direction: Database["public"]["Enums"]["stock_movement_direction"]
          id?: string
          product_id: string
          quantity: number
          reason: string
          reference_id?: string | null
          source: Database["public"]["Enums"]["stock_movement_source"]
          stock_after: number
          stock_before: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          direction?: Database["public"]["Enums"]["stock_movement_direction"]
          id?: string
          product_id?: string
          quantity?: number
          reason?: string
          reference_id?: string | null
          source?: Database["public"]["Enums"]["stock_movement_source"]
          stock_after?: number
          stock_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
      supplier_products: {
        Row: {
          company_id: string
          created_at: string
          id: string
          lead_time_days: number | null
          minimum_order_quantity: number
          product_id: string
          supplier_code: string | null
          supplier_id: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          lead_time_days?: number | null
          minimum_order_quantity?: number
          product_id: string
          supplier_code?: string | null
          supplier_id: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          lead_time_days?: number | null
          minimum_order_quantity?: number
          product_id?: string
          supplier_code?: string | null
          supplier_id?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
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
          legal_name: string | null
          name: string
          neighborhood: string | null
          notes: string | null
          phone: string | null
          postal_code: string | null
          state: string | null
          status: Database["public"]["Enums"]["supplier_status"]
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
          legal_name?: string | null
          name: string
          neighborhood?: string | null
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["supplier_status"]
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
          legal_name?: string | null
          name?: string
          neighborhood?: string | null
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["supplier_status"]
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey"
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
      adjust_loyalty_points: {
        Args: { p_customer_id: string; p_points: number; p_reason: string }
        Returns: number
      }
      cancel_purchase_receipt: {
        Args: { p_purchase_receipt_id: string; p_reason?: string }
        Returns: {
          company_id: string
          created_at: string
          id: string
          notes: string | null
          purchase_order_id: string
          received_at: string
          received_by: string
          status: Database["public"]["Enums"]["purchase_receipt_status"]
          supplier_id: string
          total_amount: number
        }
        SetofOptions: {
          from: "*"
          to: "purchase_receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
          loyalty_discount_amount: number
          loyalty_points_redeemed: number
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
      close_cash_register: {
        Args: {
          p_cash_register_id: string
          p_informed_cash_balance: number
          p_notes?: string
        }
        Returns: {
          cash_difference: number | null
          closed_at: string | null
          closed_by: string | null
          company_id: string
          created_at: string
          expected_cash_balance: number | null
          id: string
          informed_cash_balance: number | null
          notes: string | null
          opened_at: string
          opened_by: string
          opening_balance: number
          status: Database["public"]["Enums"]["cash_register_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_registers"
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
          loyalty_discount_amount: number
          loyalty_points_redeemed: number
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
      confirm_subscription_payment: {
        Args: {
          p_end_to_end_id: string
          p_event_id: string
          p_event_payload: Json
          p_event_type: string
          p_payment_id: string
          p_provider_status: Database["public"]["Enums"]["subscription_payment_status"]
        }
        Returns: {
          already_processed: boolean
          new_status: Database["public"]["Enums"]["subscription_payment_status"]
          not_found: boolean
          ok: boolean
        }[]
      }
      create_cash_movement: {
        Args: {
          p_amount: number
          p_description: string
          p_direction: Database["public"]["Enums"]["cash_movement_direction"]
          p_method: Database["public"]["Enums"]["sale_payment_method"]
        }
        Returns: {
          amount: number
          cash_register_id: string
          company_id: string
          created_at: string
          created_by: string
          description: string
          direction: Database["public"]["Enums"]["cash_movement_direction"]
          id: string
          method: Database["public"]["Enums"]["sale_payment_method"]
          sale_payment_id: string | null
          source: Database["public"]["Enums"]["cash_movement_source"]
        }
        SetofOptions: {
          from: "*"
          to: "cash_movements"
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
      create_purchase_order: {
        Args: {
          p_due_date?: string
          p_expected_at?: string
          p_items: Json
          p_notes?: string
          p_supplier_id: string
        }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          discount_amount: number
          due_date: string | null
          expected_at: string | null
          id: string
          notes: string | null
          order_number: string | null
          ordered_at: string | null
          received_at: string | null
          status: Database["public"]["Enums"]["purchase_order_status"]
          subtotal: number
          supplier_id: string
          total_amount: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "purchase_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_loyalty_points_batch: { Args: never; Returns: number }
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
      grant_loyalty_points_for_sale: {
        Args: { p_sale_id: string }
        Returns: undefined
      }
      open_cash_register: {
        Args: { p_notes?: string; p_opening_balance: number }
        Returns: {
          cash_difference: number | null
          closed_at: string | null
          closed_by: string | null
          company_id: string
          created_at: string
          expected_cash_balance: number | null
          id: string
          informed_cash_balance: number | null
          notes: string | null
          opened_at: string
          opened_by: string
          opening_balance: number
          status: Database["public"]["Enums"]["cash_register_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_registers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      postgres_fdw_disconnect: { Args: { "": string }; Returns: boolean }
      postgres_fdw_disconnect_all: { Args: never; Returns: boolean }
      postgres_fdw_get_connections: {
        Args: never
        Returns: Record<string, unknown>[]
      }
      postgres_fdw_handler: { Args: never; Returns: unknown }
      receive_purchase_order: {
        Args: { p_items: Json; p_notes?: string; p_purchase_order_id: string }
        Returns: {
          company_id: string
          created_at: string
          id: string
          notes: string | null
          purchase_order_id: string
          received_at: string
          received_by: string
          status: Database["public"]["Enums"]["purchase_receipt_status"]
          supplier_id: string
          total_amount: number
        }
        SetofOptions: {
          from: "*"
          to: "purchase_receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      redeem_loyalty_points: {
        Args: { p_points: number; p_sale_id: string }
        Returns: number
      }
      reverse_loyalty_points_for_sale: {
        Args: { p_sale_id: string }
        Returns: undefined
      }
      undo_loyalty_redemption_for_draft_sale: {
        Args: { p_sale_id: string }
        Returns: undefined
      }
    }
    Enums: {
      accounts_payable_status: "open" | "paid" | "cancelled"
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
      cash_movement_direction: "in" | "out"
      cash_movement_source: "sale_payment" | "manual"
      cash_register_status: "open" | "closed"
      company_role: "owner" | "admin" | "employee"
      company_status: "active" | "inactive"
      customer_status: "active" | "inactive"
      loyalty_campaign_status: "active" | "inactive"
      loyalty_grant_on: "completion" | "full_payment"
      loyalty_transaction_source:
        | "sale"
        | "manual"
        | "campaign"
        | "birthday"
        | "first_purchase"
        | "expiration"
        | "reversal"
      loyalty_transaction_type:
        | "ganho"
        | "resgate"
        | "ajuste"
        | "expirado"
        | "reversao"
      plan_status: "active" | "inactive"
      product_status: "active" | "inactive"
      product_unit: "un" | "kg" | "g" | "l" | "ml" | "m" | "cx" | "pct" | "kit"
      purchase_order_status:
        | "draft"
        | "ordered"
        | "partially_received"
        | "received"
        | "cancelled"
      purchase_receipt_status: "posted" | "cancelled"
      sale_item_type: "product" | "service"
      sale_payment_method: "cash" | "pix" | "debit" | "credit" | "other"
      sale_payment_status: "pending" | "paid" | "cancelled" | "refunded"
      sale_status: "draft" | "completed" | "cancelled"
      service_status: "active" | "inactive"
      stock_movement_direction: "in" | "out" | "adjustment"
      stock_movement_source:
        | "opening"
        | "manual"
        | "sale"
        | "sale_cancellation"
        | "purchase"
        | "purchase_cancellation"
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
      supplier_status: "active" | "inactive"
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
      accounts_payable_status: ["open", "paid", "cancelled"],
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
      cash_movement_direction: ["in", "out"],
      cash_movement_source: ["sale_payment", "manual"],
      cash_register_status: ["open", "closed"],
      company_role: ["owner", "admin", "employee"],
      company_status: ["active", "inactive"],
      customer_status: ["active", "inactive"],
      loyalty_campaign_status: ["active", "inactive"],
      loyalty_grant_on: ["completion", "full_payment"],
      loyalty_transaction_source: [
        "sale",
        "manual",
        "campaign",
        "birthday",
        "first_purchase",
        "expiration",
        "reversal",
      ],
      loyalty_transaction_type: [
        "ganho",
        "resgate",
        "ajuste",
        "expirado",
        "reversao",
      ],
      plan_status: ["active", "inactive"],
      product_status: ["active", "inactive"],
      product_unit: ["un", "kg", "g", "l", "ml", "m", "cx", "pct", "kit"],
      purchase_order_status: [
        "draft",
        "ordered",
        "partially_received",
        "received",
        "cancelled",
      ],
      purchase_receipt_status: ["posted", "cancelled"],
      sale_item_type: ["product", "service"],
      sale_payment_method: ["cash", "pix", "debit", "credit", "other"],
      sale_payment_status: ["pending", "paid", "cancelled", "refunded"],
      sale_status: ["draft", "completed", "cancelled"],
      service_status: ["active", "inactive"],
      stock_movement_direction: ["in", "out", "adjustment"],
      stock_movement_source: [
        "opening",
        "manual",
        "sale",
        "sale_cancellation",
        "purchase",
        "purchase_cancellation",
      ],
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
      supplier_status: ["active", "inactive"],
      user_role: ["user", "admin", "super_admin"],
      user_status: ["active", "inactive", "suspended"],
    },
  },
} as const
