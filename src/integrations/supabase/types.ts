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
      cars: {
        Row: {
          created_at: string
          id: string
          insurance_expiry: string | null
          make: string
          model: string
          mulkiya_expiry: string | null
          owner_id: string
          plate: string
          status: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          insurance_expiry?: string | null
          make?: string
          model?: string
          mulkiya_expiry?: string | null
          owner_id?: string
          plate?: string
          status?: string
          year?: number
        }
        Update: {
          created_at?: string
          id?: string
          insurance_expiry?: string | null
          make?: string
          model?: string
          mulkiya_expiry?: string | null
          owner_id?: string
          plate?: string
          status?: string
          year?: number
        }
        Relationships: []
      }
      clients: {
        Row: {
          client_type: string
          created_at: string
          email: string | null
          emirates_id: string | null
          emirates_id_expiry: string | null
          full_name: string
          id: string
          license_expiry: string | null
          license_number: string
          nationality: string
          owner_id: string
          passport_expiry: string | null
          passport_number: string | null
          phone: string
        }
        Insert: {
          client_type?: string
          created_at?: string
          email?: string | null
          emirates_id?: string | null
          emirates_id_expiry?: string | null
          full_name?: string
          id?: string
          license_expiry?: string | null
          license_number?: string
          nationality?: string
          owner_id?: string
          passport_expiry?: string | null
          passport_number?: string | null
          phone?: string
        }
        Update: {
          client_type?: string
          created_at?: string
          email?: string | null
          emirates_id?: string | null
          emirates_id_expiry?: string | null
          full_name?: string
          id?: string
          license_expiry?: string | null
          license_number?: string
          nationality?: string
          owner_id?: string
          passport_expiry?: string | null
          passport_number?: string | null
          phone?: string
        }
        Relationships: []
      }
      contracts: {
        Row: {
          car_id: string
          client_id: string
          created_at: string
          deposit_amount: number
          end_date: string
          fuel_level: string
          id: string
          initial_mileage: number
          notes: string | null
          owner_id: string
          payment_status: string
          rate_amount: number
          rate_type: string
          start_date: string
          status: string
          total_amount: number
        }
        Insert: {
          car_id: string
          client_id: string
          created_at?: string
          deposit_amount?: number
          end_date: string
          fuel_level?: string
          id?: string
          initial_mileage?: number
          notes?: string | null
          owner_id?: string
          payment_status?: string
          rate_amount?: number
          rate_type?: string
          start_date: string
          status?: string
          total_amount?: number
        }
        Update: {
          car_id?: string
          client_id?: string
          created_at?: string
          deposit_amount?: number
          end_date?: string
          fuel_level?: string
          id?: string
          initial_mileage?: number
          notes?: string | null
          owner_id?: string
          payment_status?: string
          rate_amount?: number
          rate_type?: string
          start_date?: string
          status?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "contracts_car_id_fkey"
            columns: ["car_id"]
            isOneToOne: false
            referencedRelation: "cars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      fines: {
        Row: {
          amount: number
          car_id: string | null
          client_id: string | null
          created_at: string
          fine_date: string
          fine_type: string
          id: string
          notes: string | null
          owner_id: string
          source: string
          status: string
        }
        Insert: {
          amount?: number
          car_id?: string | null
          client_id?: string | null
          created_at?: string
          fine_date: string
          fine_type?: string
          id?: string
          notes?: string | null
          owner_id?: string
          source?: string
          status?: string
        }
        Update: {
          amount?: number
          car_id?: string | null
          client_id?: string | null
          created_at?: string
          fine_date?: string
          fine_type?: string
          id?: string
          notes?: string | null
          owner_id?: string
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fines_car_id_fkey"
            columns: ["car_id"]
            isOneToOne: false
            referencedRelation: "cars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fines_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          client_id: string
          contract_id: string | null
          created_at: string
          id: string
          method: string
          owner_id: string
          payment_date: string
          status: string
        }
        Insert: {
          amount?: number
          client_id: string
          contract_id?: string | null
          created_at?: string
          id?: string
          method?: string
          owner_id?: string
          payment_date: string
          status?: string
        }
        Update: {
          amount?: number
          client_id?: string
          contract_id?: string | null
          created_at?: string
          id?: string
          method?: string
          owner_id?: string
          payment_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_name: string
          created_at: string
          email: string
          id: string
          logo_url: string | null
        }
        Insert: {
          company_name?: string
          created_at?: string
          email?: string
          id: string
          logo_url?: string | null
        }
        Update: {
          company_name?: string
          created_at?: string
          email?: string
          id?: string
          logo_url?: string | null
        }
        Relationships: []
      }
      salik: {
        Row: {
          amount: number
          car_id: string | null
          charge_date: string
          client_id: string | null
          created_at: string
          id: string
          owner_id: string
          status: string
          trips: number
        }
        Insert: {
          amount?: number
          car_id?: string | null
          charge_date: string
          client_id?: string | null
          created_at?: string
          id?: string
          owner_id?: string
          status?: string
          trips?: number
        }
        Update: {
          amount?: number
          car_id?: string | null
          charge_date?: string
          client_id?: string | null
          created_at?: string
          id?: string
          owner_id?: string
          status?: string
          trips?: number
        }
        Relationships: [
          {
            foreignKeyName: "salik_car_id_fkey"
            columns: ["car_id"]
            isOneToOne: false
            referencedRelation: "cars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salik_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      compute_contract_status: {
        Args: { _current_status: string; _end_date: string }
        Returns: string
      }
      refresh_contract_statuses: { Args: never; Returns: undefined }
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
    Enums: {},
  },
} as const
