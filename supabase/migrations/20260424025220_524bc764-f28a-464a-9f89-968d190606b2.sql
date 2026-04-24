ALTER TABLE public.cars ADD COLUMN tag_number text;
CREATE INDEX IF NOT EXISTS idx_cars_tag_number ON public.cars(tag_number);