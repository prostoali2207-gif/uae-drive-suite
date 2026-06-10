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

type RentalPeriod = {
  id: string;
  start: string | null;
  end: string | null;
  amount: number;
  periodNumber: number;
};

type RentalHistoryBlockProps = {
  contract: RentalHistoryContract;
  extensions: RentalExtension[];
  onManagePeriods?: () => void;
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

const StatusBadge = ({ status }: { status: string }) => {
  const isActive = status.toLowerCase() === "active";
  return (
    <span
      className={
        isActive
          ? "rounded-full bg-green-400/10 px-2 py-0.5 text-[10px] font-medium text-green-400"
          : "rounded-full bg-[#1a1a1a] px-2 py-0.5 text-[10px] font-medium text-[#777]"
      }
    >
      {isActive ? "Active" : "Closed"}
    </span>
  );
};

export const RentalHistoryBlock = ({
  contract,
  extensions,
  onManagePeriods,
}: RentalHistoryBlockProps) => {
  const [expanded, setExpanded] = useState(getInitialExpanded);
  const sortedExtensions = [...extensions].sort((a, b) => {
    const aStart = a.extension_start ?? readExtensionDateFromLabel(a.label, 1) ?? "";
    const bStart = b.extension_start ?? readExtensionDateFromLabel(b.label, 1) ?? "";
    return aStart.localeCompare(bStart);
  });
  const firstExtensionStart =
    sortedExtensions[0]?.extension_start ?? readExtensionDateFromLabel(sortedExtensions[0]?.label ?? "", 1);
  const periods: RentalPeriod[] = [
    {
      id: "base-rental",
      start: contract.start_date,
      end: firstExtensionStart ?? contract.end_date,
      amount: Number(contract.rate_amount),
      periodNumber: 1,
    },
    ...sortedExtensions.map((extension, index) => ({
      id: extension.id,
      start: extension.extension_start ?? readExtensionDateFromLabel(extension.label, 1),
      end: extension.extension_end ?? readExtensionDateFromLabel(extension.label, 2),
      amount: Number(extension.amount),
      periodNumber: index + 2,
    })),
  ];
  const currentPeriod = periods.at(-1) ?? periods[0];
  const previousPeriods = periods.slice(0, -1).reverse();
  const totalAmount = periods.reduce((sum, period) => sum + Number(period.amount), 0);
  const totalDays = periods.reduce((sum, period) => sum + diffDays(period.start, period.end), 0);
  const getPeriodLabel = (period: RentalPeriod) =>
    period.periodNumber === 1 ? "Original Contract" : "Previous Period";

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card/60">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="text-sm font-semibold text-foreground">Rental History</span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
        <span className="font-mono text-sm font-semibold text-foreground">
          {formatAed(totalAmount)}
        </span>
        {onManagePeriods && (
          <button
            type="button"
            className="h-8 shrink-0 rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-muted"
            onClick={onManagePeriods}
          >
            Manage Periods
          </button>
        )}
      </div>

      {expanded && (
        <>
          <div>
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-4 sm:gap-4">
              <div className="min-w-[150px] flex-1">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-green-400">
                  Current Period
                </div>
                <div className="font-mono text-sm font-semibold text-foreground">
                  {formatDate(currentPeriod.start)} → {formatDate(currentPeriod.end)}
                </div>
                <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {diffDays(currentPeriod.start, currentPeriod.end)} days
                </div>
              </div>
              <StatusBadge status={contract.status} />
              <div className="font-mono text-sm font-semibold text-foreground">
                {formatAed(currentPeriod.amount)}
              </div>
            </div>

            {previousPeriods.map((period) => (
              <div
                key={period.id}
                className="flex items-center gap-3 border-b border-border px-4 py-4 last:border-b-0 sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-foreground">
                    {getPeriodLabel(period)}
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {formatDate(period.start)} → {formatDate(period.end)}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {diffDays(period.start, period.end)} days
                  </div>
                </div>
                <div className="font-mono text-sm font-semibold text-foreground">
                  {formatAed(period.amount)}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 border-t border-border bg-muted/20">
            <div className="border-r border-border px-4 py-3">
              <div className="text-[11px] text-muted-foreground">Total rental days</div>
              <div className="mt-1 font-mono text-sm font-semibold text-foreground">
                {totalDays} days
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[11px] text-muted-foreground">Total rental amount</div>
              <div className="mt-1 font-mono text-sm font-semibold text-foreground">
                {formatAed(totalAmount)}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
