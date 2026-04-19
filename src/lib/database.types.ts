export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          company_name: string;
          created_at: string;
        };
        Insert: {
          id: string;
          email?: string;
          company_name?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          company_name?: string;
          created_at?: string;
        };
      };
      cars: {
        Row: {
          id: string;
          plate: string;
          make: string;
          model: string;
          year: number;
          status: string;
          insurance_expiry: string | null;
          mulkiya_expiry: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          plate: string;
          make: string;
          model: string;
          year: number;
          status?: string;
          insurance_expiry?: string | null;
          mulkiya_expiry?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          plate?: string;
          make?: string;
          model?: string;
          year?: number;
          status?: string;
          insurance_expiry?: string | null;
          mulkiya_expiry?: string | null;
          created_at?: string;
        };
      };
      clients: {
        Row: {
          id: string;
          full_name: string;
          phone: string;
          emirates_id: string;
          nationality: string;
          email: string | null;
          license_number: string;
          license_expiry: string | null;
          passport_number: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          phone: string;
          emirates_id: string;
          nationality: string;
          email?: string | null;
          license_number: string;
          license_expiry?: string | null;
          passport_number: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          phone?: string;
          emirates_id?: string;
          nationality?: string;
          email?: string | null;
          license_number?: string;
          license_expiry?: string | null;
          passport_number?: string;
          created_at?: string;
        };
      };
      contracts: {
        Row: {
          id: string;
          client_id: string;
          car_id: string;
          start_date: string;
          end_date: string;
          rate_type: string;
          rate_amount: number;
          total_amount: number;
          deposit_amount: number;
          initial_mileage: number;
          fuel_level: string;
          status: string;
          payment_status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          car_id: string;
          start_date: string;
          end_date: string;
          rate_type?: string;
          rate_amount: number;
          total_amount: number;
          deposit_amount?: number;
          initial_mileage?: number;
          fuel_level?: string;
          status?: string;
          payment_status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          car_id?: string;
          start_date?: string;
          end_date?: string;
          rate_type?: string;
          rate_amount?: number;
          total_amount?: number;
          deposit_amount?: number;
          initial_mileage?: number;
          fuel_level?: string;
          status?: string;
          payment_status?: string;
          created_at?: string;
        };
      };
      fines: {
        Row: {
          id: string;
          car_id: string | null;
          client_id: string | null;
          fine_date: string;
          fine_type: string;
          amount: number;
          source: string;
          status: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          car_id?: string | null;
          client_id?: string | null;
          fine_date: string;
          fine_type: string;
          amount: number;
          source: string;
          status?: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          car_id?: string | null;
          client_id?: string | null;
          fine_date?: string;
          fine_type?: string;
          amount?: number;
          source?: string;
          status?: string;
          notes?: string | null;
          created_at?: string;
        };
      };
      salik: {
        Row: {
          id: string;
          car_id: string | null;
          client_id: string | null;
          charge_date: string;
          trips: number;
          amount: number;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          car_id?: string | null;
          client_id?: string | null;
          charge_date: string;
          trips: number;
          amount: number;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          car_id?: string | null;
          client_id?: string | null;
          charge_date?: string;
          trips?: number;
          amount?: number;
          status?: string;
          created_at?: string;
        };
      };
      payments: {
        Row: {
          id: string;
          contract_id: string | null;
          client_id: string;
          amount: number;
          payment_date: string;
          method: string;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          contract_id?: string | null;
          client_id: string;
          amount: number;
          payment_date: string;
          method: string;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          contract_id?: string | null;
          client_id?: string;
          amount?: number;
          payment_date?: string;
          method?: string;
          status?: string;
          created_at?: string;
        };
      };
    };
  };
}
