import { CalendarDays, ChevronRight } from "lucide-react";

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
  periodDueById?: Record<string, number>;
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

const StatusBadge = ({ status }: { status: "Paid" | "Unpaid" }) => {
  const isPaid = status === "Paid";
  return (
    <span
      className={
        isPaid
          ? "rounded-full bg-tint-green px-2 py-0.5 text-[10px] font-medium text-tint-green-foreground"
          : "rounded-full bg-tint-rose px-2 py-0.5 text-[10px] font-medium text-tint-rose-foreground"
      }
    >
      {status}
    </span>
  );
};

export const RentalHistoryBlock = ({
  contract,
  extensions,
  onManagePeriods,
  periodDueById = {},
}: RentalHistoryBlockProps) => {
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

  const getPeriodLabel = (period: RentalPeriod) =>
    period.periodNumber === 1 ? "Original Contract" : `Extension #${period.periodNumber - 1}`;
  const getPeriodStatus = (period: RentalPeriod): "Paid" | "Unpaid" =>
    Number(periodDueById[period.id] ?? 0) > 0.01 ? "Unpaid" : "Paid";

  return (
    <div className="divide-y divide-border/50">
      {periods.map((period) => (
        <div key={period.id} className="flex min-h-14 items-center gap-3 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-tint-blue text-tint-blue-foreground">
            <CalendarDays className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-foreground">{getPeriodLabel(period)}</div>
            <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {formatDate(period.start)} - {formatDate(period.end)} ({diffDays(period.start, period.end)} days)
            </div>
          </div>
          <StatusBadge status={getPeriodStatus(period)} />
          <div className="w-28 text-right font-mono text-sm font-semibold tabular-nums text-foreground">
            {formatAed(period.amount)}
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      ))}
      {onManagePeriods ? (
        <div className="hidden px-4 py-3">
          <button
            type="button"
            className="h-8 shrink-0 rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-muted"
            onClick={onManagePeriods}
          >
            Manage Periods
          </button>
        </div>
      ) : null}
    </div>
  );
};
