export interface ReplacementContractPeriod {
  id: string;
  start_date: string;
  end_date: string;
}

export interface ReplacementFeePeriod {
  id: string;
  label: string;
  amount: number | string;
  extension_start: string | null;
  extension_end: string | null;
  created_at?: string | null;
}

export interface ReplacementBillingPeriod {
  id: string;
  type: "contract" | "fee";
  billingId: string | null;
  start: string;
  end: string;
  extensionNumber?: number;
}

const RENT_EXTENSION_CHARGE_PATTERN = /^Rent Extension #(\d+)$/i;

const compareNullable = (a: string | null | undefined, b: string | null | undefined) =>
  String(a ?? "").localeCompare(String(b ?? ""));

export function buildReplacementBillingPeriods(
  contract: ReplacementContractPeriod,
  fees: ReplacementFeePeriod[],
): ReplacementBillingPeriod[] {
  const extensionMarkers = fees
    .filter((fee) => Boolean(fee.extension_start && fee.extension_end))
    .sort((a, b) => {
      const startCompare = compareNullable(a.extension_start, b.extension_start);
      if (startCompare !== 0) return startCompare;
      const endCompare = compareNullable(a.extension_end, b.extension_end);
      if (endCompare !== 0) return endCompare;
      const createdCompare = compareNullable(a.created_at, b.created_at);
      if (createdCompare !== 0) return createdCompare;
      return a.id.localeCompare(b.id);
    });

  const chargeByExtensionNumber = new Map<number, ReplacementFeePeriod>();
  fees.forEach((fee) => {
    if (fee.extension_start || fee.extension_end) return;
    const match = fee.label.trim().match(RENT_EXTENSION_CHARGE_PATTERN);
    if (!match) return;

    const extensionNumber = Number(match[1]);
    if (!Number.isInteger(extensionNumber) || extensionNumber <= 0) return;
    if (!chargeByExtensionNumber.has(extensionNumber)) {
      chargeByExtensionNumber.set(extensionNumber, fee);
    }
  });

  const originalEnd = extensionMarkers[0]?.extension_start ?? contract.end_date;
  const periods: ReplacementBillingPeriod[] = [
    {
      id: contract.id,
      type: "contract",
      billingId: contract.id,
      start: contract.start_date,
      end: originalEnd,
    },
  ];

  extensionMarkers.forEach((marker, index) => {
    const extensionNumber = index + 1;
    const charge = chargeByExtensionNumber.get(extensionNumber);
    const legacyMarkerCarriesCharge = Number(marker.amount) > 0;

    periods.push({
      id: marker.id,
      type: "fee",
      billingId: charge?.id ?? (legacyMarkerCarriesCharge ? marker.id : null),
      start: marker.extension_start!,
      end: marker.extension_end!,
      extensionNumber,
    });
  });

  return periods;
}
