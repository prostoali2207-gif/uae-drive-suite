import { supabase } from "@/lib/supabase";

const RENTED_CONTRACT_STATUSES = new Set(["Active", "Expiring Soon", "Overdue"]);

export async function syncVehicleStatusesWithContracts() {
  const { data: contracts, error: contractsError } = await supabase
    .from("contracts")
    .select("car_id, status");
  if (contractsError) {
    throw contractsError;
  }

  const rentedCarIds = new Set(
    (contracts ?? [])
      .filter((contract) => contract.car_id && RENTED_CONTRACT_STATUSES.has(contract.status))
      .map((contract) => contract.car_id as string),
  );

  const { data: cars, error: carsError } = await supabase.from("cars").select("id, status");
  if (carsError) {
    throw carsError;
  }

  const toRented: string[] = [];
  const toAvailable: string[] = [];

  (cars ?? []).forEach((car) => {
    const isRentedByContract = rentedCarIds.has(car.id as string);
    if (isRentedByContract && car.status !== "Rented") {
      toRented.push(car.id as string);
      return;
    }
    if (!isRentedByContract && car.status === "Rented") {
      toAvailable.push(car.id as string);
    }
  });

  if (toRented.length > 0) {
    const { error } = await supabase.from("cars").update({ status: "Rented" }).in("id", toRented);
    if (error) throw error;
  }

  if (toAvailable.length > 0) {
    const { error } = await supabase.from("cars").update({ status: "Available" }).in("id", toAvailable);
    if (error) throw error;
  }
}

