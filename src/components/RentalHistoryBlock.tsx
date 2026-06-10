import { useState } from "react";
import { ChevronDown } from "lucide-react";

type RentalHistoryContract = {
  start_date: string;
  end_date: string;
  rate_amount: number;
  status: string;
};

type RentalExtension = {
  id: string;
  label: string;
  amount: number;
  extension_start?: string | null;
  extension_end?: string | null;
};

type RentalHistoryBlockProps = {
  contract: RentalHistoryContract;
  extensions: RentalExtension[];
};

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const diffDays = (start: string | null | undefined, end: string | null | undefined) => {
  if (!start || !end) return 0;
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return 0;
  return Math.max(0, Math.round((endTime - startTime) / 86_400_000));
};

const formatAed = (amount: number) => `AED ${Number(amount).toLocaleString()}`;

const readExtensionDateFromLabel = (label: string, index: 1 | 2) => {
  const match = label
    .trim()
    .match(/^Rental Extension:\s*(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})$/i);
  return match?.[index] ?? null;
};

const getInitialExpanded = () => {
  if (typeof window === "undefined") return true;
  return window.innerWidth >= 640;
};

const StatusBadge = ({ status }: { status: "Active" | "Closed" }) => (
  <span
    className={
      status === "Active"
        ? "rounded-full bg-green-400/10 px-2 py-0.5 text-[10px] font-medium text-green-400"
        : "rounded-full bg-[#1a1a1a] px-2 py-0.5 text-[10px] font-medium text-[#777]"
    }
  >
    {status}
  </span>
);

export const RentalHistoryBlock = ({ contract, extensions }: RentalHistoryBlockProps) => {
  const [expanded, setExpanded] = useState(getInitialExpanded);
  const sortedExtensions = [...extensions].sort((a, b) => {
    const aStart = a.extension_start ?? readExtensionDateFromLabel(a.label, 1) ?? "";
    const bStart = b.extension_start ?? readExtensionDateFromLabel(b.label, 1) ?? "";
    return aStart.localeCompare(bStart);
  });
  const total = Number(contract.rate_amount) + sortedExtensions.reduce((sum, extension) => sum + Number(extension.amount), 0);
  const firstExtensionStart =
    sortedExtensions[0]?.extension_start ?? readExtensionDateFromLabel(sortedExtensions[0]?.label ?? "", 1);
  const baseEnd = firstExtensionStart ?? contract.end_date;
  const rowCount = 1 + sortedExtensions.length;
  const baseStatus: "Active" | "Closed" =
    sortedExtensions.length === 0 && contract.status.toLowerCase() === "active" ? "Active" : "Closed";

  return (
    <div className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[#888]">
          RENTAL HISTORY
        </span>
        <span className="ml-auto font-mono text-[13px] font-semibold text-white">
          {formatAed(total)}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-[#888] transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div>
          <div className={`flex items-center gap-3 px-4 py-3 ${rowCount > 1 ? "border-b border-[#161616]" : ""}`}>
            <div className="flex min-h-[44px] w-3 shrink-0 flex-col items-center">
              <span
                className={
                  baseStatus === "Active"
                    ? "w-2 h-2 rounded-full bg-green-400 shadow shadow-green-400/50"
                    : "w-2 h-2 rounded-full bg-[#333]"
                }
              />
              {rowCount > 1 && <span className="w-px flex-1 min-h-[20px] bg-[#222] mx-auto" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-white">Base rental</div>
              <div className="font-mono text-[11px] text-[#666]">
                {formatDate(contract.start_date)} → {formatDate(baseEnd)} - {diffDays(contract.start_date, baseEnd)} days
              </div>
            </div>
            <StatusBadge status={baseStatus} />
            <div className="font-mono text-[13px] font-semibold text-white">
              {formatAed(Number(contract.rate_amount))}
            </div>
          </div>

          {sortedExtensions.map((extension, index) => {
            const extensionStart = extension.extension_start ?? readExtensionDateFromLabel(extension.label, 1);
            const extensionEnd = extension.extension_end ?? readExtensionDateFromLabel(extension.label, 2);
            const isLast = index === sortedExtensions.length - 1;

            return (
              <div
                key={extension.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-[#161616] last:border-b-0"
              >
                <div className="flex min-h-[44px] w-3 shrink-0 flex-col items-center">
                  <span
                    className={
                      isLast
                        ? "w-2 h-2 rounded-full bg-green-400 shadow shadow-green-400/50"
                        : "w-2 h-2 rounded-full bg-[#333]"
                    }
                  />
                  {!isLast && <span className="w-px flex-1 min-h-[20px] bg-[#222] mx-auto" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-white">Rental extension</div>
                  <div className="font-mono text-[11px] text-[#666]">
                    {formatDate(extensionStart)} → {formatDate(extensionEnd)} - {diffDays(extensionStart, extensionEnd)} days
                  </div>
                </div>
                <StatusBadge status={isLast ? "Active" : "Closed"} />
                <div className="font-mono text-[13px] font-semibold text-white">
                  {formatAed(Number(extension.amount))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
