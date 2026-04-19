/*
  # FleetDesk — Initial Schema

  ## Summary
  Creates the core tables for the FleetDesk UAE car rental management system.

  ## New Tables

  ### profiles
  - `id` (uuid, PK, references auth.users)
  - `email` (text)
  - `company_name` (text)
  - `created_at` (timestamptz)
  Stores user/company profile information tied to Supabase Auth.

  ### cars
  - `id` (uuid, PK)
  - `plate` (text, unique)
  - `make` (text)
  - `model` (text)
  - `year` (integer)
  - `status` (text) — 'Available' | 'Rented' | 'Service'
  - `insurance_expiry` (date)
  - `mulkiya_expiry` (date)
  - `created_at` (timestamptz)
  Fleet vehicles.

  ### clients
  - `id` (uuid, PK)
  - `full_name` (text)
  - `phone` (text)
  - `emirates_id` (text)
  - `nationality` (text)
  - `email` (text, nullable)
  - `license_number` (text)
  - `license_expiry` (date)
  - `passport_number` (text)
  - `created_at` (timestamptz)
  Rental clients.

  ### contracts
  - `id` (uuid, PK)
  - `client_id` (uuid, FK → clients)
  - `car_id` (uuid, FK → cars)
  - `start_date` (date)
  - `end_date` (date)
  - `rate_type` (text) — 'Daily' | 'Monthly' | 'Yearly'
  - `rate_amount` (numeric)
  - `total_amount` (numeric)
  - `deposit_amount` (numeric)
  - `initial_mileage` (integer)
  - `fuel_level` (text)
  - `status` (text) — 'Active' | 'Expiring Soon' | 'Overdue' | 'Completed'
  - `payment_status` (text) — 'Paid' | 'Partial' | 'Unpaid'
  - `created_at` (timestamptz)
  Rental agreements.

  ### fines
  - `id` (uuid, PK)
  - `car_id` (uuid, FK → cars)
  - `client_id` (uuid, FK → clients)
  - `fine_date` (date)
  - `fine_type` (text)
  - `amount` (numeric)
  - `source` (text)
  - `status` (text) — 'Unpaid' | 'Charged to Client' | 'Paid'
  - `notes` (text, nullable)
  - `created_at` (timestamptz)
  Traffic fines associated with vehicles.

  ### salik
  - `id` (uuid, PK)
  - `car_id` (uuid, FK → cars)
  - `client_id` (uuid, FK → clients)
  - `charge_date` (date)
  - `trips` (integer)
  - `amount` (numeric)
  - `status` (text) — 'Unpaid' | 'Charged to Client' | 'Paid'
  - `created_at` (timestamptz)
  Dubai Salik toll charges.

  ### payments
  - `id` (uuid, PK)
  - `contract_id` (uuid, FK → contracts, nullable)
  - `client_id` (uuid, FK → clients)
  - `amount` (numeric)
  - `payment_date` (date)
  - `method` (text) — 'Cash' | 'Bank Transfer' | 'Card'
  - `status` (text) — 'Paid' | 'Partial' | 'Overdue'
  - `created_at` (timestamptz)
  Payment records.

  ## Security
  - RLS enabled on all tables
  - Authenticated users can manage all records (single-tenant app)
  - Policies use auth.uid() checks via profiles table ownership
*/

-- PROFILES
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  company_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can delete own profile"
  ON profiles FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

-- CARS
CREATE TABLE IF NOT EXISTS cars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate text UNIQUE NOT NULL DEFAULT '',
  make text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  year integer NOT NULL DEFAULT 2024,
  status text NOT NULL DEFAULT 'Available',
  insurance_expiry date,
  mulkiya_expiry date,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view cars"
  ON cars FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert cars"
  ON cars FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update cars"
  ON cars FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete cars"
  ON cars FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- CLIENTS
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  emirates_id text NOT NULL DEFAULT '',
  nationality text NOT NULL DEFAULT '',
  email text,
  license_number text NOT NULL DEFAULT '',
  license_expiry date,
  passport_number text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view clients"
  ON clients FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert clients"
  ON clients FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update clients"
  ON clients FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete clients"
  ON clients FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- CONTRACTS
CREATE TABLE IF NOT EXISTS contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  car_id uuid NOT NULL REFERENCES cars(id) ON DELETE RESTRICT,
  start_date date NOT NULL,
  end_date date NOT NULL,
  rate_type text NOT NULL DEFAULT 'Daily',
  rate_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  deposit_amount numeric NOT NULL DEFAULT 0,
  initial_mileage integer NOT NULL DEFAULT 0,
  fuel_level text NOT NULL DEFAULT 'Full',
  status text NOT NULL DEFAULT 'Active',
  payment_status text NOT NULL DEFAULT 'Unpaid',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view contracts"
  ON contracts FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert contracts"
  ON contracts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update contracts"
  ON contracts FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete contracts"
  ON contracts FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- FINES
CREATE TABLE IF NOT EXISTS fines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  car_id uuid REFERENCES cars(id) ON DELETE SET NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  fine_date date NOT NULL,
  fine_type text NOT NULL DEFAULT 'Other',
  amount numeric NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Unpaid',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view fines"
  ON fines FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert fines"
  ON fines FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update fines"
  ON fines FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete fines"
  ON fines FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- SALIK
CREATE TABLE IF NOT EXISTS salik (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  car_id uuid REFERENCES cars(id) ON DELETE SET NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  charge_date date NOT NULL,
  trips integer NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Unpaid',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE salik ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view salik"
  ON salik FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert salik"
  ON salik FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update salik"
  ON salik FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete salik"
  ON salik FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- PAYMENTS
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  amount numeric NOT NULL DEFAULT 0,
  payment_date date NOT NULL,
  method text NOT NULL DEFAULT 'Cash',
  status text NOT NULL DEFAULT 'Paid',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view payments"
  ON payments FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert payments"
  ON payments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update payments"
  ON payments FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete payments"
  ON payments FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);
