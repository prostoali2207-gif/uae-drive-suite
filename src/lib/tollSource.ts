export type TollSource = "salik" | "darb";

// Darb is stored in the existing salik ledger with its own stable ID namespace.
// Older Salik rows can have no transaction ID; they still belong to Salik.
export function isDarbTransaction(transactionId: string | null | undefined): boolean {
  return transactionId?.startsWith("DARB:") ?? false;
}

export function filterTollSource<T extends { transaction_id?: string | null }>(
  charges: T[],
  source: TollSource,
): T[] {
  return charges.filter((charge) => isDarbTransaction(charge.transaction_id) === (source === "darb"));
}
