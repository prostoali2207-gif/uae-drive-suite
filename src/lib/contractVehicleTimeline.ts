export interface TimelineContract {
  id: string;
  car_id: string;
  client_id: string;
  start_date: string;
  end_date: string;
}

export interface TimelineVehicle {
  contract_id: string;
  car_id: string;
  started_at: string;
  ended_at: string | null;
}

const datePart = (value: string): string => value.slice(0, 10);

export function vehicleBelongsToContractOnDate(
  contract: TimelineContract,
  vehicle: TimelineVehicle,
  carId: string,
  dateIso: string,
): boolean {
  if (vehicle.contract_id !== contract.id || vehicle.car_id !== carId) return false;

  const startedAt = datePart(vehicle.started_at);
  const endedAt = vehicle.ended_at
    ? [datePart(vehicle.ended_at), contract.end_date].sort()[0]
    : contract.end_date;

  return dateIso >= contract.start_date && dateIso >= startedAt && dateIso <= endedAt;
}

export function findTimelineContract<T extends TimelineContract>(
  contracts: T[],
  contractVehicles: TimelineVehicle[],
  carId: string,
  dateIso: string,
): T | undefined {
  const contractsById = new Map(contracts.map((contract) => [contract.id, contract]));
  const timelineVehicle = contractVehicles
    .filter((vehicle) => {
      const contract = contractsById.get(vehicle.contract_id);
      return contract ? vehicleBelongsToContractOnDate(contract, vehicle, carId, dateIso) : false;
    })
    .sort((a, b) => datePart(b.started_at).localeCompare(datePart(a.started_at)))[0];

  if (timelineVehicle) return contractsById.get(timelineVehicle.contract_id);

  const contractsWithVehicleHistory = new Set(contractVehicles.map((vehicle) => vehicle.contract_id));
  return contracts.find(
    (contract) => !contractsWithVehicleHistory.has(contract.id)
      && contract.car_id === carId
      && contract.start_date <= dateIso
      && contract.end_date >= dateIso,
  );
}
