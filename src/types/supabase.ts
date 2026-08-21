/**
 * Tipos do banco de dados Supabase.
 *
 * Escrito manualmente para espelhar as migrations em supabase/migrations/.
 * Assim que possível, substitua por tipos gerados automaticamente:
 *
 *   npx supabase gen types typescript --project-id <PROJECT_ID> > src/types/supabase.ts
 *
 * Mantenha este arquivo em sincronia com as migrations até lá.
 */

import type { UserRole, UserStatus } from "./profile";
import type { BusinessType, CompanyRole, CompanyStatus } from "./company";
import type { CustomerStatus } from "./customer";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string;
          full_name: string | null;
          email: string | null;
          avatar_url: string | null;
          status: UserStatus;
          role: UserRole;
          created_at: string;
          updated_at: string;
          last_login_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          full_name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
          status?: UserStatus;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
          last_login_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          full_name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
          status?: UserStatus;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
          last_login_at?: string | null;
        };
        Relationships: [];
      };
      companies: {
        Row: {
          id: string;
          name: string;
          business_type: BusinessType;
          status: CompanyStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          business_type?: BusinessType;
          status?: CompanyStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          business_type?: BusinessType;
          status?: CompanyStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      company_members: {
        Row: {
          id: string;
          company_id: string;
          user_id: string;
          role: CompanyRole;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          user_id: string;
          role?: CompanyRole;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          user_id?: string;
          role?: CompanyRole;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          }
        ];
      };
      customers: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          document: string | null;
          phone: string | null;
          whatsapp: string | null;
          email: string | null;
          address: string | null;
          address_number: string | null;
          complement: string | null;
          neighborhood: string | null;
          city: string | null;
          state: string | null;
          postal_code: string | null;
          notes: string | null;
          status: CustomerStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          document?: string | null;
          phone?: string | null;
          whatsapp?: string | null;
          email?: string | null;
          address?: string | null;
          address_number?: string | null;
          complement?: string | null;
          neighborhood?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          notes?: string | null;
          status?: CustomerStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          name?: string;
          document?: string | null;
          phone?: string | null;
          whatsapp?: string | null;
          email?: string | null;
          address?: string | null;
          address_number?: string | null;
          complement?: string | null;
          neighborhood?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          notes?: string | null;
          status?: CustomerStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_company_with_owner: {
        Args: {
          p_name: string;
          p_business_type?: BusinessType;
        };
        Returns: {
          id: string;
          name: string;
          business_type: BusinessType;
          status: CompanyStatus;
          created_at: string;
          updated_at: string;
        };
      };
    };
    Enums: {
      user_role: UserRole;
      user_status: UserStatus;
      business_type: BusinessType;
      company_status: CompanyStatus;
      company_role: CompanyRole;
      customer_status: CustomerStatus;
    };
  };
};
