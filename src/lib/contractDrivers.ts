import { supabase } from "@/lib/supabase";

export interface ContractDriverClient {
  id: string;
  full_name: string;
  phone: string;
  client_type: string;
  emirates_id: string | null;
  passport_number: string | null;
  license_number: string;
  license_expiry: string | null;
}

export interface ContractDriverRow {
  id: string;
  contract_id: string;
  client_id: string;
  position: number;
  signature: string | null;
  signed_at: string | null;
  clients: ContractDriverClient | null;
}

export async function saveContractDrivers(
  contractId: string,
  ownerId: string,
  clientIds: string[],
): Promise<void> {
  if (clientIds.length === 0) return;

  const rows = clientIds.map((clientId, index) => ({
    contract_id: contractId,
    client_id: clientId,
    owner_id: ownerId,
    position: index + 1,
  }));

  // contract_drivers is newer than the generated Supabase types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("contract_drivers").insert(rows);
  if (error) throw error;
}

export async function getContractDrivers(contractId: string): Promise<ContractDriverRow[]> {
  // contract_drivers is newer than the generated Supabase types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("contract_drivers")
    .select(
      "id, contract_id, client_id, position, signature, signed_at, clients(id, full_name, phone, client_type, emirates_id, passport_number, license_number, license_expiry)",
    )
    .eq("contract_id", contractId)
    .order("position", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ContractDriverRow[];
}

export async function saveContractDriverSignatures(
  signatures: Array<{ id: string; signature: string }>,
): Promise<void> {
  const signedAt = new Date().toISOString();

  for (const item of signatures) {
    // contract_drivers is newer than the generated Supabase types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("contract_drivers")
      .update({ signature: item.signature, signed_at: signedAt })
      .eq("id", item.id);

    if (error) throw error;
  }
}
