/*
  # Sync Vehicle Status with Contract Status

  ## Summary
  Implements automatic synchronization between contract status and vehicle status.
  When a contract is Active, the assigned vehicle status becomes "Rented".
  When a contract is Closed or Completed, the vehicle status reverts to "Available".
  This includes backfilling existing active contracts.

  ## Changes
  1. Backfill: Set all vehicles with active contracts to "Rented" status
  2. Added trigger function to automatically sync vehicle status on contract insert/update
  3. Added index for efficient contract lookups by car_id

  ## Business Logic
  - Contract Active → Vehicle Rented
  - Contract Closed/Completed → Vehicle Available
  - Only one active contract per vehicle is allowed (enforced by app logic)
  - Extended contracts remain Rented (no status change on extend)

  ## Security
  - Triggers use SECURITY DEFINER to safely manage vehicle status
  - Maintains existing RLS policies (no bypass)
*/

-- Create trigger function to sync vehicle status on contract changes
CREATE OR REPLACE FUNCTION sync_vehicle_status_with_contract()
RETURNS TRIGGER AS $$
BEGIN
  -- When contract becomes Active: set vehicle to Rented
  IF NEW.status = 'Active' THEN
    UPDATE cars
    SET status = 'Rented'
    WHERE id = NEW.car_id;
  
  -- When contract transitions FROM Active to Completed/Closed: check if vehicle should be Available
  ELSIF (OLD.status = 'Active' OR OLD.status = 'Expiring Soon' OR OLD.status = 'Overdue')
    AND (NEW.status = 'Completed' OR NEW.status = 'Cancelled') THEN
    -- Only set to Available if no other active contracts exist for this vehicle
    IF NOT EXISTS (
      SELECT 1 FROM contracts
      WHERE car_id = NEW.car_id
        AND status IN ('Active', 'Expiring Soon', 'Overdue')
        AND id != NEW.id
    ) THEN
      UPDATE cars
      SET status = 'Available'
      WHERE id = NEW.car_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_sync_vehicle_status ON contracts;

-- Create trigger that fires on INSERT and UPDATE
CREATE TRIGGER trigger_sync_vehicle_status
AFTER INSERT OR UPDATE ON contracts
FOR EACH ROW
EXECUTE FUNCTION sync_vehicle_status_with_contract();

-- Backfill: Set vehicles with active contracts to "Rented"
UPDATE cars
SET status = 'Rented'
WHERE id IN (
  SELECT DISTINCT car_id FROM contracts
  WHERE status IN ('Active', 'Expiring Soon', 'Overdue')
)
AND status != 'Rented';

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_contracts_car_id_status
ON contracts(car_id, status);
