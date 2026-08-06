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

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DUBAI_OFFSET = "+04:00";

function toTimestamp(value: string, endOfDay = false): number {
  if (DATE_ONLY.test(value)) {
    const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
    return new Date(`${value}T${time}${DUBAI_OFFSET}`).getTime();
  }
  return new Date(value).getTime();
}

export function vehicleBelongsToContractOnDate(
  contract: TimelineContract,
  vehicle: TimelineVehicle,
  carId: string,
  dateIso: string,
): boolean {
  if (vehicle.contract_id !== contract.id || vehicle.car_id !== carId) return false;

  const eventAt = toTimestamp(dateIso);
  const contractStart = toTimestamp(contract.start_date);
  const contractEnd = toTimestamp(contract.end_date, true);
  const vehicleStart = toTimestamp(vehicle.started_at);
  const vehicleEnd = vehicle.ended_at
    ? Math.min(toTimestamp(vehicle.ended_at), contractEnd)
    : contractEnd;

  if ([eventAt, contractStart, contractEnd, vehicleStart, vehicleEnd].some(Number.isNaN)) return false;

  return eventAt >= contractStart
    && eventAt >= vehicleStart
    && eventAt <= vehicleEnd;
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
    .sort((a, b) => toTimestamp(b.started_at) - toTimestamp(a.started_at))[0];

  if (timelineVehicle) return contractsById.get(timelineVehicle.contract_id);

  const contractsWithVehicleHistory = new Set(contractVehicles.map((vehicle) => vehicle.contract_id));
  const eventAt = toTimestamp(dateIso);

  return contracts.find((contract) => !contractsWithVehicleHistory.has(contract.id)
    && contract.car_id === carId
    && eventAt >= toTimestamp(contract.start_date)
    && eventAt <= toTimestamp(contract.end_date, true));
}
