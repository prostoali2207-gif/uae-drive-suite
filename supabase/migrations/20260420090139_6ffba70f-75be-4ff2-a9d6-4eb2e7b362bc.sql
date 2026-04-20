
-- PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  company_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can delete own profile" ON public.profiles FOR DELETE TO authenticated USING (auth.uid() = id);

-- CARS
CREATE TABLE IF NOT EXISTS public.cars (
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
ALTER TABLE public.cars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view cars" ON public.cars FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert cars" ON public.cars FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update cars" ON public.cars FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth delete cars" ON public.cars FOR DELETE TO authenticated USING (true);

-- CLIENTS
CREATE TABLE IF NOT EXISTS public.clients (
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
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view clients" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert clients" ON public.clients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update clients" ON public.clients FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth delete clients" ON public.clients FOR DELETE TO authenticated USING (true);

-- CONTRACTS
CREATE TABLE IF NOT EXISTS public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  car_id uuid NOT NULL REFERENCES public.cars(id) ON DELETE RESTRICT,
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
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view contracts" ON public.contracts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert contracts" ON public.contracts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update contracts" ON public.contracts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth delete contracts" ON public.contracts FOR DELETE TO authenticated USING (true);

-- FINES
CREATE TABLE IF NOT EXISTS public.fines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  car_id uuid REFERENCES public.cars(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  fine_date date NOT NULL,
  fine_type text NOT NULL DEFAULT 'Other',
  amount numeric NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Unpaid',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view fines" ON public.fines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert fines" ON public.fines FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update fines" ON public.fines FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth delete fines" ON public.fines FOR DELETE TO authenticated USING (true);

-- SALIK
CREATE TABLE IF NOT EXISTS public.salik (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  car_id uuid REFERENCES public.cars(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  charge_date date NOT NULL,
  trips integer NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Unpaid',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.salik ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view salik" ON public.salik FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert salik" ON public.salik FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update salik" ON public.salik FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth delete salik" ON public.salik FOR DELETE TO authenticated USING (true);

-- PAYMENTS
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  amount numeric NOT NULL DEFAULT 0,
  payment_date date NOT NULL,
  method text NOT NULL DEFAULT 'Cash',
  status text NOT NULL DEFAULT 'Paid',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view payments" ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update payments" ON public.payments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth delete payments" ON public.payments FOR DELETE TO authenticated USING (true);
