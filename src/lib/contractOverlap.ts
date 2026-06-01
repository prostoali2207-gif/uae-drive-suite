export interface ContractOverlapRow {
  id: string;
  start_date: string;
  start_time: string | null;
  end_date: string;
  end_time: string | null;
  status: string | null;
  clients?: { full_name: string | null } | { full_name: string | null }[] | null;
}

interface VehicleOverlapInput {
  carId?: string;
  vehicleId?: string;
  startDate: string;
  startTime?: string | null;
  endDate: string;
  endTime?: string | null;
  excludeContractId?: string;
  operation?: string;
}

export const VEHICLE_OVERLAP_MESSAGE = "This vehicle is already booked/rented during this period.";

const IGNORED_CONTRACT_STATUSES = new Set(["closed", "cancelled", "canceled"]);

const CONTRACT_FIELD_SETS = [
  {
    vehicleField: "car_id",
    startDateField: "start_date",
    startTimeField: "start_time",
    endDateField: "end_date",
    endTimeField: "end_time",
  },
  {
    vehicleField: "vehicle_id",
    startDateField: "start_date",
    startTimeField: "start_time",
    endDateField: "end_date",
    endTimeField: "end_time",
  },
] as const;

export function formatTimeForOverlap(time: string | null | undefined): string {
  if (!time || time.trim() === "") return "12:00:00";
  const trimmed = time.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  return "12:00:00";
}

export function parseContractDateTime(date: string, time?: string | null): Date {
  return new Date(`${date.slice(0, 10)}T${formatTimeForOverlap(time)}`);
}

export function isIgnoredOverlapStatus(status: string | null | undefined): boolean {
  return IGNORED_CONTRACT_STATUSES.has((status ?? "").trim().toLowerCase());
}

export function findOverlappingContract(
  contracts: ContractOverlapRow[],
  newStart: Date,
  newEnd: Date,
): ContractOverlapRow | null {
  return (
    contracts.find((contract) => {
      if (isIgnoredOverlapStatus(contract.status)) return false;
      const existingStart = parseContractDateTime(contract.start_date, contract.start_time);
      const existingEnd = parseContractDateTime(contract.end_date, contract.end_time);
      if (Number.isNaN(existingStart.getTime()) || Number.isNaN(existingEnd.getTime())) return false;
      return existingStart < newEnd && existingEnd > newStart;
    }) ?? null
  );
}

function formatDateTimeLabel(date: string, time?: string | null): string {
  return `${date.slice(0, 10)} ${formatTimeForOverlap(time).slice(0, 5)}`;
}

function getClientName(contract: ContractOverlapRow): string {
  const clients = Array.isArray(contract.clients) ? contract.clients[0] : contract.clients;
  return clients?.full_name?.trim() || "Unknown client";
}

export function formatContractOverlapMessage(contract: ContractOverlapRow): string {
  return `${VEHICLE_OVERLAP_MESSAGE} Conflict: ${getClientName(contract)}, contract ${contract.id
    .slice(0, 8)
    .toUpperCase()}, ${formatDateTimeLabel(contract.start_date, contract.start_time)} to ${formatDateTimeLabel(
    contract.end_date,
    contract.end_time,
  )}, status ${contract.status || "unknown"}.`;
}

export async function findVehicleContractOverlap(db: any, input: VehicleOverlapInput): Promise<ContractOverlapRow | null> {
  const vehicleId = input.carId ?? input.vehicleId;
  if (!vehicleId) throw new Error("Vehicle is required before checking availability.");

  const newStart = parseContractDateTime(input.startDate, input.startTime);
  const newEnd = parseContractDateTime(input.endDate, input.endTime);
  if (Number.isNaN(newStart.getTime()) || Number.isNaN(newEnd.getTime()) || newEnd <= newStart) {
    throw new Error("End date and time must be after start date and time.");
  }

  const attemptedErrors: string[] = [];

  for (const fields of CONTRACT_FIELD_SETS) {
    let query = db
      .from("contracts")
      .select(
        [
          "id",
          "status",
          `start_date:${fields.startDateField}`,
          `start_time:${fields.startTimeField}`,
          `end_date:${fields.endDateField}`,
          `end_time:${fields.endTimeField}`,
          "clients(full_name)",
        ].join(", "),
      )
      .eq(fields.vehicleField, vehicleId)
      .lte(fields.startDateField, input.endDate)
      .gte(fields.endDateField, input.startDate);

    if (input.excludeContractId) {
      query = query.neq("id", input.excludeContractId);
    }

    const { data, error } = await query;
    if (error) {
      attemptedErrors.push(`${fields.vehicleField}: ${error.message}`);
      console.info("[FleetDesk overlap check]", {
        operation: input.operation ?? "unknown",
        ok: false,
        vehicleField: fields.vehicleField,
        startDateField: fields.startDateField,
        startTimeField: fields.startTimeField,
        endDateField: fields.endDateField,
        endTimeField: fields.endTimeField,
        error: error.message,
      });
      continue;
    }

    const conflict = findOverlappingContract((data ?? []) as ContractOverlapRow[], newStart, newEnd);
    console.info("[FleetDesk overlap check]", {
      operation: input.operation ?? "unknown",
      ok: true,
      vehicleField: fields.vehicleField,
      startDateField: fields.startDateField,
      startTimeField: fields.startTimeField,
      endDateField: fields.endDateField,
      endTimeField: fields.endTimeField,
      candidateCount: data?.length ?? 0,
      hasConflict: !!conflict,
    });

    return conflict;
  }

  throw new Error(`Could not check vehicle availability. Tried fields: ${attemptedErrors.join("; ")}`);
}
