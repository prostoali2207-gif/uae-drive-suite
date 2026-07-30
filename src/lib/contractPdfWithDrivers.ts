import { generateContractPdf as generateBaseContractPdf } from "./contractPdf";
import { getContractDrivers } from "./contractDrivers";

type ContractPdfInput = Parameters<typeof generateBaseContractPdf>[0];
type ContractPdfOptions = Parameters<typeof generateBaseContractPdf>[1];

/**
 * Keeps every PDF generation path consistent.
 * Contract Details may pass only the contract row, so saved additional drivers
 * are loaded here before the existing PDF renderer runs.
 */
export async function generateContractPdf(
  contract: ContractPdfInput,
  options?: ContractPdfOptions,
): ReturnType<typeof generateBaseContractPdf> {
  const savedDrivers = contract.contract_drivers?.length
    ? contract.contract_drivers
    : await getContractDrivers(contract.id);

  return generateBaseContractPdf(
    {
      ...contract,
      contract_drivers: savedDrivers,
    },
    options,
  );
}
