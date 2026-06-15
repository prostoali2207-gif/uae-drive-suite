import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Pencil,
  Save,
  X,
  Download,
  Plus,
  CalendarPlus,
  CheckCircle2,
  FileText,
  Receipt,
  Clock,
  LayoutGrid,
  Wallet,
  AlertCircle,
  History,
  Trash2,
  Tag,
  Camera,
  Search,
  Filter,
  ExternalLink,
  CalendarDays,
  Route,
  CarFront,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from "lucide-react";
import { RecordPaymentModal, type PaymentAllocationLine } from "@/components/RecordPaymentModal";
import { ReplaceVehicleModal } from "@/components/ReplaceVehicleModal";
import { VehicleHistorySheet } from "@/components/VehicleHistorySheet";
import FinesModal from "@/components/FinesModal";
import SalikModal from "@/components/SalikModal";
import FinesDetailModal from "@/components/FinesDetailModal";
import SalikDetailModal from "@/components/SalikDetailModal";
import { InspectionPhotosTab } from "@/components/inspection/InspectionPhotosTab";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { findVehicleContractOverlap, formatContractOverlapMessage } from "@/lib/contractOverlap";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface ContractRecord {
  id: string;
  owner_id: string;
  client_id: string;
  car_id: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  rate_type: string;
  rate_amount: number;
  total_amount: number;
  deposit_amount: number;
  initial_mileage: number;
  fuel_level: string;
  status: string;
  payment_status: string;
  created_at: string;
  notes?: string | null;
  clients: {
    full_name: string;
    phone: string;
    email: string | null;
    emirates_id: string | null;
    passport_number: string | null;
    nationality: string;
    client_type: string;
  } | null;
  cars: {
    plate: string;
    make: string;
    model: string;
    year: number;
  } | null;
}

interface AvailableCarRow {
  id: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  status: string;
}

interface FineRow {
  id: string;
  fine_date: string;
  created_at?: string | null;
  fine_number?: string | null;
  fine_type: string;
  amount: number;
  status: string;
  source: string;
  notes?: string | null;
}

interface SalikRow {
  id: string;
  charge_date: string;
  created_at?: string | null;
  transaction_id?: string | null;
  toll_gate?: string | null;
  direction?: string | null;
  trips: number;
  amount: number;
  status: string;
  notes?: string | null;
}

interface PaymentRow {
  id: string;
  payment_date: string;
  amount: number;
  method: string;
  status: string;
  allocations?: unknown;
}

interface ExtensionCandidateRow {
  id: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  status: string;
  clients: { full_name: string } | null;
}

type FeeCategory =
  | "delivery"
  | "pickup"
  | "fuel"
  | "extra_mileage"
  | "damage"
  | "detailing"
  | "other";

interface ContractFeeRow {
  id: string;
  category: FeeCategory;
  label: string;
  amount: number;
  extension_start?: string | null;
  extension_end?: string | null;
  created_at?: string | null;
}

type AmountEditTarget =
  | { type: "rental"; label: string; amount: number }
  | { type: "payment"; label: string; amount: number; payment: PaymentRow }
  | { type: "fee"; label: string; amount: number; fee: ContractFeeRow };

type ContractFinancialTotals = {
  charges: number;
  credits: number;
  outstanding: number;
  overdue: number;
};

type ChargeImportEvidence = {
  finesLastImportAt: string | null;
  salikLastImportAt: string | null;
};

type ContractPaymentAllocationLine = PaymentAllocationLine & {
  dueDate?: string | null;
  overdueImmediately?: boolean;
};

type DepositCloseAction =
  | "return_full"
  | "apply_to_balance"
  | "retain_partial"
  | "retain_full";

type DepositReconciliationInfo = {
  status: string;
  depositHeld: number;
  appliedToBalance: number;
  retained: number;
  pendingReturn: number;
  returnDue: string | null;
  reason: string | null;
  returnedAmount: number;
  returnedDate: string | null;
};

type LedgerEntry = {
  id: string;
  date: string;
  type: "Rental" | "Salik" | "Payment" | "Fine" | "Deposit";
  description: string;
  debit: number;
  credit: number;
  status: string;
};

const statusBadgeClass = (status: string) => {
  switch (status) {
    case "Active":
      return "bg-tint-blue text-tint-blue-foreground border-tint-blue-foreground/20";
    case "Expiring Soon":
      return "bg-tint-amber text-tint-amber-foreground border-tint-amber-foreground/20";
    case "Overdue":
      return "bg-tint-rose text-tint-rose-foreground border-tint-rose-foreground/20";
    case "Completed":
      return "bg-tint-green text-tint-green-foreground border-tint-green-foreground/20";
    case "Cancelled":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getChargeVerificationLabel(recordCount: number, lastImportAt: string | null): string {
  if (recordCount > 0) return `${recordCount} records`;
  if (lastImportAt) return `0 records - Last import: ${formatDate(lastImportAt)}`;
  return "Not imported yet";
}

function diffDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return Math.max(0, Math.round((e - s) / 86_400_000));
}

function formatTimeForDb(time: string | undefined): string {
  if (!time || time.trim() === "") return "12:00:00";
  const trimmed = time.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  return "12:00:00";
}

function formatTimeDisplay(time: string | null | undefined): string {
  if (!time) return "12:00";
  const match = time.match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : "12:00";
}

function getTomorrowDateInput(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const year = tomorrow.getFullYear();
  const month = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const day = String(tomorrow.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayDateInput(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysToDateInput(value: string, daysToAdd: number): string {
  const datePart = value?.slice(0, 10) || getTodayDateInput();
  const date = new Date(`${datePart}T00:00:00`);
  date.setDate(date.getDate() + daysToAdd);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const fmtAed = (n: number) => `AED ${Number(n).toLocaleString()}`;
const contractNumberLabel = (id: string) => `CTR-${id.slice(0, 8).toUpperCase()}`;

const RENTAL_EXTENSION_LABEL = "Rental Extension";
const RENTAL_EXTENSION_CATEGORY: FeeCategory = "other";
const DEPOSIT_RECONCILIATION_PREFIX = "[Deposit reconciliation]";
const DEPOSIT_RETURN_PREFIX = "[Deposit return]";

const buildRentalExtensionLabel = (periodStart: string, periodEnd: string) =>
  `${RENTAL_EXTENSION_LABEL}: ${periodStart} - ${periodEnd}`;

const parseRentalExtensionPeriod = (label: string) => {
  const match = label
    .trim()
    .match(/^Rental Extension:\s*(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})$/i);

  if (!match) return null;
  return { periodStart: match[1], periodEnd: match[2] };
};

const parseAedAmount = (value: string | null | undefined): number => {
  if (!value) return 0;
  const numeric = value.replace(/[^\d.-]/g, "");
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDepositNoteLine = (line: string): Record<string, string> | null => {
  if (!line.includes(DEPOSIT_RECONCILIATION_PREFIX) && !line.includes(DEPOSIT_RETURN_PREFIX)) {
    return null;
  }

  return Object.fromEntries(
    line
      .split("|")
      .map((part) => part.trim())
      .map((part) => {
        const clean = part
          .replace(DEPOSIT_RECONCILIATION_PREFIX, "")
          .replace(DEPOSIT_RETURN_PREFIX, "")
          .trim();
        const separator = clean.indexOf(":");
        if (separator === -1) return null;
        return [clean.slice(0, separator).trim(), clean.slice(separator + 1).trim()];
      })
      .filter((entry): entry is [string, string] => Boolean(entry)),
  );
};

const getDepositReconciliationInfo = (
  contract: Pick<ContractRecord, "deposit_amount" | "notes">,
): DepositReconciliationInfo => {
  const notes = contract.notes ?? "";
  const lines = notes.split("\n").map((line) => line.trim()).filter(Boolean);
  const latestReconciliation = [...lines]
    .reverse()
    .find((line) => line.includes(DEPOSIT_RECONCILIATION_PREFIX));
  const latestReturn = [...lines]
    .reverse()
    .find((line) => line.includes(DEPOSIT_RETURN_PREFIX));
  const reconciliation = latestReconciliation ? parseDepositNoteLine(latestReconciliation) : null;
  const returned = latestReturn ? parseDepositNoteLine(latestReturn) : null;

  const returnedAmount = parseAedAmount(returned?.["Returned amount"]);
  const returnedDate = returned?.["Returned date"] ?? null;

  if (returnedAmount > 0 || returnedDate) {
    return {
      status: "Returned",
      depositHeld: Number(contract.deposit_amount) || 0,
      appliedToBalance: parseAedAmount(reconciliation?.["Applied to balance"]),
      retained: parseAedAmount(reconciliation?.Retained),
      pendingReturn: 0,
      returnDue: reconciliation?.["Return due"] ?? null,
      reason: reconciliation?.Reason ?? null,
      returnedAmount,
      returnedDate,
    };
  }

  if (!reconciliation) {
    return {
      status: "Held",
      depositHeld: Number(contract.deposit_amount) || 0,
      appliedToBalance: 0,
      retained: 0,
      pendingReturn: Number(contract.deposit_amount) || 0,
      returnDue: null,
      reason: null,
      returnedAmount: 0,
      returnedDate: null,
    };
  }

  const pendingReturn = parseAedAmount(reconciliation["Pending return"]);
  const retained = parseAedAmount(reconciliation.Retained);
  const appliedToBalance = parseAedAmount(reconciliation["Applied to balance"]);
  let status = reconciliation.Status ?? "Held";

  if (retained > 0 && pendingReturn <= 0) {
    status = "Retained";
  } else if (appliedToBalance > 0 && pendingReturn <= 0 && retained <= 0) {
    status = "Applied / Used";
  } else if (pendingReturn > 0) {
    status = "Pending return";
  }

  return {
    status,
    depositHeld: parseAedAmount(reconciliation["Deposit held"]) || Number(contract.deposit_amount) || 0,
    appliedToBalance,
    retained,
    pendingReturn,
    returnDue: reconciliation["Return due"] ?? null,
    reason: reconciliation.Reason ?? null,
    returnedAmount: 0,
    returnedDate: null,
  };
};

const isRentalExtensionFee = (fee: ContractFeeRow) => Boolean(fee.extension_start && fee.extension_end);

const isStructuredRentalExtensionFee = (fee: ContractFeeRow) => Boolean(fee.extension_start);

const sortRentalExtensionFees = (fees: ContractFeeRow[]) =>
  [...fees].filter(isRentalExtensionFee).sort((a, b) => {
    const startCompare = String(a.extension_start).localeCompare(String(b.extension_start));
    if (startCompare !== 0) return startCompare;
    const endCompare = String(a.extension_end).localeCompare(String(b.extension_end));
    if (endCompare !== 0) return endCompare;
    return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
  });

const getLatestRentalPeriodEnd = (contract: Pick<ContractRecord, "end_date">, fees: ContractFeeRow[]) => {
  const sortedExtensions = sortRentalExtensionFees(fees);
  return sortedExtensions[sortedExtensions.length - 1]?.extension_end ?? contract.end_date;
};

const formatRentalExtensionPeriod = (fee: ContractFeeRow) => {
  if (fee.extension_start && fee.extension_end) {
    return `${formatDate(fee.extension_start)} - ${formatDate(fee.extension_end)} - ${diffDays(fee.extension_start, fee.extension_end)} days`;
  }

  const period = parseRentalExtensionPeriod(fee.label);
  if (!period) return "Rental extension";
  return `${formatDate(period.periodStart)} - ${formatDate(period.periodEnd)} - ${diffDays(period.periodStart, period.periodEnd)} days`;
};

type SavedPaymentAllocations = {
  rental?: number;
  fines?: number;
  salik?: number;
  fees?: number;
  lines?: Record<string, number>;
};

type PaymentAllocationDisplayLine = {
  id: string;
  category: "rental" | "fines" | "salik" | "fees";
  label: string;
  amount: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readSavedPaymentAllocations = (value: unknown): SavedPaymentAllocations | null => {
  if (!isRecord(value)) return null;

  const linesValue = value.lines;
  const lines = isRecord(linesValue)
    ? Object.fromEntries(
        Object.entries(linesValue)
          .map(([key, amount]) => [key, Number(amount)])
          .filter(([, amount]) => Number.isFinite(amount) && amount > 0),
      )
    : undefined;

  return {
    rental: Number(value.rental) || undefined,
    fines: Number(value.fines) || undefined,
    salik: Number(value.salik) || undefined,
    fees: Number(value.fees) || undefined,
    lines,
  };
};

const PAYMENT_ALLOCATION_CATEGORY_LABELS: Record<PaymentAllocationDisplayLine["category"], string> = {
  rental: "Rental",
  fees: "Other Fees",
  fines: "Traffic Fines",
  salik: "Salik",
};

const buildPaymentAllocationDisplay = (
  payment: PaymentRow,
  lineLookup: Map<string, Pick<PaymentAllocationDisplayLine, "category" | "label">>,
): PaymentAllocationDisplayLine[] | null => {
  const savedAllocations = readSavedPaymentAllocations(payment.allocations);
  if (!savedAllocations) return null;

  const lines: PaymentAllocationDisplayLine[] = [];
  let hasUnresolvedLine = false;

  if (savedAllocations.lines && Object.keys(savedAllocations.lines).length > 0) {
    Object.entries(savedAllocations.lines).forEach(([lineId, value]) => {
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount <= 0) return;

      const knownLine = lineLookup.get(lineId);
      if (!knownLine) {
        hasUnresolvedLine = true;
        return;
      }

      lines.push({
        id: lineId,
        category: knownLine.category,
        label: knownLine.label,
        amount,
      });
    });
    if (hasUnresolvedLine) return null;
  } else {
    (["rental", "fees", "fines", "salik"] as const).forEach((category) => {
      const amount = Number(savedAllocations[category] ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) return;
      lines.push({
        id: category,
        category,
        label: PAYMENT_ALLOCATION_CATEGORY_LABELS[category],
        amount,
      });
    });
  }

  if (lines.length === 0) return null;

  const allocationTotal = lines.reduce((sum, line) => sum + line.amount, 0);
  if (Math.abs(allocationTotal - Number(payment.amount)) > 0.01) return null;

  return lines;
};

const PaymentAllocationDetails = ({
  payment,
  lineLookup,
}: {
  payment: PaymentRow;
  lineLookup: Map<string, Pick<PaymentAllocationDisplayLine, "category" | "label">>;
}) => {
  const allocationLines = buildPaymentAllocationDisplay(payment, lineLookup);

  return (
    <div className="ml-10 mt-1 rounded-lg bg-zinc-900 p-2 text-xs">
      <div className="mb-1 font-medium text-muted-foreground">Applied to:</div>
      {allocationLines ? (
        <div className="grid gap-1">
          {allocationLines.map((line) => (
            <div key={line.id} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-foreground/85">{line.label}</span>
              <span className="shrink-0 font-mono font-semibold tabular-nums text-foreground">
                {fmtAed(line.amount)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-muted-foreground">Allocation details not available</div>
      )}
    </div>
  );
};

const FEE_CATEGORIES: { value: FeeCategory; label: string; defaultLabel: string }[] = [
  { value: "delivery", label: "Delivery", defaultLabel: "Delivery" },
  { value: "pickup", label: "Pickup", defaultLabel: "Pickup" },
  { value: "fuel", label: "Fuel", defaultLabel: "Fuel" },
  { value: "extra_mileage", label: "Extra Mileage", defaultLabel: "Extra Mileage" },
  { value: "damage", label: "Damage", defaultLabel: "Damage" },
  { value: "detailing", label: "Detailing", defaultLabel: "Detailing" },
  { value: "other", label: "Other", defaultLabel: "" },
];

const Field = ({ label, value }: { label: string; value?: string | number | null }) => (
  <div className="flex flex-col gap-0.5 py-1.5">
    <span className="text-[11px] uppercase tracking-wide text-muted-foreground/80">{label}</span>
    <span className="text-sm font-medium text-foreground">
      {value || value === 0 ? value : "—"}
    </span>
  </div>
);

const Panel = ({
  title,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) => (
  <section className={cn("min-w-0 rounded-lg border border-border bg-card", className)}>
    <header className="flex min-w-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        <h3 className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-foreground">{title}</h3>
      </div>
      {action}
    </header>
    <div className="min-w-0 px-4 py-3">{children}</div>
  </section>
);

const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
    <div className="rounded-full bg-muted p-2.5">
      <Icon className="h-4 w-4 text-muted-foreground" />
    </div>
    <p className="text-sm font-medium text-foreground">{title}</p>
    <p className="text-xs text-muted-foreground">{description}</p>
    {action}
  </div>
);

// ---------- Financials Accordion ----------

const STATUS_STYLES: Record<string, { dot: string; bg: string; text: string }> = {
  Paid: { dot: "bg-tint-green-foreground", bg: "bg-tint-green", text: "text-tint-green-foreground" },
  "Expiring Soon": { dot: "bg-tint-amber-foreground", bg: "bg-tint-amber", text: "text-tint-amber-foreground" },
  Upcoming: { dot: "bg-tint-blue-foreground", bg: "bg-tint-blue", text: "text-tint-blue-foreground" },
  "Charged to Client": { dot: "bg-tint-violet-foreground", bg: "bg-tint-violet", text: "text-tint-violet-foreground" },
  Unpaid: { dot: "bg-tint-rose-foreground", bg: "bg-tint-rose", text: "text-tint-rose-foreground" },
  Disputed: { dot: "bg-tint-amber-foreground", bg: "bg-tint-amber", text: "text-tint-amber-foreground" },
  Active: { dot: "bg-tint-blue-foreground", bg: "bg-tint-blue", text: "text-tint-blue-foreground" },
  Held: { dot: "bg-tint-violet-foreground", bg: "bg-tint-violet", text: "text-tint-violet-foreground" },
  Completed: { dot: "bg-tint-green-foreground", bg: "bg-tint-green", text: "text-tint-green-foreground" },
  Closed: { dot: "bg-muted-foreground", bg: "bg-muted", text: "text-muted-foreground" },
};

type AccentKey = "blue" | "red" | "cyan" | "purple";

const ACCENT_VAR: Record<AccentKey, string> = {
  blue: "hsl(var(--tint-blue-foreground))",
  red: "hsl(var(--tint-rose-foreground))",
  cyan: "hsl(var(--tint-blue-foreground))",
  purple: "hsl(var(--tint-violet-foreground))",
};

type AccordionRowProps = {
  label: string;
  count: number;
  total: number;
  accent: AccentKey;
  totalClass?: string;
  children: React.ReactNode;
};

const AccordionRow = ({
  label,
  count,
  total,
  accent,
  totalClass,
  children,
}: AccordionRowProps) => {
  const [open, setOpen] = useState(false);
  const accentColor = ACCENT_VAR[accent];
  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border bg-card transition-colors",
        open && "bg-muted/40",
      )}
      style={{ borderColor: open ? accentColor : "hsl(var(--border))" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-stretch gap-0 text-left"
      >
        <span className="w-[3px] shrink-0" style={{ backgroundColor: accentColor }} aria-hidden />
        <div className="flex flex-1 items-center justify-between gap-3 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
              {label}
            </span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
              {count}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("text-sm font-bold tabular-nums", totalClass ?? "text-foreground")}>
              {fmtAed(total)}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                open && "rotate-180",
              )}
            />
          </div>
        </div>
      </button>
      <div
        className={cn(
          "grid transition-all duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="max-h-[280px] overflow-y-auto bg-background/40 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border">
            {count === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">No entries.</div>
            ) : (
              children
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const StatusPill = ({ status }: { status: string }) => {
  const s = STATUS_STYLES[status] ?? {
    dot: "bg-muted-foreground",
    bg: "bg-muted",
    text: "text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium",
        s.bg,
        s.text,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {status}
    </span>
  );
};

const EntryRow = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("flex items-center gap-3 border-b border-border/40 px-3 py-2.5 last:border-b-0", className)}>
    {children}
  </div>
);

type FinancialsAccordionProps = {
  contract: ContractRecord;
  days: number;
  payments: PaymentRow[];
  fines: FineRow[];
  salik: SalikRow[];
  contractFees: ContractFeeRow[];
  totals: ContractFinancialTotals;
  onEditRentalAmount: () => void;
  onEditPaymentAmount: (payment: PaymentRow) => void;
  onEditFeeAmount: (fee: ContractFeeRow) => void;
  onDeletePayment: (payment: PaymentRow) => void;
  onDeleteFee: (fee: ContractFeeRow) => void;
  onUpdateFineNote: (id: string, note: string) => void;
  onUpdateSalikNote: (id: string, note: string) => void;
};

const FinancialsAccordion = ({
  contract,
  days,
  payments,
  fines,
  salik,
  contractFees,
  totals,
  onEditRentalAmount,
  onEditPaymentAmount,
  onEditFeeAmount,
  onDeletePayment,
  onDeleteFee,
  onUpdateFineNote,
  onUpdateSalikNote,
}: FinancialsAccordionProps) => {
  const rentalFees = sortRentalExtensionFees(contractFees);
  const latestRentalFeeId = rentalFees.at(-1)?.id;
  const originalRentalLabel = `${formatDate(contract.start_date)} -> ${formatDate(contract.end_date)}`;
  const rentalTotal = Number(contract.total_amount) + rentalFees.reduce((s, fee) => s + Number(fee.amount), 0);
  const paymentsTotal = payments.reduce((s, p) => s + Number(p.amount), 0);
  const finesTotal = fines.reduce((s, f) => s + Number(f.amount), 0);
  const salikTotal = salik.reduce((s, x) => s + Number(x.amount), 0);
  const otherFees = contractFees.filter((fee) => !isRentalExtensionFee(fee));
  const otherTotal = otherFees.reduce((s, o) => s + o.amount, 0);

  const [editingFineId, setEditingFineId] = useState<string | null>(null);
  const [fineNoteDraft, setFineNoteDraft] = useState("");
  const [savingFineNote, setSavingFineNote] = useState(false);
  const [fineMenuState, setFineMenuState] = useState<{
    id: string;
    top: number;
    right: number;
  } | null>(null);

  const openFineMenu = (
    e: React.MouseEvent<HTMLButtonElement>,
    fineId: string,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setFineMenuState({
      id: fineId,
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
  };

  const [editingSalikId, setEditingSalikId] = useState<string | null>(null);
  const [salikNoteDraft, setSalikNoteDraft] = useState("");
  const [savingSalikNote, setSavingSalikNote] = useState(false);
  const [salikMenuState, setSalikMenuState] = useState<{
    id: string;
    top: number;
    right: number;
  } | null>(null);

  const openSalikMenu = (
    e: React.MouseEvent<HTMLButtonElement>,
    salikId: string,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setSalikMenuState({
      id: salikId,
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
  };

  const [showFinesModal, setShowFinesModal] = useState(false);
  const [showSalikModal, setShowSalikModal] = useState(false);

  const FINES_PAGE_SIZE = 10;
  const SALIK_PAGE_SIZE = 20;
  const [finePage, setFinePage] = useState(0);
  const [salikPage, setSalikPage] = useState(0);
  const finesTotalPages = Math.max(1, Math.ceil(fines.length / FINES_PAGE_SIZE));
  const salikTotalPages = Math.max(1, Math.ceil(salik.length / SALIK_PAGE_SIZE));
  const finesPageItems = fines.slice(finePage * FINES_PAGE_SIZE, (finePage + 1) * FINES_PAGE_SIZE);
  const salikPageItems = salik.slice(salikPage * SALIK_PAGE_SIZE, (salikPage + 1) * SALIK_PAGE_SIZE);

  return (
    <>
      {fineMenuState !== null && (
        <>
          <div
            className="fixed inset-0 z-[100]"
            onClick={() => setFineMenuState(null)}
          />
          <div
            className="fixed z-[101] min-w-[120px] rounded-md border border-border bg-card py-1 shadow-md"
            style={{ top: fineMenuState.top, right: fineMenuState.right }}
          >
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted"
              onClick={() => {
                const fine = fines.find((f) => f.id === fineMenuState.id);
                setEditingFineId(fineMenuState.id);
                setFineNoteDraft(fine?.notes ?? "");
                setFineMenuState(null);
              }}
            >
              Add note
            </button>
          </div>
        </>
      )}

      {salikMenuState !== null && (
        <>
          <div
            className="fixed inset-0 z-[100]"
            onClick={() => setSalikMenuState(null)}
          />
          <div
            className="fixed z-[101] min-w-[120px] rounded-md border border-border bg-card py-1 shadow-md"
            style={{ top: salikMenuState.top, right: salikMenuState.right }}
          >
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted"
              onClick={() => {
                const entry = salik.find((s) => s.id === salikMenuState.id);
                setEditingSalikId(salikMenuState.id);
                setSalikNoteDraft(entry?.notes ?? "");
                setSalikMenuState(null);
              }}
            >
              Add note
            </button>
          </div>
        </>
      )}

    <div className="space-y-2">
      <AccordionRow label="Rental" count={1 + rentalFees.length} total={rentalTotal} accent="blue">
        <EntryRow>
          <span className="flex-1 truncate font-sans text-xs text-foreground/90">
            {originalRentalLabel}
          </span>
          <StatusPill status={rentalFees.length > 0 ? "Closed" : "Active"} />
          <span className="w-24 text-right font-mono text-sm font-bold tabular-nums text-foreground">
            {fmtAed(Number(contract.total_amount))}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Edit rental amount"
            className="h-11 w-11 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
            onClick={onEditRentalAmount}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </EntryRow>
        {rentalFees.map((fee) => (
          <EntryRow key={fee.id}>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-sans text-xs text-foreground/90">
                {RENTAL_EXTENSION_LABEL}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {formatRentalExtensionPeriod(fee)}
              </span>
            </div>
            <StatusPill status={fee.id === latestRentalFeeId ? "Active" : "Closed"} />
            <span className="w-24 text-right font-mono text-sm font-bold tabular-nums text-foreground">
              {fmtAed(Number(fee.amount))}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Edit extension"
              className="h-11 w-11 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
              onClick={() => onEditFeeAmount(fee)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </EntryRow>
        ))}
      </AccordionRow>

      <AccordionRow
        label="Payments"
        count={payments.length}
        total={paymentsTotal}
        accent="cyan"
        totalClass="font-mono text-tint-green-foreground"
      >
        {payments.map((payment) => (
          <EntryRow key={payment.id}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
              <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-xs text-foreground/90">
                {payment.method}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {formatDate(payment.payment_date)}
              </span>
            </div>
            <StatusPill status={payment.status} />
            <span className="w-24 text-right font-mono text-sm font-bold tabular-nums text-tint-green-foreground">
              {fmtAed(Number(payment.amount))}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Edit payment amount"
              className="h-11 w-11 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
              onClick={() => onEditPaymentAmount(payment)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Delete payment"
              className="h-11 w-11 shrink-0 text-muted-foreground hover:bg-transparent hover:text-destructive"
              onClick={() => onDeletePayment(payment)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </EntryRow>
        ))}
      </AccordionRow>

      {/* Traffic Fines — summary row */}
      <div className="flex w-full items-center justify-between rounded-md border border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">Traffic Fines</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            {fines.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold tabular-nums text-tint-rose-foreground">{fmtAed(finesTotal)}</span>
          <button
            type="button"
            onClick={() => setShowFinesModal(true)}
            className="text-[11px] font-medium text-tint-blue-foreground hover:underline"
          >
            View All →
          </button>
        </div>
      </div>

      {/* Salik — summary row */}
      <div className="flex w-full items-center justify-between rounded-md border border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">Salik</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            {salik.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold tabular-nums text-foreground">{fmtAed(salikTotal)}</span>
          <button
            type="button"
            onClick={() => setShowSalikModal(true)}
            className="text-[11px] font-medium text-tint-blue-foreground hover:underline"
          >
            View All →
          </button>
        </div>
      </div>

      <AccordionRow
        label="Other Fees"
        count={otherFees.length}
        total={otherTotal}
        accent="purple"
        totalClass="font-mono text-foreground"
      >
        {otherFees.map((o) => (
          <EntryRow key={o.id}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
            <span className="flex-1 truncate text-xs text-foreground/90">{o.label}</span>
            <span className="w-24 text-right font-mono text-sm font-bold tabular-nums text-foreground">
              {fmtAed(o.amount)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Edit fee amount"
              className="h-11 w-11 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
              onClick={() => onEditFeeAmount(o)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Delete fee"
              className="h-11 w-11 shrink-0 text-muted-foreground hover:bg-transparent hover:text-destructive"
              onClick={() => onDeleteFee(o)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </EntryRow>
        ))}
      </AccordionRow>


    </div>

      <FinesModal contractId={contract.id} open={showFinesModal} onOpenChange={setShowFinesModal} />
      <SalikModal contractId={contract.id} open={showSalikModal} onOpenChange={setShowSalikModal} />

    </>
  );
};

type FinancialsPanelProps = {
  contract: ContractRecord;
  days: number;
  payments: PaymentRow[];
  fines: FineRow[];
  salik: SalikRow[];
  chargeImportEvidence: ChargeImportEvidence;
  contractFees: ContractFeeRow[];
  unpaidAllocationLines: ContractPaymentAllocationLine[];
  totals: ContractFinancialTotals;
  onAddFee: () => void;
  onAddPayment: () => void;
  onEditRentalAmount: () => void;
  onEditPaymentAmount: (payment: PaymentRow) => void;
  onEditFeeAmount: (fee: ContractFeeRow) => void;
  onDeletePayment: (payment: PaymentRow) => void;
  onDeleteFee: (fee: ContractFeeRow) => void;
  onMarkDepositReturned: (amount: number) => void;
  markingDepositReturned: boolean;
};

const FinancialBadge = ({ status }: { status: string }) => {
  const key = status.toLowerCase();
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
        key === "paid" && "bg-tint-green text-tint-green-foreground",
        key === "returned" && "bg-tint-green text-tint-green-foreground",
        key === "active" && "bg-tint-blue text-tint-blue-foreground",
        key === "pending return" && "bg-tint-amber text-tint-amber-foreground",
        key === "retained" && "bg-tint-rose text-tint-rose-foreground",
        key === "held" && "bg-muted text-muted-foreground",
        key === "closed" && "bg-muted text-muted-foreground",
        key === "applied / used" && "bg-muted text-muted-foreground",
        !["paid", "returned", "active", "pending return", "retained", "held", "closed", "applied / used"].includes(key) && "bg-muted text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
};

const FinancialSection = ({
  title,
  meta,
  action,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section className="rounded-md border border-border bg-card">
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground">{title}</h3>
        {meta ? <div className="mt-0.5 text-[11px] text-muted-foreground">{meta}</div> : null}
      </div>
      {action}
    </div>
    <div className="divide-y divide-border/50">{children}</div>
  </section>
);

const FinancialLine = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("flex min-h-14 items-center gap-3 px-4 py-3", className)}>{children}</div>
);

const FinancialIconBox = ({
  icon: Icon,
  tone = "muted",
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone?: "blue" | "green" | "amber" | "violet" | "rose" | "muted";
}) => (
  <span
    className={cn(
      "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
      tone === "blue" && "bg-tint-blue text-tint-blue-foreground",
      tone === "green" && "bg-tint-green text-tint-green-foreground",
      tone === "amber" && "bg-tint-amber text-tint-amber-foreground",
      tone === "violet" && "bg-tint-violet text-tint-violet-foreground",
      tone === "rose" && "bg-tint-rose text-tint-rose-foreground",
      tone === "muted" && "bg-muted text-muted-foreground",
    )}
  >
    <Icon className="h-4 w-4" />
  </span>
);

type TransactionFilter = "all" | "charges" | "payments" | "adjustments";

type FinancialTransaction = {
  id: string;
  date: string;
  group: TransactionFilter;
  type: string;
  description: string;
  details?: string;
  amount: number;
  amountTone: "debit" | "credit";
  reference: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  iconTone: "blue" | "green" | "amber" | "violet" | "rose" | "muted";
  allocationPayment?: PaymentRow;
};

const FinancialsPanel = ({
  contract,
  days,
  payments,
  fines,
  salik,
  chargeImportEvidence,
  contractFees,
  unpaidAllocationLines,
  totals,
  onAddFee,
  onAddPayment,
  onEditRentalAmount,
  onEditPaymentAmount,
  onEditFeeAmount,
  onDeletePayment,
  onDeleteFee,
  onMarkDepositReturned,
  markingDepositReturned,
}: FinancialsPanelProps) => {
  const rentalExtensions = sortRentalExtensionFees(contractFees);
  const otherFees = contractFees.filter((fee) => !rentalExtensions.some((extension) => extension.id === fee.id));
  const paymentAllocationLineLookup = useMemo(() => {
    const lookup = new Map<string, Pick<PaymentAllocationDisplayLine, "category" | "label">>();
    lookup.set(`rental-${contract.id}`, { category: "rental", label: "Original Contract" });

    rentalExtensions.forEach((fee, index) => {
      lookup.set(`fee-${fee.id}`, { category: "rental", label: `Extension #${index + 1}` });
    });

    contractFees
      .filter((fee) => !rentalExtensions.some((extension) => extension.id === fee.id))
      .forEach((fee) => {
        lookup.set(`fee-${fee.id}`, { category: "fees", label: fee.label });
      });

    fines.forEach((fine) => {
      lookup.set(`fine-${fine.id}`, {
        category: "fines",
        label: fine.fine_number ? `${fine.fine_type} ${fine.fine_number}` : fine.fine_type,
      });
    });

    salik.forEach((charge) => {
      lookup.set(`salik-${charge.id}`, {
        category: "salik",
        label: charge.transaction_id ? `Salik ${charge.transaction_id}` : charge.toll_gate ? `Salik ${charge.toll_gate}` : "Salik",
      });
    });

    return lookup;
  }, [contract.id, contractFees, fines, rentalExtensions, salik]);
  const depositInfo = getDepositReconciliationInfo(contract);
  const rawDepositStatus = (contract as any).deposit_status;
  const depositStatus = rawDepositStatus === "Returned" ? "Returned" : depositInfo.status;
  const depositMethod =
    (contract as any).deposit_collection_method ||
    (contract as any).deposit_method ||
    (contract as any).deposit_payment_method;
  const finesVerificationLabel = getChargeVerificationLabel(fines.length, chargeImportEvidence.finesLastImportAt);
  const salikVerificationLabel = getChargeVerificationLabel(salik.length, chargeImportEvidence.salikLastImportAt);
  const hasUnverifiedAdditionalCharges =
    (fines.length === 0 && !chargeImportEvidence.finesLastImportAt) ||
    (salik.length === 0 && !chargeImportEvidence.salikLastImportAt);
  const showDepositVerificationWarning =
    Number(contract.deposit_amount) > 0 &&
    contract.status.toLowerCase() === "closed" &&
    depositStatus !== "Returned" &&
    depositInfo.pendingReturn > 0 &&
    hasUnverifiedAdditionalCharges;
  const canAddPayment = contract.status.toLowerCase() !== "closed" || totals.outstanding > 0;
  const [showFinesModal, setShowFinesModal] = useState(false);
  const [showSalikModal, setShowSalikModal] = useState(false);
  const [finesModalOpen, setFinesModalOpen] = useState(false);
  const [salikModalOpen, setSalikModalOpen] = useState(false);
  const [transactionFilter, setTransactionFilter] = useState<TransactionFilter>("all");
  const [transactionSearch, setTransactionSearch] = useState("");

  const openItemGroups = useMemo(() => {
    const groups = new Map<
      "rental" | "salik" | "fines" | "fees",
      {
        id: "rental" | "salik" | "fines" | "fees";
        title: string;
        detail: string;
        meta: string;
        due: number;
        icon: React.ComponentType<{ className?: string }>;
        iconTone: "blue" | "green" | "amber" | "violet";
      }
    >();

    unpaidAllocationLines.forEach((line) => {
      const existing = groups.get(line.category);
      const nextDue = (existing?.due ?? 0) + Number(line.due);
      const count = (unpaidAllocationLines.filter((item) => item.category === line.category).length);

      if (line.category === "rental") {
        groups.set("rental", {
          id: "rental",
          title: "Rent Outstanding",
          detail: `${count} unpaid ${count === 1 ? "period" : "periods"}`,
          meta: `${formatDate(contract.start_date)} - ${formatDate(getLatestRentalPeriodEnd(contract, rentalExtensions))}`,
          due: nextDue,
          icon: CalendarDays,
          iconTone: "blue",
        });
      }

      if (line.category === "salik") {
        groups.set("salik", {
          id: "salik",
          title: "Salik",
          detail: `${salik.filter((charge) => charge.status.toLowerCase() !== "paid").reduce((sum, charge) => sum + Number(charge.trips), 0)} trips`,
          meta: salikVerificationLabel,
          due: nextDue,
          icon: Route,
          iconTone: "green",
        });
      }

      if (line.category === "fines") {
        groups.set("fines", {
          id: "fines",
          title: "Traffic Fines",
          detail: `${fines.filter((fine) => fine.status.toLowerCase() !== "paid").length} fines`,
          meta: finesVerificationLabel,
          due: nextDue,
          icon: CarFront,
          iconTone: "amber",
        });
      }

      if (line.category === "fees") {
        groups.set("fees", {
          id: "fees",
          title: line.label || "Other unpaid charges",
          detail: count === 1 ? "1 unpaid charge" : `${count} unpaid charges`,
          meta: "Other unpaid charges",
          due: nextDue,
          icon: Tag,
          iconTone: "violet",
        });
      }
    });

    return Array.from(groups.values());
  }, [
    contract.end_date,
    contract.start_date,
    fines,
    finesVerificationLabel,
    rentalExtensions,
    salik,
    salikVerificationLabel,
    unpaidAllocationLines,
  ]);

  const transactions = useMemo<FinancialTransaction[]>(() => {
    const latestFineDate =
      fines.reduce((latest, fine) => {
        const currentTime = new Date(fine.fine_date).getTime() || 0;
        const latestTime = latest ? new Date(latest).getTime() || 0 : 0;
        return currentTime > latestTime ? fine.fine_date : latest;
      }, fines[0]?.fine_date ?? contract.start_date) || contract.start_date;
    const latestSalikDate =
      salik.reduce((latest, charge) => {
        const currentTime = new Date(charge.charge_date).getTime() || 0;
        const latestTime = latest ? new Date(latest).getTime() || 0 : 0;
        return currentTime > latestTime ? charge.charge_date : latest;
      }, salik[0]?.charge_date ?? contract.start_date) || contract.start_date;
    const finesTotal = fines.reduce((sum, fine) => sum + Number(fine.amount), 0);
    const salikTotal = salik.reduce((sum, charge) => sum + Number(charge.amount), 0);
    const salikTripCount = salik.reduce((sum, charge) => sum + Number(charge.trips), 0);

    const rows: FinancialTransaction[] = [
      {
        id: `rent-${contract.id}`,
        date: contract.start_date,
        group: "charges",
        type: "Rent",
        description: "Rent - Original Contract",
        details: `${formatDate(contract.start_date)} - ${formatDate(contract.end_date)}`,
        amount: Number(contract.total_amount),
        amountTone: "debit",
        reference: contractNumberLabel(contract.id),
        icon: CalendarDays,
        iconTone: "blue",
      },
      ...rentalExtensions.map((fee, index) => {
        return {
          id: `rent-extension-${fee.id}`,
          date: fee.extension_start ?? fee.created_at ?? contract.start_date,
          group: "charges" as const,
          type: "Rent",
          description: `Extension #${index + 1}`,
          details: `${formatDate(fee.extension_start)} -> ${formatDate(fee.extension_end)}`,
          amount: Number(fee.amount),
          amountTone: "debit" as const,
          reference: contractNumberLabel(contract.id),
          icon: CalendarDays,
          iconTone: "blue" as const,
        };
      }),
      ...otherFees.map((fee) => ({
        id: `fee-${fee.id}`,
        date: fee.created_at ?? contract.start_date,
        group: "charges" as const,
        type: "Charge",
        description: FEE_CATEGORIES.find((category) => category.value === fee.category)?.label ?? "Other fee",
        details: fee.label,
        amount: Number(fee.amount),
        amountTone: "debit" as const,
        reference: contractNumberLabel(contract.id),
        icon: Tag,
        iconTone: "violet" as const,
      })),
      ...(fines.length > 0 ? [{
        id: "fines-summary",
        date: latestFineDate,
        group: "charges" as const,
        type: "Fine",
        description: "Traffic Fines",
        details: `${fines.length} ${fines.length === 1 ? "violation" : "violations"}`,
        amount: finesTotal,
        amountTone: "debit" as const,
        reference: contractNumberLabel(contract.id),
        icon: CarFront,
        iconTone: "amber" as const,
      }] : []),
      ...(salik.length > 0 ? [{
        id: "salik-summary",
        date: latestSalikDate,
        group: "charges" as const,
        type: "Salik",
        description: "Salik Charges",
        details: `${salikTripCount} ${salikTripCount === 1 ? "trip" : "trips"}`,
        amount: salikTotal,
        amountTone: "debit" as const,
        reference: contractNumberLabel(contract.id),
        icon: Route,
        iconTone: "green" as const,
      }] : []),
      ...payments.map((payment) => ({
        id: `payment-${payment.id}`,
        date: payment.payment_date,
        group: "payments" as const,
        type: "Payment",
        description: `Payment - ${payment.method}`,
        details: `${payment.method} payment received`,
        amount: Number(payment.amount),
        amountTone: "credit" as const,
        reference: <PaymentAllocationDetails payment={payment} lineLookup={paymentAllocationLineLookup} />,
        icon: Receipt,
        iconTone: "green" as const,
        allocationPayment: payment,
      })),
    ];

    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [
    contract.end_date,
    contract.id,
    contract.start_date,
    contract.total_amount,
    fines,
    otherFees,
    paymentAllocationLineLookup,
    payments,
    rentalExtensions,
    salik,
  ]);

  const visibleTransactions = transactions.filter((transaction) => {
    if (transactionFilter !== "all" && transaction.group !== transactionFilter) return false;
    const query = transactionSearch.trim().toLowerCase();
    if (!query) return true;
    return [transaction.type, transaction.description, transaction.details, transaction.date]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
  const rentalPeriods = [
    {
      id: "base-rental",
      name: "Original Contract",
      startDate: contract.start_date,
      endDate: contract.end_date,
      amount: Number(contract.total_amount),
      onEdit: onEditRentalAmount,
    },
    ...rentalExtensions.map((fee, index) => {
      return {
        id: fee.id,
        name: `Extension #${index + 1}`,
        startDate: fee.extension_start ?? contract.end_date,
        endDate: fee.extension_end ?? contract.end_date,
        amount: Number(fee.amount),
        onEdit: () => onEditFeeAmount(fee),
      };
    }),
  ].sort((a, b) => {
    const aTime = new Date(a.startDate).getTime() || 0;
    const bTime = new Date(b.startDate).getTime() || 0;
    return bTime - aTime;
  });
  const currentRentalPeriod = rentalPeriods[0];
  const pastRentalPeriods = rentalPeriods.slice(1);

  const getTransactionIconClass = (transaction: FinancialTransaction) => {
    if (transaction.type === "Payment") return "bg-green-950 text-green-300";
    if (transaction.type === "Fine") return "bg-red-950 text-red-300";
    if (transaction.type === "Salik") return "bg-emerald-950 text-emerald-300";
    if (transaction.type === "Rent") return "bg-blue-950 text-blue-300";
    return "bg-purple-950 text-purple-300";
  };

  return (
    <>
      <div className="w-full max-w-full min-w-0 space-y-4 pb-20">
        <section>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div
                className={cn(
                  "font-mono text-xl font-semibold tabular-nums",
                  totals.outstanding > 0 ? "text-tint-rose-foreground" : "text-tint-green-foreground",
                )}
              >
                {fmtAed(totals.outstanding)}
              </div>
              <div className="text-xs text-muted-foreground">Deposit tracked separately below</div>
            </div>
            {canAddPayment ? (
              <Button className="h-10 gap-2 self-start bg-primary px-4 text-primary-foreground hover:bg-primary/90 sm:self-center" onClick={onAddPayment}>
                <Plus className="h-4 w-4" />
                Add Payment
              </Button>
            ) : null}
          </div>
        </section>

        <FinancialSection
          title="Open Items"
          meta="What the customer owes"
          action={
            <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
              {openItemGroups.length} items
            </span>
          }
        >
          {showDepositVerificationWarning ? (
            <div className="flex items-start gap-2 rounded-md border border-tint-amber-foreground/25 bg-tint-amber px-3 py-2 text-xs text-tint-amber-foreground">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Fines/Salik import not verified. Review before returning deposit.</span>
            </div>
          ) : null}
          {openItemGroups.length === 0 ? (
            <FinancialLine className="text-xs text-muted-foreground">No unpaid customer items.</FinancialLine>
          ) : (
            openItemGroups.map((item) => (
              <FinancialLine key={item.id} className="min-h-0 flex-nowrap py-2">
                <FinancialIconBox icon={item.icon} tone={item.iconTone} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-xs font-semibold text-foreground">{item.title}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{item.detail}</span>
                </div>
                <div className="hidden min-w-[170px] text-xs text-muted-foreground md:block">{item.meta}</div>
                <span className="ml-auto w-28 shrink-0 text-right font-mono text-sm font-bold tabular-nums text-tint-rose-foreground">
                  {fmtAed(item.due)}
                </span>
                {item.id === "rental" ? (
                  <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" onClick={onAddPayment}>
                    Pay
                  </Button>
                ) : item.id === "fines" ? (
                  <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5" onClick={() => setShowFinesModal(true)}>
                    View
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                ) : item.id === "salik" ? (
                  <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5" onClick={() => setShowSalikModal(true)}>
                    View
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5" onClick={onAddPayment}>
                    Pay
                  </Button>
                )}
              </FinancialLine>
            ))
          )}
        </FinancialSection>

        <FinancialSection title="Rental History" meta={`${rentalPeriods.length} periods`}>
          {currentRentalPeriod ? (
            <div className="px-4 py-3">
              <div className="flex overflow-hidden rounded-lg border border-blue-800 bg-blue-950/30">
                <div className="h-full w-[3px] shrink-0 bg-blue-500 rounded-l-lg" />
                <div className="flex flex-1 items-center gap-3 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">{currentRentalPeriod.name}</span>
                      <span className="rounded-full bg-blue-950 px-2 py-0.5 text-[10px] font-medium text-blue-300">
                        Current
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatDate(currentRentalPeriod.startDate)} - {formatDate(currentRentalPeriod.endDate)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-muted-foreground">
                      {diffDays(currentRentalPeriod.startDate, currentRentalPeriod.endDate)} days
                    </div>
                    <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-foreground">
                      {fmtAed(currentRentalPeriod.amount)}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Edit current rental period"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-green-950/40 hover:text-foreground"
                    onClick={currentRentalPeriod.onEdit}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {pastRentalPeriods.length > 0 ? (
            <details className="group px-4 py-3">
              <summary className="flex h-8 cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                <ChevronDown className="h-3.5 w-3.5 group-open:hidden" />
                <ChevronUp className="hidden h-3.5 w-3.5 group-open:block" />
                <span className="group-open:hidden">Show all periods ({rentalPeriods.length})</span>
                <span className="hidden group-open:inline">Hide past periods</span>
              </summary>
              <div className="mt-2 space-y-2">
                {pastRentalPeriods.map((period) => (
                  <div key={period.id} className="flex items-center justify-between gap-3 rounded-md bg-background/30 px-3 py-2 text-zinc-500">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium">{period.name}</div>
                      <div className="mt-0.5 text-xs">
                        {formatDate(period.startDate)} - {formatDate(period.endDate)} - {diffDays(period.startDate, period.endDate)} days
                      </div>
                    </div>
                    <div className="shrink-0 font-mono text-xs tabular-nums">{fmtAed(period.amount)}</div>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </FinancialSection>

        <FinancialSection
          title="Transaction History"
          meta="All charges, payments, and adjustments"
        >
          <div className="border-b border-border px-4 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex overflow-x-auto rounded-md border border-border bg-background/40 p-0.5">
                {([
                  ["all", "All"],
                  ["charges", "Charges"],
                  ["payments", "Payments"],
                  ["adjustments", "Adjustments"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={cn(
                      "h-8 shrink-0 rounded px-3 text-xs font-medium text-muted-foreground transition-colors",
                      transactionFilter === value && "bg-muted text-foreground",
                    )}
                    onClick={() => setTransactionFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1 lg:w-56 lg:flex-none">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={transactionSearch}
                    onChange={(event) => setTransactionSearch(event.target.value)}
                    placeholder="Search..."
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setTransactionSearch("")}>
                  <Filter className="h-3.5 w-3.5" />
                  Filters
                </Button>
              </div>
            </div>
          </div>

          <div className="hidden grid-cols-[110px_1fr_140px_40px] gap-3 border-b border-border px-4 py-2 text-[11px] font-medium text-muted-foreground md:grid">
            <span>Date</span>
            <span>Type / Description</span>
            <span className="text-right">Amount</span>
            <span />
          </div>

          {visibleTransactions.length === 0 ? (
            <FinancialLine className="text-xs text-muted-foreground">No transactions match the current view.</FinancialLine>
          ) : (
            visibleTransactions.map((transaction) => (
              <div key={transaction.id} className="grid gap-2 px-4 py-3 md:grid-cols-[110px_1fr_140px_40px] md:items-start md:gap-3">
                <div className="font-mono text-[11px] text-muted-foreground">{formatDate(transaction.date)}</div>
                <div className="flex min-w-0 gap-3">
                  <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", getTransactionIconClass(transaction))}>
                    {(() => {
                      const TransactionIcon = transaction.icon;
                      return <TransactionIcon className="h-3.5 w-3.5" />;
                    })()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-foreground">{transaction.description}</div>
                    {transaction.details ? (
                      <div className="mt-0.5 truncate text-xs text-zinc-500">{transaction.details}</div>
                    ) : null}
                    <div className="mt-1 md:hidden">
                      <span
                        className={cn(
                          "font-mono text-sm font-bold tabular-nums",
                          transaction.amountTone === "credit" ? "text-green-400" : "text-zinc-200",
                        )}
                      >
                        {transaction.amountTone === "credit" ? "+" : ""}
                        {fmtAed(transaction.amount)}
                      </span>
                    </div>
                    {transaction.allocationPayment ? transaction.reference : null}
                  </div>
                </div>
                <div
                  className={cn(
                    "hidden text-right font-mono text-sm font-bold tabular-nums md:block",
                    transaction.amountTone === "credit" ? "text-green-400" : "text-zinc-200",
                  )}
                >
                  {transaction.amountTone === "credit" ? "+" : ""}
                  {fmtAed(transaction.amount)}
                </div>
                <div className="flex justify-end gap-1">
                  {transaction.type === "Fine" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
                      onClick={() => setFinesModalOpen(true)}
                    >
                      View all →
                    </Button>
                  ) : transaction.type === "Salik" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
                      onClick={() => setSalikModalOpen(true)}
                    >
                      View all →
                    </Button>
                  ) : null}
                  {transaction.allocationPayment ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Edit payment amount"
                        className="h-8 w-8 text-muted-foreground hover:bg-transparent hover:text-foreground"
                        onClick={() => onEditPaymentAmount(transaction.allocationPayment!)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Delete payment"
                        className="h-8 w-8 text-muted-foreground hover:bg-transparent hover:text-destructive"
                        onClick={() => onDeletePayment(transaction.allocationPayment!)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </FinancialSection>

        <div className="rounded-md border border-border bg-card p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <FinancialIconBox icon={ShieldCheck} tone="violet" />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Security Deposit</div>
                <div className="mt-0.5 text-xs text-muted-foreground">Separate from balance</div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[420px] lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Amount</div>
                <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-foreground">
                  {fmtAed(Number(contract.deposit_amount))}
                </div>
                {depositMethod ? (
                  <div className="mt-0.5 text-[10px] text-muted-foreground">Collected via {depositMethod}</div>
                ) : null}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Status</div>
                <div className="mt-1">
                  <FinancialBadge status={depositStatus} />
                </div>
              </div>
            </div>
          </div>

          {Number(contract.deposit_amount) > 0 && contract.status.toLowerCase() === "closed" ? (
            <div className="mt-3 grid gap-2 border-t border-border pt-3 text-xs">
              {depositStatus === "Returned" ? (
                <>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Returned amount</span>
                    <span className="font-mono font-semibold tabular-nums">
                      {fmtAed(depositInfo.returnedAmount || depositInfo.pendingReturn || Number(contract.deposit_amount))}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Returned date</span>
                    <span className="font-mono font-semibold tabular-nums">
                      {depositInfo.returnedDate ?? "Recorded"}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Pending return</span>
                    <span className="font-mono font-semibold tabular-nums">
                      {fmtAed(depositInfo.pendingReturn)}
                    </span>
                  </div>
                  {depositInfo.returnDue ? (
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Return due date</span>
                      <span className="font-mono font-semibold tabular-nums">{depositInfo.returnDue}</span>
                    </div>
                  ) : null}
                  {depositInfo.retained > 0 ? (
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Retained</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {fmtAed(depositInfo.retained)}
                      </span>
                    </div>
                  ) : null}
                  {depositInfo.reason ? (
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Retention reason</span>
                      <span className="max-w-[60%] text-right font-medium text-foreground">{depositInfo.reason}</span>
                    </div>
                  ) : null}
                  {depositInfo.appliedToBalance > 0 ? (
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Applied to balance</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {fmtAed(depositInfo.appliedToBalance)}
                      </span>
                    </div>
                  ) : null}
                  {depositInfo.pendingReturn > 0 ? (
                    <div className="flex flex-wrap justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        disabled={markingDepositReturned}
                        onClick={() => onMarkDepositReturned(depositInfo.pendingReturn)}
                      >
                        {markingDepositReturned ? "Saving..." : "Return Full"}
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled>
                        Partial Return
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-8 border-tint-rose-foreground/40 text-xs text-tint-rose-foreground" disabled>
                        Forfeit
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>

        <div className="fixed inset-x-0 bottom-0 z-40 flex w-full max-w-[100vw] min-w-0 gap-3 border-t border-[#1a2640] bg-[#0d1421] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            className="min-w-0 flex-1 rounded-xl border border-[#2d4a6e] bg-[#1a2640] py-3 text-sm font-semibold text-[#94a3b8]"
            onClick={onAddFee}
          >
            + Add Fee
          </button>
          <button
            type="button"
            className="min-w-0 flex-1 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white"
            onClick={onAddPayment}
          >
            + Add Payment
          </button>
        </div>
      </div>

      <FinesModal contractId={contract.id} open={showFinesModal} onOpenChange={setShowFinesModal} />
      <SalikModal contractId={contract.id} open={showSalikModal} onOpenChange={setShowSalikModal} />
      <FinesDetailModal contractId={contract.id} open={finesModalOpen} onClose={() => setFinesModalOpen(false)} />
      <SalikDetailModal contractId={contract.id} open={salikModalOpen} onClose={() => setSalikModalOpen(false)} />
    </>
  );
};

const ContractDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [contract, setContract] = useState<ContractRecord | null>(null);
  const [fines, setFines] = useState<FineRow[]>([]);
  const [salik, setSalik] = useState<SalikRow[]>([]);
  const [chargeImportEvidence, setChargeImportEvidence] = useState<ChargeImportEvidence>({
    finesLastImportAt: null,
    salikLastImportAt: null,
  });
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [contractFees, setContractFees] = useState<ContractFeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [feeCategory, setFeeCategory] = useState<FeeCategory>("delivery");
  const [feeLabel, setFeeLabel] = useState("Delivery");
  const [feeAmount, setFeeAmount] = useState("");
  const [savingFee, setSavingFee] = useState(false);
  const [feeRefreshKey, setFeeRefreshKey] = useState(0);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeReturnDate, setCloseReturnDate] = useState("");
  const [closeReceivedBy, setCloseReceivedBy] = useState("");
  const [closeFinalMileage, setCloseFinalMileage] = useState("");
  const [closeVehicleStatus, setCloseVehicleStatus] = useState("Available");
  const [depositCloseAction, setDepositCloseAction] = useState<DepositCloseAction>("return_full");
  const [depositRetainedAmount, setDepositRetainedAmount] = useState("");
  const [depositRetainReason, setDepositRetainReason] = useState("");
  const [depositReturnDueDate, setDepositReturnDueDate] = useState("");
  const [depositReturnDueDateEdited, setDepositReturnDueDateEdited] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendEndDate, setExtendEndDate] = useState("");
  const [extendAmount, setExtendAmount] = useState("");
  const [extendError, setExtendError] = useState("");
  const [isExtending, setIsExtending] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editStartDate, setEditStartDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editCarId, setEditCarId] = useState("");
  const [availableCars, setAvailableCars] = useState<AvailableCarRow[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [replaceVehicleOpen, setReplaceVehicleOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [replacementCount, setReplacementCount] = useState(0);
  const [reopenConfirmOpen, setReopenConfirmOpen] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<PaymentRow | null>(null);
  const [feeToDelete, setFeeToDelete] = useState<ContractFeeRow | null>(null);
  const [deletingPayment, setDeletingPayment] = useState(false);
  const [deletingFee, setDeletingFee] = useState(false);
  const [amountEditTarget, setAmountEditTarget] = useState<AmountEditTarget | null>(null);
  const [amountEditValue, setAmountEditValue] = useState("");
  const [amountEditExtensionEndDate, setAmountEditExtensionEndDate] = useState("");
  const [savingAmountEdit, setSavingAmountEdit] = useState(false);
  const [markingDepositReturned, setMarkingDepositReturned] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);

  const navigate = useNavigate();

  const fetchContractFees = useCallback(async () => {
    if (!contract?.id) {
      setContractFees([]);
      return;
    }
    const { data, error } = await (supabase as any)
      .from("contract_fees")
      .select("id, category, label, amount, extension_start, extension_end, created_at")
      .eq("contract_id", contract.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load fees");
      return;
    }

    setContractFees(
      ((data ?? []) as ContractFeeRow[]).map((fee) => ({
        ...fee,
        amount: Number(fee.amount),
      })),
    );
  }, [contract?.id]);

  const fetchData = useCallback(async () => {
    if (!id) return;
    const { data: contractData, error: contractErr } = await supabase
      .from("contracts")
      .select(
        "*, clients(full_name, phone, email, emirates_id, passport_number, nationality, client_type), cars(plate, make, model, year)",
      )
      .eq("id", id)
      .maybeSingle();

    if (contractErr) {
      toast.error("Failed to load contract");
      setLoading(false);
      return;
    }

    const c = contractData as ContractRecord | null;
    setContract(c);
    setNotesDraft((c as { notes?: string | null } | null)?.notes ?? "");

    if (c) {
      const [paymentsRes, finesRes, salikRes, latestFinesImportRes, latestSalikImportRes] = await Promise.all([
        supabase
          .from("payments")
          .select("id, payment_date, amount, method, status, allocations")
          .eq("contract_id", c.id)
          .order("payment_date", { ascending: false }),
        supabase
          .from("fines")
          .select("id, fine_date, created_at, fine_number, fine_type, amount, status, source, notes")
          .eq("contract_id", c.id)
          .order("fine_date", { ascending: false }),
        supabase
          .from("salik")
          .select("id, charge_date, created_at, transaction_id, toll_gate, direction, trips, amount, status, notes")
          .eq("contract_id", c.id)
          .order("charge_date", { ascending: false }),
        supabase
          .from("fines")
          .select("created_at")
          .eq("owner_id", c.owner_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("salik")
          .select("created_at")
          .eq("owner_id", c.owner_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (!paymentsRes.error) setPayments(paymentsRes.data || []);
      if (!finesRes.error) setFines(finesRes.data || []);
      if (!salikRes.error) setSalik(salikRes.data || []);
      setChargeImportEvidence({
        finesLastImportAt:
          !latestFinesImportRes.error && latestFinesImportRes.data
            ? (latestFinesImportRes.data as { created_at: string }).created_at
            : null,
        salikLastImportAt:
          !latestSalikImportRes.error && latestSalikImportRes.data
            ? (latestSalikImportRes.data as { created_at: string }).created_at
            : null,
      });
    } else {
      setChargeImportEvidence({ finesLastImportAt: null, salikLastImportAt: null });
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!contract?.id) return;
    (supabase as unknown as any)
      .from("contract_vehicles")
      .select("id", { count: "exact", head: true })
      .eq("contract_id", contract.id)
      .then(({ count }: { count: number | null }) => {
        setReplacementCount(count ?? 0);
      });
  }, [contract?.id]);

  useEffect(() => {
    fetchContractFees();
  }, [fetchContractFees, feeRefreshKey]);

  const days = useMemo(
    () => (contract ? diffDays(contract.start_date, contract.end_date) : 0),
    [contract],
  );

  const ledger: LedgerEntry[] = useMemo(() => {
    if (!contract) return [];
    const entries: LedgerEntry[] = [];
    entries.push({
      id: `rental-${contract.id}`,
      date: contract.start_date,
      type: "Rental",
      description: `${contract.rate_type} rental · ${days} days @ ${fmtAed(contract.rate_amount)}`,
      debit: Number(contract.total_amount),
      credit: 0,
      status: contract.status,
    });
    if (Number(contract.deposit_amount) > 0) {
      entries.push({
        id: `deposit-${contract.id}`,
        date: contract.start_date,
        type: "Deposit",
        description: "Refundable security deposit",
        debit: Number(contract.deposit_amount),
        credit: 0,
        status: "Held",
      });
    }
    fines.forEach((f) =>
      entries.push({
        id: `fine-${f.id}`,
        date: f.fine_date,
        type: "Fine",
        description: `${f.fine_type} · ${f.source}`,
        debit: Number(f.amount),
        credit: 0,
        status: f.status,
      }),
    );
    salik.forEach((s) =>
      entries.push({
        id: `salik-${s.id}`,
        date: s.charge_date,
        type: "Salik",
        description: `${s.trips} toll trips`,
        debit: Number(s.amount),
        credit: 0,
        status: s.status,
      }),
    );
    payments.forEach((p) =>
      entries.push({
        id: `pay-${p.id}`,
        date: p.payment_date,
        type: "Payment",
        description: `Payment received · ${p.method}`,
        debit: 0,
        credit: p.status === "Paid" ? Number(p.amount) : 0,
        status: p.status,
      }),
    );
    return entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [contract, fines, salik, payments, days]);

  const totals = useMemo(() => {
    const feeCharges = contractFees.reduce((sum, fee) => sum + Number(fee.amount), 0);
    const charges = ledger.reduce((s, e) => s + e.debit, 0) + feeCharges;
    const credits = ledger.reduce((s, e) => s + e.credit, 0);
    // Security deposit is reconciled separately and must not reduce the customer balance.
    const outstanding = Math.max(0, charges - credits);
    return { charges, credits, outstanding, overdue: 0 };
  }, [ledger, contractFees]);

  const saveNotes = async () => {
    if (!contract) return;
    setSavingNotes(true);
    const { error } = await supabase
      .from("contracts")
      .update({ notes: notesDraft } as never)
      .eq("id", contract.id);
    setSavingNotes(false);
    if (error) {
      toast.error("Failed to save notes");
      return;
    }
    toast.success("Notes saved");
    setContract({ ...contract, notes: notesDraft });
    setEditingNotes(false);
  };

  const handleDownloadInvoice = async () => {
    if (!contract || !user) return;

    setGeneratingInvoice(true);
    try {
      const [profileRes, feesRes, finesRes, salikRes, paymentsRes] = await Promise.all([
        (supabase as any)
          .from("profiles")
          .select("company_name, phone_number, trn")
          .eq("id", user.id)
          .maybeSingle(),
        (supabase as any)
          .from("contract_fees")
          .select("id, label, amount")
          .eq("contract_id", contract.id)
          .order("created_at", { ascending: true }),
        (supabase as any)
          .from("fines")
          .select("id, amount")
          .eq("contract_id", contract.id)
          .eq("status", "Charged to Client"),
        (supabase as any)
          .from("salik")
          .select("id, trips, amount")
          .eq("contract_id", contract.id),
        (supabase as any)
          .from("payments")
          .select("id, amount")
          .eq("contract_id", contract.id),
      ]);

      if (profileRes.error || feesRes.error || finesRes.error || salikRes.error || paymentsRes.error) {
        throw new Error(
          profileRes.error?.message ||
            feesRes.error?.message ||
            finesRes.error?.message ||
            salikRes.error?.message ||
            paymentsRes.error?.message ||
            "Failed to load invoice data",
        );
      }

      let vehicle = contract.cars as
        | ({ make: string; model: string; year: number; plate?: string | null; color?: string | null; plate_number?: string | null })
        | null;
      const vehicleRes = await (supabase as any)
        .from("cars")
        .select("make, model, year, color, plate, plate_number")
        .eq("id", contract.car_id)
        .maybeSingle();
      if (!vehicleRes.error && vehicleRes.data) {
        vehicle = vehicleRes.data;
      } else {
        const fallbackVehicleRes = await (supabase as any)
          .from("cars")
          .select("make, model, year, plate")
          .eq("id", contract.car_id)
          .maybeSingle();
        if (!fallbackVehicleRes.error && fallbackVehicleRes.data) {
          vehicle = fallbackVehicleRes.data;
        }
      }

      const profile = (profileRes.data ?? {}) as {
        company_name?: string | null;
        phone_number?: string | null;
        trn?: string | null;
      };
      const client = contract.clients;
      const invoiceNo = `INV-${contract.id}`;
      const invoiceDate = new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      const money = (value: number) =>
        Number(value || 0).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      const aed = (value: number) => `AED ${money(value)}`;
      const rentalDays = Math.max(1, diffDays(contract.start_date, contract.end_date));
      const rentalAmount = Number(contract.total_amount) || 0;
      const rentalVat = rentalAmount * 0.05;
      const chargedFines = ((finesRes.data ?? []) as Array<{ id: string; amount: number }>).map((fine) => ({
        ...fine,
        amount: Number(fine.amount) || 0,
      }));
      const salikCharges = ((salikRes.data ?? []) as Array<{ id: string; trips: number; amount: number }>).map((charge) => ({
        ...charge,
        trips: Number(charge.trips) || 0,
        amount: Number(charge.amount) || 0,
      }));
      const fees = ((feesRes.data ?? []) as Array<{ id: string; label: string; amount: number }>).map((fee) => ({
        ...fee,
        amount: Number(fee.amount) || 0,
      }));
      const paidAmount = ((paymentsRes.data ?? []) as Array<{ amount: number }>).reduce(
        (sum, payment) => sum + (Number(payment.amount) || 0),
        0,
      );
      const finesTotal = chargedFines.reduce((sum, fine) => sum + fine.amount, 0);
      const salikTrips = salikCharges.reduce((sum, charge) => sum + charge.trips, 0);
      const salikTotal = salikCharges.reduce((sum, charge) => sum + charge.amount, 0);
      const feeTotal = fees.reduce((sum, fee) => sum + fee.amount, 0);
      const subtotal = rentalAmount + finesTotal + salikTotal + feeTotal;
      const invoiceAmount = subtotal + rentalVat;
      const remainingBalance = Math.max(0, invoiceAmount - paidAmount);
      const invoiceStatus =
        remainingBalance <= 0.01 ? "Paid" : paidAmount > 0 ? "Partially Paid" : "Unpaid";
      const statusColors =
        invoiceStatus === "Paid"
          ? { fill: [240, 253, 244], text: [22, 163, 74] }
          : invoiceStatus === "Partially Paid"
            ? { fill: [255, 251, 235], text: [217, 119, 6] }
            : { fill: [254, 242, 242], text: [220, 38, 38] };

      const rows: Array<[string, string, string, string, string, string]> = [
        [
          "01",
          `Car Rental\n${formatDate(contract.start_date)} - ${formatDate(contract.end_date)}`,
          `${rentalDays} days`,
          money(rentalAmount),
          money(rentalVat),
          money(rentalAmount + rentalVat),
        ],
      ];
      if (chargedFines.length > 0) {
        rows.push([
          String(rows.length + 1).padStart(2, "0"),
          `Traffic Fines\n${chargedFines.length} ${chargedFines.length === 1 ? "fine" : "fines"} - incl. AED 20 service fee`,
          String(chargedFines.length),
          money(finesTotal),
          "-",
          money(finesTotal),
        ]);
      }
      if (salikCharges.length > 0) {
        rows.push([
          String(rows.length + 1).padStart(2, "0"),
          `Salik Charges\n${salikTrips} ${salikTrips === 1 ? "trip" : "trips"}`,
          String(salikTrips),
          money(salikTotal),
          "-",
          money(salikTotal),
        ]);
      }
      fees.forEach((fee) => {
        rows.push([
          String(rows.length + 1).padStart(2, "0"),
          fee.label || "Contract Fee",
          "1",
          money(fee.amount),
          "-",
          money(fee.amount),
        ]);
      });

      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 36;
      const navy = [18, 24, 48] as const;
      const grey = [107, 114, 128] as const;
      const lightGrey = [249, 250, 251] as const;
      const borderGrey = [229, 231, 235] as const;

      const text = (
        value: string,
        x: number,
        y: number,
        options: { size?: number; color?: readonly number[]; font?: "helvetica" | "courier"; style?: "normal" | "bold"; align?: "left" | "right" | "center" } = {},
      ) => {
        doc.setFont(options.font ?? "helvetica", options.style ?? "normal");
        doc.setFontSize(options.size ?? 10);
        doc.setTextColor(...(options.color ?? [17, 24, 39]));
        doc.text(value, x, y, { align: options.align ?? "left" });
      };

      text(profile.company_name || "Company Name", margin, 54, { size: 15, style: "bold", color: navy });
      text(`Dubai / Ajman, UAE | ${profile.phone_number || "-"}`, margin, 70, { size: 9, color: grey });
      doc.setFillColor(243, 244, 246);
      doc.roundedRect(margin, 78, 150, 18, 3, 3, "F");
      text(`TRN: ${profile.trn || "-"}`, margin + 6, 90, { size: 8, font: "courier", color: [55, 65, 81] });

      text("TAX INVOICE", pageW - margin, 54, { size: 21, style: "bold", color: navy, align: "right" });
      text("Original Document", pageW - margin, 70, { size: 8, color: grey, align: "right" });
      const metaX = pageW - margin - 150;
      [
        ["Invoice No", invoiceNo],
        ["Date", invoiceDate],
      ].forEach(([label, value], index) => {
        const y = 91 + index * 16;
        text(label, metaX, y, { size: 9, color: grey, align: "right" });
        text(value, metaX + 16, y, { size: 9, font: "courier" });
      });
      text("Status", metaX, 123, { size: 9, color: grey, align: "right" });
      doc.setFillColor(...statusColors.fill);
      doc.roundedRect(metaX + 16, 111, 90, 17, 8, 8, "F");
      text(invoiceStatus, metaX + 61, 123, { size: 8, style: "bold", color: statusColors.text, align: "center" });

      doc.setDrawColor(...navy);
      doc.setLineWidth(1.4);
      doc.line(margin, 114, pageW - margin, 114);

      const blockY = 142;
      const blockW = (pageW - margin * 2 - 16) / 2;
      const drawInfoBlock = (x: number, title: string, main: string, lines: Array<[string, string]>, plate?: string) => {
        doc.setFillColor(...lightGrey);
        doc.setDrawColor(...borderGrey);
        doc.roundedRect(x, blockY, blockW, 86, 6, 6, "FD");
        text(title.toUpperCase(), x + 12, blockY + 18, { size: 7, style: "bold", color: [156, 163, 175] });
        text(main, x + 12, blockY + 36, { size: 11, style: "bold" });
        lines.forEach(([key, value], index) => {
          text(key, x + 12, blockY + 53 + index * 13, { size: 8, color: [156, 163, 175] });
          text(value || "-", x + 66, blockY + 53 + index * 13, { size: 8, color: [75, 85, 99] });
        });
        if (plate) {
          doc.setFillColor(229, 231, 235);
          doc.roundedRect(x + 12, blockY + 59, 82, 18, 3, 3, "F");
          text(plate, x + 18, blockY + 71, { size: 9, font: "courier", style: "bold", color: navy });
        }
      };
      drawInfoBlock(margin, "Invoice To", client?.full_name || "-", [
        ["Phone", client?.phone || "-"],
        ["Nationality", client?.nationality || "-"],
      ]);
      drawInfoBlock(
        margin + blockW + 16,
        "Vehicle",
        [vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || "-",
        [["Year", `${vehicle?.year ?? "-"}${vehicle?.color ? ` - ${vehicle.color}` : ""}`]],
        vehicle?.plate_number || vehicle?.plate || "-",
      );

      doc.setFillColor(...navy);
      doc.roundedRect(margin, 252, pageW - margin * 2, 48, 6, 6, "F");
      text("RENTAL PERIOD", margin + 16, 271, { size: 8, color: [156, 163, 175], style: "bold" });
      text(`${formatDate(contract.start_date)} -> ${formatDate(contract.end_date)}`, margin + 16, 288, {
        size: 10,
        font: "courier",
        color: [255, 255, 255],
      });
      text(String(rentalDays), pageW - margin - 20, 277, {
        size: 20,
        font: "courier",
        style: "bold",
        color: [255, 255, 255],
        align: "right",
      });
      text("days", pageW - margin - 20, 292, { size: 8, color: [156, 163, 175], align: "right" });

      autoTable(doc, {
        startY: 324,
        head: [["#", "Description", "Qty", "Amount", "VAT 5%", "Total"]],
        body: rows,
        theme: "plain",
        margin: { left: margin, right: margin },
        styles: {
          font: "helvetica",
          fontSize: 9,
          cellPadding: { top: 8, right: 10, bottom: 8, left: 10 },
          lineColor: borderGrey,
          lineWidth: 0.5,
          valign: "top",
        },
        headStyles: {
          fillColor: navy,
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8,
        },
        columnStyles: {
          0: { cellWidth: 30, textColor: [156, 163, 175], font: "courier" },
          1: { cellWidth: 205 },
          2: { cellWidth: 70, halign: "right", font: "courier" },
          3: { cellWidth: 80, halign: "right", font: "courier" },
          4: { cellWidth: 70, halign: "right", font: "courier" },
          5: { cellWidth: 85, halign: "right", font: "courier" },
        },
        didParseCell: (data) => {
          if (data.section === "body" && data.row.index % 2 === 1) {
            data.cell.styles.fillColor = lightGrey;
          }
          if (data.section === "body" && data.column.index === 4 && data.cell.raw === "-") {
            data.cell.styles.textColor = [156, 163, 175];
          }
        },
      });

      const tableEndY = ((doc as any).lastAutoTable?.finalY ?? 430) + 12;
      doc.setDrawColor(...borderGrey);
      doc.line(margin, tableEndY, pageW - margin, tableEndY);
      const totalsX = pageW - margin - 250;
      const totalsRows: Array<[string, string, "normal" | "total" | "deposit" | "paid" | "remaining"]> = [
        ["Subtotal", aed(subtotal), "normal"],
        ["VAT (5%)", aed(rentalVat), "normal"],
        ["Invoice Amount", aed(invoiceAmount), "total"],
        ["Security Deposit (tracked separately)", aed(Number(contract.deposit_amount) || 0), "deposit"],
        ["Paid Amount", `- ${aed(paidAmount)}`, "paid"],
        ["Remaining Balance", aed(remainingBalance), "remaining"],
      ];
      let y = tableEndY + 18;
      totalsRows.forEach(([label, value, kind]) => {
        if (kind === "total" || kind === "remaining") {
          doc.setDrawColor(kind === "remaining" ? 220 : 17, kind === "remaining" ? 38 : 24, kind === "remaining" ? 38 : 39);
          doc.setLineWidth(1.2);
          doc.line(totalsX, y - 12, pageW - margin, y - 12);
        }
        const color =
          kind === "paid"
            ? [22, 163, 74]
            : kind === "remaining"
              ? [220, 38, 38]
              : kind === "deposit"
                ? [156, 163, 175]
                : [107, 114, 128];
        text(label, totalsX, y, {
          size: kind === "total" ? 11 : kind === "remaining" ? 10 : 9,
          style: kind === "total" || kind === "remaining" ? "bold" : "normal",
          color,
        });
        text(value, pageW - margin, y, {
          size: kind === "total" ? 11 : kind === "remaining" ? 10 : 9,
          style: kind === "total" || kind === "remaining" || kind === "paid" ? "bold" : "normal",
          font: "courier",
          color,
          align: "right",
        });
        y += kind === "total" ? 24 : 18;
      });

      const sigY = Math.max(y + 18, 606);
      doc.setDrawColor(...borderGrey);
      doc.line(margin, sigY - 14, pageW - margin, sigY - 14);
      const sigW = (pageW - margin * 2 - 24) / 3;
      ["Receiver Signature", "Manager Signature", "Account Signature"].forEach((label, index) => {
        const x = margin + index * (sigW + 12);
        doc.setDrawColor(209, 213, 219);
        doc.setLineDashPattern([3, 3], 0);
        doc.roundedRect(x, sigY, sigW, 48, 5, 5);
        doc.setLineDashPattern([], 0);
        text(label.toUpperCase(), x + sigW / 2, sigY + 66, {
          size: 7,
          color: [156, 163, 175],
          style: "bold",
          align: "center",
        });
      });

      const remarksY = sigY + 92;
      doc.setDrawColor(...borderGrey);
      doc.roundedRect(margin, remarksY, pageW - margin * 2, 54, 6, 6);
      text("REMARKS", margin + 12, remarksY + 18, { size: 7, color: [156, 163, 175], style: "bold" });
      text("Notes or comments...", margin + 12, remarksY + 36, { size: 9, color: [209, 213, 219], style: "normal" });

      doc.setDrawColor(...navy);
      doc.setLineWidth(1.4);
      doc.line(margin, pageH - 42, pageW - margin, pageH - 42);
      text("Thank you for your business", margin, pageH - 24, { size: 8, color: [156, 163, 175] });
      text("Powered by FleetDesk", pageW - margin, pageH - 24, { size: 8, style: "bold", color: navy, align: "right" });

      doc.save(`Invoice-${contract.id}.pdf`);
      toast.success("Invoice downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate invoice");
    } finally {
      setGeneratingInvoice(false);
    }
  };

  const handleMarkDepositReturned = async (amount: number) => {
    if (!contract) return;

    const returnedDate = getTodayDateInput();
    const returnNote = [
      DEPOSIT_RETURN_PREFIX,
      "Status: Returned",
      `Returned amount: ${fmtAed(amount)}`,
      `Returned date: ${formatDate(returnedDate)}`,
    ].join(" | ");
    const updatedNotes = [contract.notes?.trim(), returnNote].filter(Boolean).join("\n");

    setMarkingDepositReturned(true);
    const { error } = await supabase
      .from("contracts")
      .update({ notes: updatedNotes } as never)
      .eq("id", contract.id);

    if (error) {
      setMarkingDepositReturned(false);
      toast.error("Failed to mark deposit as returned");
      return;
    }

    const { error: statusError } = await (supabase as any)
      .from("contracts")
      .update({ deposit_status: "Returned" })
      .eq("id", contract.id);

    if (statusError) {
      console.info("Deposit status column is not available; returned state was saved in contract notes.");
    }

    const { error: returnedDateError } = await (supabase as any)
      .from("contracts")
      .update({ deposit_returned_date: returnedDate })
      .eq("id", contract.id);

    if (returnedDateError) {
      console.info("Deposit returned date column is not available; returned date was saved in contract notes.");
    }

    setContract({ ...contract, notes: updatedNotes });
    setNotesDraft(updatedNotes);
    setMarkingDepositReturned(false);
    toast.success("Deposit marked as returned");
    await fetchData();
  };

  const openExtendModal = () => {
    if (!contract) return;
    setExtendEndDate("");
    setExtendAmount("");
    setExtendError("");
    setShowExtendModal(true);
  };

  const handleExtendContract = async () => {
    if (!contract) return;
    setExtendError("");

    if (!extendEndDate) {
      setExtendError("Select a new end date.");
      return;
    }

    const extensionStart = getLatestRentalPeriodEnd(contract, contractFees);

    if (extendEndDate <= extensionStart) {
      setExtendError("New end date must be later than the current end date.");
      return;
    }

    const extensionAmount = Number(extendAmount);
    if (!Number.isFinite(extensionAmount) || extensionAmount <= 0) {
      setExtendError("Enter a valid extension amount.");
      return;
    }

    setIsExtending(true);
    const extensionEnd = extendEndDate;
    const newEndTime = formatTimeForDb(contract.end_time);

    let overlap = null;
    try {
      overlap = await findVehicleContractOverlap(supabase, {
        carId: contract.car_id,
        startDate: extensionStart,
        startTime: contract.start_time,
        endDate: extensionEnd,
        endTime: newEndTime,
        excludeContractId: contract.id,
        operation: "contract-extension",
      });
    } catch (error) {
      setIsExtending(false);
      const message = error instanceof Error ? error.message : "Could not check vehicle availability. Try again.";
      setExtendError(message);
      return;
    }

    if (overlap) {
      setIsExtending(false);
      setExtendError(formatContractOverlapMessage(overlap));
      return;
    }

    const { data: existingExtension, error: existingExtensionError } = await (supabase as any)
      .from("contract_fees")
      .select("id")
      .eq("contract_id", contract.id)
      .eq("extension_start", extensionStart)
      .eq("extension_end", extensionEnd)
      .maybeSingle();

    if (existingExtensionError) {
      setIsExtending(false);
      const message = "Could not verify existing extension periods. Try again.";
      setExtendError(message);
      toast.error(message);
      return;
    }

    if (existingExtension?.id) {
      setIsExtending(false);
      toast.info("This extension period already exists");
      setShowExtendModal(false);
      setExtendEndDate("");
      setExtendAmount("");
      await fetchContractFees();
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      setIsExtending(false);
      setExtendError("Could not confirm current user. Try again.");
      return;
    }

    const { error: feeError } = await (supabase as any)
      .from("contract_fees")
      .insert({
        contract_id: contract.id,
        category: RENTAL_EXTENSION_CATEGORY,
        label: buildRentalExtensionLabel(extensionStart, extensionEnd),
        amount: Number(extensionAmount),
        extension_start: extensionStart,
        extension_end: extensionEnd,
        owner_id: userId,
      })
      .select("id")
      .single();

    if (feeError) {
      setIsExtending(false);
      console.error("Failed to insert extension contract fee", feeError);
      const message = "Could not add the extension fee. The contract was not changed.";
      setExtendError(message);
      toast.error(message);
      return;
    }

    setIsExtending(false);

    toast.success("Contract extended");
    setShowExtendModal(false);
    setExtendEndDate("");
    setExtendAmount("");
    await Promise.all([fetchData(), fetchContractFees()]);
    setFeeRefreshKey((key) => key + 1);
  };

  const buildDepositPaymentAllocations = (amount: number) => {
    let remaining = amount;
    const grouped: Record<AllocationCategory, number> = {
      rental: 0,
      fines: 0,
      salik: 0,
      fees: 0,
    };
    const lines: Record<string, number> = {};

    for (const line of paymentAllocationLines) {
      if (remaining <= 0) break;
      const applied = Math.min(remaining, Number(line.due));
      if (applied <= 0) continue;
      grouped[line.category] += applied;
      lines[line.id] = applied;
      remaining -= applied;
    }

    return { ...grouped, lines, source: "security_deposit" };
  };

  const handleCloseContract = async () => {
    if (!contract) return;

    if (closeFinalMileage.trim() === "") {
      toast.error("Please enter final mileage");
      return;
    }

    const finalMileage = Number(closeFinalMileage);
    if (finalMileage < Number(contract.initial_mileage)) {
      toast.error("Final mileage cannot be lower than initial mileage.");
      return;
    }

    const depositAmount = Math.max(0, Number(contract.deposit_amount) || 0);
    const outstandingBalance = Math.max(0, Number(financialTotals.outstanding) || 0);
    const retainedAmount =
      depositCloseAction === "retain_full"
        ? depositAmount
        : depositCloseAction === "retain_partial"
          ? Number(depositRetainedAmount)
          : 0;
    const appliedAmount =
      depositCloseAction === "apply_to_balance"
        ? Math.min(depositAmount, outstandingBalance)
        : 0;
    const pendingReturnAmount = Math.max(0, depositAmount - retainedAmount - appliedAmount);
    const finalOutstandingAmount = Math.max(0, outstandingBalance - appliedAmount);
    const returnDueDate =
      pendingReturnAmount > 0
        ? depositReturnDueDate || (!depositReturnDueDateEdited ? addDaysToDateInput(closeReturnDate, 15) : null)
        : null;
    const needsRetainReason =
      depositAmount > 0 &&
      (depositCloseAction === "retain_partial" || depositCloseAction === "retain_full");

    if (depositAmount > 0 && depositCloseAction === "apply_to_balance" && appliedAmount <= 0) {
      toast.error("There is no outstanding balance to apply the deposit to.");
      return;
    }

    if (depositAmount > 0 && depositCloseAction === "retain_partial") {
      if (!Number.isFinite(retainedAmount) || retainedAmount <= 0) {
        toast.error("Enter the deposit amount to retain.");
        return;
      }
      if (retainedAmount > depositAmount) {
        toast.error("Retained amount cannot exceed the deposit held.");
        return;
      }
    }

    if (needsRetainReason && depositRetainReason.trim() === "") {
      toast.error("Enter a reason for retaining the deposit.");
      return;
    }

    if (pendingReturnAmount > 0 && !returnDueDate) {
      toast.error("Select a deposit return due date.");
      return;
    }

    setIsClosing(true);
    const mileageRes = await (supabase as any)
      .from("car_maintenance")
      .insert({
        car_id: contract.car_id,
        owner_id: user?.id,
        current_mileage: finalMileage,
        notes: `Contract ${contract.id.slice(0, 8).toUpperCase()} return mileage`,
      });

    if (mileageRes.error) {
      setIsClosing(false);
      toast.error("Failed to close contract");
      return;
    }

    let appliedDepositPaymentId: string | null = null;
    if (appliedAmount > 0) {
      const { data: depositPaymentData, error: depositPaymentError } = await supabase
        .from("payments")
        .insert({
          contract_id: contract.id,
          client_id: contract.client_id,
          amount: appliedAmount,
          method: "Security Deposit",
          payment_date: getTodayDateInput(),
          status: "Paid",
          allocations: buildDepositPaymentAllocations(appliedAmount),
        } as never)
        .select("id")
        .single();

      if (depositPaymentError) {
        setIsClosing(false);
        toast.error("Failed to apply security deposit to balance");
        return;
      }
      appliedDepositPaymentId = (depositPaymentData as { id?: string } | null)?.id ?? null;
    }

    const actionLabel =
      depositCloseAction === "return_full"
        ? "Schedule full deposit return"
        : depositCloseAction === "apply_to_balance"
          ? "Apply to outstanding balance"
          : depositCloseAction === "retain_partial"
            ? "Retain partial amount"
            : "Retain full deposit";
    const depositStatus =
      depositCloseAction === "retain_full"
        ? "Retained"
        : "Pending Return";
    const depositNote =
      depositAmount > 0
        ? [
            DEPOSIT_RECONCILIATION_PREFIX,
            `Action: ${actionLabel}`,
            `Status: ${depositStatus}`,
            `Deposit held: ${fmtAed(depositAmount)}`,
            `Outstanding at close: ${fmtAed(outstandingBalance)}`,
            `Applied to balance: ${fmtAed(appliedAmount)}`,
            `Retained: ${fmtAed(retainedAmount)}`,
            `Pending return: ${fmtAed(pendingReturnAmount)}`,
            `Return due: ${returnDueDate ? formatDate(returnDueDate) : "No return due"}`,
            `Final outstanding: ${fmtAed(finalOutstandingAmount)}`,
            depositRetainReason.trim() ? `Reason: ${depositRetainReason.trim()}` : null,
            closeReturnDate ? `Closed/returned at: ${closeReturnDate}` : null,
            closeReceivedBy.trim() ? `Received by: ${closeReceivedBy.trim()}` : null,
          ]
            .filter(Boolean)
            .join(" | ")
        : null;
    const updatedNotes = depositNote
      ? [contract.notes?.trim(), depositNote].filter(Boolean).join("\n")
      : contract.notes ?? null;

    const [contractRes, vehicleRes] = await Promise.all([
      supabase
        .from("contracts")
        .update({ status: "Closed", notes: updatedNotes } as never)
        .eq("id", contract.id),
      supabase
        .from("cars")
        .update({ status: closeVehicleStatus } as never)
        .eq("id", contract.car_id),
    ]);
    setIsClosing(false);
    if (contractRes.error || vehicleRes.error) {
      if (appliedDepositPaymentId) {
        await supabase.from("payments").delete().eq("id", appliedDepositPaymentId);
      }
      toast.error("Failed to close contract");
      return;
    }

    if (depositAmount > 0) {
      const { error: depositStatusError } = await (supabase as any)
        .from("contracts")
        .update({ deposit_status: depositStatus })
        .eq("id", contract.id);

      if (depositStatusError) {
        console.info("Deposit status column is not available; reconciliation was saved in contract notes.");
      }
    }

    toast.success("Contract closed");
    navigate("/contracts");
  };

  const handleReopenContract = async () => {
    if (!contract) return;

    setIsReopening(true);
    const { error } = await (supabase as any)
      .from("contracts")
      .update({ status: "Active" })
      .eq("id", contract.id);
    setIsReopening(false);

    if (error) {
      toast.error("Failed to reopen contract");
      return;
    }

    toast.success("Contract reopened");
    setReopenConfirmOpen(false);
    await fetchData();
  };

  const handleDeleteContract = async () => {
    if (!id) return;

    try {
      // 1. Delete related payments
      const { error: payErr } = await supabase
        .from("payments")
        .delete()
        .eq("contract_id", id);
      if (payErr) throw payErr;

      // 2. Delete related contract_vehicles
      const { error: vehErr } = await (supabase as any)
        .from("contract_vehicles")
        .delete()
        .eq("contract_id", id);
      if (vehErr) throw vehErr;

      // 3. Delete the contract itself
      const { error: contractErr } = await supabase
        .from("contracts")
        .delete()
        .eq("id", id);
      if (contractErr) throw contractErr;

      toast.success("Contract deleted");
      navigate("/contracts");
    } catch (error: any) {
      toast.error("Failed to delete contract: " + error.message);
    } finally {
      setDeleteConfirmOpen(false);
    }
  };

  const handleConfirmDeletePayment = async () => {
    if (!contract || !paymentToDelete) return;

    setDeletingPayment(true);
    const { error } = await supabase
      .from("payments")
      .delete()
      .eq("id", paymentToDelete.id);

    if (error) {
      setDeletingPayment(false);
      toast.error("Failed to delete payment");
      return;
    }

    setPayments((prev) => prev.filter((payment) => payment.id !== paymentToDelete.id));

    const { data, error: refetchError } = await supabase
      .from("payments")
      .select("id, payment_date, amount, method, status")
      .eq("contract_id", contract.id)
      .order("payment_date", { ascending: false });

    setDeletingPayment(false);
    if (refetchError) {
      toast.error("Payment deleted, but payments could not refresh");
    } else {
      setPayments(data || []);
      toast.success("Payment deleted");
    }
    setPaymentToDelete(null);
  };

  const handleConfirmDeleteFee = async () => {
    if (!feeToDelete) return;

    setDeletingFee(true);
    const { error } = await (supabase as any)
      .from("contract_fees")
      .delete()
      .eq("id", feeToDelete.id);

    if (error) {
      setDeletingFee(false);
      toast.error("Failed to delete fee");
      return;
    }

    setContractFees((prev) => prev.filter((fee) => fee.id !== feeToDelete.id));
    await fetchContractFees();
    setDeletingFee(false);
    toast.success("Fee deleted");
    setFeeToDelete(null);
  };

  const openAmountEditDialog = (target: AmountEditTarget) => {
    setAmountEditTarget(target);
    setAmountEditValue(String(target.amount));
    setAmountEditExtensionEndDate(
      target.type === "fee" && isStructuredRentalExtensionFee(target.fee)
        ? target.fee.extension_end ?? ""
        : "",
    );
  };

  const closeAmountEditDialog = () => {
    if (savingAmountEdit) return;
    setAmountEditTarget(null);
    setAmountEditValue("");
    setAmountEditExtensionEndDate("");
  };

  const handleSaveAmountEdit = async () => {
    if (!contract || !amountEditTarget) return;

    const amount = Number(amountEditValue);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter a valid AED amount");
      return;
    }

    const nextAmount = Math.round(amount * 100) / 100;
    setSavingAmountEdit(true);

    if (amountEditTarget.type === "rental") {
      const { error } = await supabase
        .from("contracts")
        .update({ total_amount: nextAmount } as never)
        .eq("id", contract.id);

      if (error) {
        setSavingAmountEdit(false);
        toast.error("Failed to update rental amount");
        return;
      }

      setContract((prev) => (prev ? { ...prev, total_amount: nextAmount } : prev));
      await fetchData();
      setSavingAmountEdit(false);
      setAmountEditTarget(null);
      setAmountEditValue("");
      toast.success("Rental amount updated");
      return;
    }

    if (amountEditTarget.type === "payment") {
      const { error } = await supabase
        .from("payments")
        .update({ amount: nextAmount } as never)
        .eq("id", amountEditTarget.payment.id);

      if (error) {
        setSavingAmountEdit(false);
        toast.error("Failed to update payment amount");
        return;
      }

      setPayments((prev) =>
        prev.map((payment) =>
          payment.id === amountEditTarget.payment.id
            ? { ...payment, amount: nextAmount }
            : payment,
        ),
      );

      const { data, error: refetchError } = await supabase
        .from("payments")
        .select("id, payment_date, amount, method, status")
        .eq("contract_id", contract.id)
        .order("payment_date", { ascending: false });

      if (refetchError) {
        toast.error("Payment updated, but payments could not refresh");
      } else {
        setPayments(data || []);
        toast.success("Payment amount updated");
      }
      setSavingAmountEdit(false);
      setAmountEditTarget(null);
      setAmountEditValue("");
      return;
    }

    if (isStructuredRentalExtensionFee(amountEditTarget.fee)) {
      const extensionStart = amountEditTarget.fee.extension_start;
      if (!extensionStart || !amountEditExtensionEndDate) {
        setSavingAmountEdit(false);
        toast.error("Select an extension end date");
        return;
      }

      if (amountEditExtensionEndDate <= extensionStart) {
        setSavingAmountEdit(false);
        toast.error("End date must be later than the extension start");
        return;
      }

      const nextLabel = buildRentalExtensionLabel(extensionStart, amountEditExtensionEndDate);
      const { error } = await (supabase as any)
        .from("contract_fees")
        .update({
          extension_end: amountEditExtensionEndDate,
          amount: nextAmount,
          label: nextLabel,
        })
        .eq("id", amountEditTarget.fee.id);

      if (error) {
        setSavingAmountEdit(false);
        toast.error("Failed to update extension");
        return;
      }

      setContractFees((prev) =>
        prev.map((fee) =>
          fee.id === amountEditTarget.fee.id
            ? {
                ...fee,
                amount: nextAmount,
                extension_end: amountEditExtensionEndDate,
                label: nextLabel,
              }
            : fee,
        ),
      );
      await fetchContractFees();
      setSavingAmountEdit(false);
      setAmountEditTarget(null);
      setAmountEditValue("");
      setAmountEditExtensionEndDate("");
      toast.success("Extension updated");
      return;
    }

    const { error } = await (supabase as any)
      .from("contract_fees")
      .update({ amount: nextAmount })
      .eq("id", amountEditTarget.fee.id);

    if (error) {
      setSavingAmountEdit(false);
      toast.error("Failed to update fee amount");
      return;
    }

    setContractFees((prev) =>
      prev.map((fee) =>
        fee.id === amountEditTarget.fee.id ? { ...fee, amount: nextAmount } : fee,
      ),
    );
    await fetchContractFees();
    setSavingAmountEdit(false);
    setAmountEditTarget(null);
    setAmountEditValue("");
    setAmountEditExtensionEndDate("");
    toast.success("Fee amount updated");
  };

  const handleOpenEditModal = async () => {
    if (!contract) return;
    setEditStartDate(contract.start_date);
    setEditStartTime(formatTimeDisplay(contract.start_time));
    setEditEndDate(contract.end_date);
    setEditEndTime(formatTimeDisplay(contract.end_time));
    setEditCarId(contract.car_id);
    const { data } = await supabase
      .from("cars")
      .select("id, plate, make, model, year, status")
      .eq("status", "available")
      .order("plate");
    setAvailableCars((data as AvailableCarRow[]) ?? []);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!contract) return;
    setIsSavingEdit(true);
    try {
      const conflict = await findVehicleContractOverlap(supabase, {
        carId: editCarId,
        startDate: editStartDate,
        startTime: editStartTime,
        endDate: editEndDate,
        endTime: editEndTime,
        excludeContractId: contract.id,
        operation: "contract-edit",
      });
      if (conflict) {
        setIsSavingEdit(false);
        toast.error(formatContractOverlapMessage(conflict));
        return;
      }
    } catch (error) {
      setIsSavingEdit(false);
      const message = error instanceof Error ? error.message : "Could not check vehicle availability.";
      toast.error(message);
      return;
    }
    const { error } = await supabase
      .from("contracts")
      .update({
        start_date: editStartDate,
        start_time: formatTimeForDb(editStartTime),
        end_date: editEndDate,
        end_time: formatTimeForDb(editEndTime),
        car_id: editCarId,
      } as never)
      .eq("id", contract.id);
    setIsSavingEdit(false);
    if (error) {
      toast.error("Failed to save changes");
      return;
    }
    toast.success("Contract updated");
    setShowEditModal(false);
    fetchData();
  };

  const resetFeeForm = () => {
    setFeeCategory("delivery");
    setFeeLabel("Delivery");
    setFeeAmount("");
  };

  const selectFeeCategory = (category: FeeCategory) => {
    const selected = FEE_CATEGORIES.find((item) => item.value === category);
    setFeeCategory(category);
    setFeeLabel(selected?.defaultLabel ?? "");
  };

  const handleAddFee = async () => {
    if (!contract || !user) return;

    const amount = Number(feeAmount);
    const label = feeLabel.trim();

    if (!label || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a fee label and amount");
      return;
    }

    setSavingFee(true);
    const { error } = await (supabase as any)
      .from("contract_fees")
      .insert({
        contract_id: contract.id,
        category: feeCategory,
        label,
        amount,
        owner_id: user.id,
      });
    setSavingFee(false);

    if (error) {
      toast.error("Failed to add fee");
      return;
    }

    toast.success("Fee added");
    setShowFeeModal(false);
    resetFeeForm();
    setFeeRefreshKey((key) => key + 1);
  };

  if (loading) {
    return (
      <DashboardLayout title="Contract">
        <div className="h-24 pt-10 text-center text-sm text-muted-foreground">Loading...</div>
      </DashboardLayout>
    );
  }

  if (!contract) {
    return (
      <DashboardLayout title="Contract not found">
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">This contract does not exist.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link to="/contracts">Back to contracts</Link>
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const contractNumber = `CTR-${contract.id.slice(0, 8).toUpperCase()}`;
  const isContractClosed = contract.status.toLowerCase() === "closed";
  const canExtendContract = ["active", "expiring soon", "overdue"].includes(contract.status.toLowerCase());
  const rentalFeeLines = sortRentalExtensionFees(contractFees);
  const manualFeeLines = contractFees.filter((fee) => !isRentalExtensionFee(fee));
  const grossPaymentAllocationLines: ContractPaymentAllocationLine[] = [
    {
      id: `rental-${contract.id}`,
      category: "rental",
      label: "Original Contract",
      due: Number(contract.total_amount),
      dueDate: contract.end_date,
    },
    ...rentalFeeLines.map((fee, index) => {
      return {
        id: `fee-${fee.id}`,
        category: "rental" as const,
        label: `Extension #${index + 1}`,
        due: Number(fee.amount),
        dueDate: fee.extension_end ?? null,
      };
    }),
    ...manualFeeLines.map((fee) => ({
      id: `fee-${fee.id}`,
      category: "fees" as const,
      label: fee.label,
      due: Number(fee.amount),
      overdueImmediately: true,
    })),
    ...fines
      .filter((fine) => fine.status.toLowerCase() !== "paid")
      .map((fine) => ({
        id: `fine-${fine.id}`,
        category: "fines" as const,
        label: fine.fine_number ? `${fine.fine_type} ${fine.fine_number}` : fine.fine_type,
        due: Number(fine.amount),
        overdueImmediately: true,
      })),
    ...salik
      .filter((charge) => charge.status.toLowerCase() !== "paid")
      .map((charge) => ({
        id: `salik-${charge.id}`,
        category: "salik" as const,
        label: charge.transaction_id ? `Salik ${charge.transaction_id}` : charge.toll_gate ? `Salik ${charge.toll_gate}` : "Salik",
        due: Number(charge.amount),
        overdueImmediately: true,
      })),
  ];
  const paidByLine = new Map(grossPaymentAllocationLines.map((line) => [line.id, 0]));
  const addLinePayment = (lineId: string, amountToAdd: number) => {
    const line = grossPaymentAllocationLines.find((item) => item.id === lineId);
    if (!line || amountToAdd <= 0) return 0;

    const currentPaid = paidByLine.get(lineId) ?? 0;
    const nextPaid = Math.min(line.due, currentPaid + amountToAdd);
    paidByLine.set(lineId, nextPaid);
    return nextPaid - currentPaid;
  };
  const distributePayment = (lines: PaymentAllocationLine[], amountToDistribute: number) => {
    let remaining = amountToDistribute;
    for (const line of lines) {
      if (remaining <= 0) break;
      remaining -= addLinePayment(line.id, remaining);
    }
    return amountToDistribute - remaining;
  };

  [...payments]
    .filter((payment) => payment.status.toLowerCase() === "paid")
    .sort((a, b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime())
    .forEach((payment) => {
      const savedAllocations = readSavedPaymentAllocations(payment.allocations);
      let applied = 0;

      if (savedAllocations?.lines && Object.keys(savedAllocations.lines).length > 0) {
        Object.entries(savedAllocations.lines).forEach(([lineId, value]) => {
          const numericValue = Number(value);
          addLinePayment(lineId, numericValue);
          applied += numericValue;
        });
      } else if (savedAllocations) {
        (["rental", "fees", "fines", "salik"] as const).forEach((category) => {
          const value = Number(savedAllocations[category] ?? 0);
          if (value <= 0) return;
          distributePayment(
            grossPaymentAllocationLines.filter((line) => line.category === category),
            value,
          );
          applied += value;
        });
      }

      const remainder = Number(payment.amount) - applied;
      if (remainder > 0.01) {
        distributePayment(grossPaymentAllocationLines, remainder);
      }
    });
  const paymentAllocationLines = grossPaymentAllocationLines
    .map((line) => ({
      ...line,
      due: Math.max(0, Number(line.due) - (paidByLine.get(line.id) ?? 0)),
    }))
    .filter((line) => line.due > 0.01);
  const todayDate = getTodayDateInput();
  // contract_fees, fines, and Salik do not carry due dates, so non-rental unpaid charges are treated as overdue once attached.
  const overdueBalance = paymentAllocationLines.reduce((sum, line) => {
    const isPastRentalPeriod = line.category === "rental" && Boolean(line.dueDate) && line.dueDate < todayDate;
    const isImmediateCharge = line.category !== "rental" && line.overdueImmediately;
    return isPastRentalPeriod || isImmediateCharge ? sum + Number(line.due) : sum;
  }, 0);
  const financialTotals: ContractFinancialTotals = {
    ...totals,
    overdue: Math.min(totals.outstanding, Math.max(0, overdueBalance)),
  };
  const isOverdue = financialTotals.overdue > 0 && contract.status !== "Cancelled";
  const closeDepositAmount = Math.max(0, Number(contract.deposit_amount) || 0);
  const closeOutstandingBalance = Math.max(0, Number(financialTotals.outstanding) || 0);
  const closeDepositApplyAmount =
    depositCloseAction === "apply_to_balance"
      ? Math.min(closeDepositAmount, closeOutstandingBalance)
      : 0;
  const closeDepositRetainedAmount =
    depositCloseAction === "retain_full"
      ? closeDepositAmount
      : depositCloseAction === "retain_partial"
        ? Math.min(closeDepositAmount, Math.max(0, Number(depositRetainedAmount) || 0))
        : 0;
  const closeDepositReturnAmount = Math.max(
    0,
    closeDepositAmount - closeDepositApplyAmount - closeDepositRetainedAmount,
  );
  const closeDepositReturnDueDate =
    closeDepositReturnAmount > 0
      ? depositReturnDueDate || (!depositReturnDueDateEdited ? addDaysToDateInput(closeReturnDate, 15) : null)
      : null;
  const closeDepositReturnDueLabel = closeDepositReturnDueDate
    ? formatDate(closeDepositReturnDueDate)
    : closeDepositReturnAmount > 0
      ? "Select date"
      : "No return due";
  const closeFinalOutstanding = Math.max(0, closeOutstandingBalance - closeDepositApplyAmount);
  const closeRetainedAmountInput = Number(depositRetainedAmount);
  const isCloseRetainPartialValid =
    depositCloseAction !== "retain_partial" ||
    (Number.isFinite(closeRetainedAmountInput) &&
      closeRetainedAmountInput > 0 &&
      closeRetainedAmountInput <= closeDepositAmount &&
      depositRetainReason.trim().length > 0);
  const isCloseRetainFullValid =
    depositCloseAction !== "retain_full" || depositRetainReason.trim().length > 0;
  const isCloseDepositReturnDateValid =
    closeDepositReturnAmount <= 0 || Boolean(closeDepositReturnDueDate);
  const isCloseConfirmDisabled =
    isClosing ||
    !isCloseRetainPartialValid ||
    !isCloseRetainFullValid ||
    !isCloseDepositReturnDateValid;
  const latestRentalPeriodEnd = getLatestRentalPeriodEnd(contract, rentalFeeLines);
  const extensionMinDate = addDaysToDateInput(latestRentalPeriodEnd, 1);
  const extensionPreviewDays = extendEndDate ? diffDays(latestRentalPeriodEnd, extendEndDate) : 0;
  const extensionPreviewCharge = Number(extendAmount);
  const extensionConfirmLabel = extendEndDate
    ? `Confirm Extension → ${formatDate(extendEndDate)}`
    : "Confirm Extension";
  const amountEditIsExtension =
    amountEditTarget?.type === "fee" && isStructuredRentalExtensionFee(amountEditTarget.fee);
  const amountEditExtensionPeriod =
    amountEditTarget?.type === "fee"
      ? parseRentalExtensionPeriod(amountEditTarget.fee.label)
      : null;
  const amountEditExtensionStartDate =
    amountEditTarget?.type === "fee"
      ? amountEditTarget.fee.extension_start ?? amountEditExtensionPeriod?.periodStart ?? null
      : null;
  const amountEditExtensionEndDisplay =
    amountEditExtensionEndDate ||
    (amountEditTarget?.type === "fee"
      ? amountEditTarget.fee.extension_end ?? amountEditExtensionPeriod?.periodEnd ?? null
      : null);

  return (
    <DashboardLayout title={contractNumber} subtitle="Contract details">
      <div className="w-[calc(100%+2rem)] max-w-[100vw] min-w-0 -mx-4 -my-6 md:w-[calc(100%+4rem)] md:-mx-8 md:-my-8">
        {/* Sticky header */}
        <div className="sticky top-0 z-20 max-w-full min-w-0 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex max-w-full min-w-0 flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Button asChild variant="ghost" size="sm" className="h-8 -ml-2 gap-1.5 text-muted-foreground">
                <Link to="/contracts">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Contracts
                </Link>
              </Button>
              <div className="h-5 w-px bg-border" />
              <div className="flex min-w-0 items-center gap-2.5">
                <h2 className="min-w-0 truncate font-mono text-sm font-semibold tracking-tight text-foreground">
                  {contractNumber}
                </h2>
                <span
                  className={cn(
                    "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
                    statusBadgeClass(contract.status),
                  )}
                >
                  {contract.status}
                </span>
              </div>
            </div>

            <div className="flex max-w-full min-w-0 items-center gap-4">
              <div className="flex max-w-full flex-nowrap items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={handleDownloadInvoice}
                  disabled={generatingInvoice}
                >
                  <Download className="h-3.5 w-3.5" />
                  {generatingInvoice ? "Generating..." : "Invoice"}
                </Button>
                {canExtendContract && (
                  <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={openExtendModal}>
                    <CalendarPlus className="h-3.5 w-3.5" />
                    Extend
                  </Button>
                )}
                {!isContractClosed && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => {
                      const d = contract.end_date;
                      const defaultCloseDate = d.includes("T") ? d.slice(0, 16) : `${d}T00:00`;
                      setCloseReturnDate(defaultCloseDate);
                      setCloseReceivedBy("");
                      setCloseFinalMileage("");
                      setCloseVehicleStatus("Available");
                      setDepositCloseAction("return_full");
                      setDepositRetainedAmount("");
                      setDepositRetainReason("");
                      setDepositReturnDueDate(addDaysToDateInput(defaultCloseDate, 15));
                      setDepositReturnDueDateEdited(false);
                      setShowCloseModal(true);
                    }}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Close
                  </Button>
                )}
                {isContractClosed && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => setReopenConfirmOpen(true)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reopen Contract
                  </Button>
                )}
                <Button size="sm" className="h-8 gap-1.5" onClick={handleOpenEditModal}>
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full max-w-full min-w-0 px-4 py-4 md:px-8">
          <div className="w-full max-w-full min-w-0 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList className="h-9 w-max min-w-max bg-muted/60 p-0.5">
              <TabsTrigger value="overview" className="h-8 gap-1.5 px-3 text-xs">
                <LayoutGrid className="h-3.5 w-3.5" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="financials" className="h-8 gap-1.5 px-3 text-xs">
                <Wallet className="h-3.5 w-3.5" />
                Financials
                {ledger.length > 0 && (
                  <span className="ml-1 rounded bg-background/70 px-1.5 text-[10px] tabular-nums">
                    {ledger.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="documents" className="h-8 gap-1.5 px-3 text-xs">
                <FileText className="h-3.5 w-3.5" />
                Documents
              </TabsTrigger>
              <TabsTrigger value="inspection" className="h-8 gap-1.5 px-3 text-xs">
                <Camera className="h-3.5 w-3.5" />
                Inspection
              </TabsTrigger>
              <TabsTrigger value="timeline" className="h-8 gap-1.5 px-3 text-xs">
                <Clock className="h-3.5 w-3.5" />
                Timeline & Notes
              </TabsTrigger>
            </TabsList>
          </div>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="mt-4 max-w-full min-w-0 space-y-3">
            <div className="flex flex-wrap gap-2">
              {canExtendContract && (
                <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={openExtendModal}>
                  <CalendarPlus className="h-3.5 w-3.5" />
                  Extend Rental
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled>
                <Pencil className="h-3.5 w-3.5" />
                Edit Details
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setReplaceVehicleOpen(true)}
                disabled={contract.status === "Closed"}
              >
                Replace Vehicle
              </Button>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <Panel
                title="Client"
                action={
                  contract.client_id && (
                    <Button asChild variant="ghost" size="sm" className="h-6 px-2 text-[11px]">
                      <Link to={`/clients/${contract.client_id}`}>View profile →</Link>
                    </Button>
                  )
                }
              >
                <div className="grid grid-cols-2 gap-x-4">
                  <Field label="Full Name" value={contract.clients?.full_name} />
                  <Field label="Type" value={contract.clients?.client_type} />
                  <Field label="Phone" value={contract.clients?.phone} />
                  <Field label="Email" value={contract.clients?.email} />
                  <Field label="Nationality" value={contract.clients?.nationality} />
                  <Field
                    label={contract.clients?.client_type === "Tourist" ? "Passport" : "Emirates ID"}
                    value={
                      contract.clients?.client_type === "Tourist"
                        ? contract.clients?.passport_number
                        : contract.clients?.emirates_id
                    }
                  />
                </div>
              </Panel>

              <Panel title="Vehicle">
                <div className="grid grid-cols-2 gap-x-4">
                  <Field label="Plate" value={contract.cars?.plate} />
                  <Field label="Year" value={contract.cars?.year} />
                  <Field
                    label="Make / Model"
                    value={contract.cars ? `${contract.cars.make} ${contract.cars.model}` : "—"}
                  />
                  <Field label="Fuel Level" value={contract.fuel_level} />
                  <Field
                    label="Initial Mileage"
                    value={`${contract.initial_mileage.toLocaleString()} km`}
                  />
                </div>
                {replacementCount > 0 && (
                  <button
                    onClick={() => setHistoryOpen(true)}
                    className="w-full flex items-center justify-between mt-3 pt-3 border-t border-white/[0.07] text-left hover:bg-white/[0.02] rounded px-0.5 transition-colors"
                  >
                    <span className="flex items-center gap-2 text-[12px] font-medium text-white/50">
                      <History className="w-4 h-4" />
                      Vehicle replacements
                      <span className="font-mono text-[10px] text-blue-400 bg-blue-400/10 border border-blue-400/20 rounded px-1.5 py-0.5">{replacementCount}</span>
                    </span>
                    <span className="text-white/30 text-xs">→</span>
                  </button>
                )}
              </Panel>

              <Panel title="Rental Period">
                <div className="grid grid-cols-2 gap-x-4">
                  <Field label="Start Date" value={formatDate(contract.start_date)} />
                  <Field label="End Date" value={formatDate(contract.end_date)} />
                  <Field label="Total Days" value={days} />
                  <Field label="Rate Type" value={contract.rate_type} />
                  <Field label={`${contract.rate_type} Rate`} value={fmtAed(contract.rate_amount)} />
                  <Field label="Deposit" value={fmtAed(contract.deposit_amount)} />
                </div>
              </Panel>
            </div>

            <Panel title="Financial Snapshot" icon={Wallet}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Total Charges
                  </div>
                  <div className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
                    {fmtAed(financialTotals.charges - Number(contract.deposit_amount))}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Paid
                  </div>
                  <div className="mt-0.5 text-base font-semibold tabular-nums text-tint-green-foreground">
                    {fmtAed(financialTotals.credits)}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Deposit Held
                  </div>
                  <div className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
                    {fmtAed(contract.deposit_amount)}
                  </div>
                </div>
                <div
                  className={cn(
                    "rounded-md border px-3 py-2",
                    isOverdue ? "border-tint-rose-foreground/30 bg-tint-rose" : "border-border bg-muted/30",
                  )}
                >
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Outstanding
                  </div>
                  <div
                    className={cn(
                      "mt-0.5 text-base font-semibold tabular-nums",
                      isOverdue ? "text-tint-rose-foreground" : "text-foreground",
                    )}
                  >
                    {fmtAed(financialTotals.outstanding)}
                  </div>
                </div>
              </div>
            </Panel>
          </TabsContent>

          {/* FINANCIALS */}
          <TabsContent value="financials" className="mt-4 max-w-full min-w-0 space-y-3">
            <FinancialsPanel
              contract={contract}
              days={days}
              payments={payments}
              fines={fines}
              salik={salik}
              chargeImportEvidence={chargeImportEvidence}
              contractFees={contractFees}
              unpaidAllocationLines={paymentAllocationLines}
              totals={financialTotals}
              onAddFee={() => setShowFeeModal(true)}
              onAddPayment={() => setShowPaymentModal(true)}
              onEditRentalAmount={() =>
                openAmountEditDialog({
                  type: "rental",
                  label: "Rental charge",
                  amount: Number(contract.total_amount),
                })
              }
              onEditPaymentAmount={(payment) =>
                openAmountEditDialog({
                  type: "payment",
                  label: `Payment (${payment.method})`,
                  amount: Number(payment.amount),
                  payment,
                })
              }
              onEditFeeAmount={(fee) =>
                openAmountEditDialog({
                  type: "fee",
                  label: `${fee.label} fee`,
                  amount: Number(fee.amount),
                  fee,
                })
              }
              onDeletePayment={setPaymentToDelete}
              onDeleteFee={setFeeToDelete}
              onMarkDepositReturned={handleMarkDepositReturned}
              markingDepositReturned={markingDepositReturned}
            />
            <RecordPaymentModal
              open={showPaymentModal}
              onClose={() => setShowPaymentModal(false)}
              onSuccess={fetchData}
              contractId={contract.id}
              balanceDue={financialTotals.outstanding}
              clientId={contract.client_id}
              allocationLines={paymentAllocationLines}
              ledgerEntries={ledger.map(e => ({
                id: e.id,
                description: e.description,
                amount: e.debit - e.credit,
                status: e.status,
                type: e.type
              }))}
            />
            <Dialog
              open={showFeeModal}
              onOpenChange={(open) => {
                setShowFeeModal(open);
                if (!open) resetFeeForm();
              }}
            >
              <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                  <DialogTitle>Add Fee</DialogTitle>
                  <DialogDescription className="text-xs">
                    Add a contract fee without changing deposits, payments, fines, or Salik.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label className="text-xs">Category</Label>
                    <div className="flex flex-wrap gap-2">
                      {FEE_CATEGORIES.map((category) => (
                        <Button
                          key={category.value}
                          type="button"
                          variant={feeCategory === category.value ? "default" : "outline"}
                          size="sm"
                          className="h-8 rounded-full px-3 text-xs"
                          onClick={() => selectFeeCategory(category.value)}
                        >
                          {category.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fee-label" className="text-xs">
                      Label
                    </Label>
                    <Input
                      id="fee-label"
                      value={feeLabel}
                      onChange={(e) => setFeeLabel(e.target.value)}
                      placeholder="Fee label"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fee-amount" className="text-xs">
                      Amount (AED)
                    </Label>
                    <Input
                      id="fee-amount"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={feeAmount}
                      onChange={(e) => setFeeAmount(e.target.value)}
                      className="font-mono tabular-nums"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowFeeModal(false)}
                    disabled={savingFee}
                  >
                    Cancel
                  </Button>
                  <Button type="button" onClick={handleAddFee} disabled={savingFee}>
                    {savingFee ? "Adding..." : "Add Fee"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* DOCUMENTS */}
          <TabsContent value="documents" className="mt-4 max-w-full min-w-0">
            <Panel
              title="Documents"
              icon={FileText}
              action={
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled>
                  <Plus className="h-3.5 w-3.5" />
                  Upload
                </Button>
              }
            >
              <EmptyState
                icon={FileText}
                title="No documents uploaded"
                description="Attach the signed contract, vehicle handover form, ID copies and other files here."
                action={
                  <Button size="sm" variant="outline" className="mt-2 h-8 gap-1.5" disabled>
                    <Plus className="h-3.5 w-3.5" />
                    Upload first document
                  </Button>
                }
              />
            </Panel>
          </TabsContent>

          {/* INSPECTION */}
          <TabsContent value="inspection" className="mt-4 max-w-full min-w-0">
            <InspectionPhotosTab contractId={contract.id} uploadedBy={user?.id ?? null} />
          </TabsContent>

          {/* TIMELINE & NOTES */}
          <TabsContent value="timeline" className="mt-4 grid max-w-full min-w-0 gap-3 lg:grid-cols-2">
            <Panel
              title="Notes"
              icon={Pencil}
              action={
                editingNotes ? (
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-xs"
                      onClick={() => {
                        setNotesDraft(contract.notes ?? "");
                        setEditingNotes(false);
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={saveNotes}
                      disabled={savingNotes}
                    >
                      <Save className="h-3.5 w-3.5" />
                      {savingNotes ? "Saving..." : "Save"}
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setEditingNotes(true)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                )
              }
            >
              {editingNotes ? (
                <Textarea
                  rows={6}
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Add notes about this contract..."
                  className="text-sm"
                />
              ) : contract.notes ? (
                <p className="whitespace-pre-wrap text-sm text-foreground">{contract.notes}</p>
              ) : (
                <EmptyState
                  icon={Pencil}
                  title="No notes yet"
                  description="Click Edit to add internal notes about this contract."
                />
              )}
            </Panel>

            <Panel title="Activity Timeline" icon={Clock}>
              <ol className="relative space-y-3 border-l border-border pl-4">
                <li className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-tint-blue-foreground" />
                  <div className="text-xs text-muted-foreground">{formatDate(contract.created_at)}</div>
                  <div className="text-sm font-medium text-foreground">Contract created</div>
                </li>
                <li className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-tint-green-foreground" />
                  <div className="text-xs text-muted-foreground">{formatDate(contract.start_date)}</div>
                  <div className="text-sm font-medium text-foreground">Rental period started</div>
                </li>
                <li className="relative">
                  <span
                    className={cn(
                      "absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background",
                      new Date(contract.end_date) < new Date()
                        ? "bg-muted-foreground"
                        : "bg-tint-amber-foreground",
                    )}
                  />
                  <div className="text-xs text-muted-foreground">{formatDate(contract.end_date)}</div>
                  <div className="text-sm font-medium text-foreground">
                    {new Date(contract.end_date) < new Date() ? "Rental ended" : "Scheduled end date"}
                  </div>
                </li>
                {isOverdue && (
                  <li className="relative">
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-tint-rose-foreground" />
                    <div className="text-xs text-muted-foreground">Now</div>
                    <div className="flex items-center gap-1.5 text-sm font-medium text-tint-rose-foreground">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Outstanding balance: {fmtAed(financialTotals.outstanding)}
                    </div>
                  </li>
                )}
              </ol>
            </Panel>
          </TabsContent>
        </Tabs>
        <div className="mt-8 pb-8 text-right">
          <Button
            variant="ghost"
            size="sm"
            className="text-red-500 hover:bg-red-500/10 hover:text-red-600 gap-1.5"
            onClick={() => setDeleteConfirmOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Contract
          </Button>
        </div>
      </div>

      <AlertDialog open={reopenConfirmOpen} onOpenChange={setReopenConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reopen this contract?</AlertDialogTitle>
            <AlertDialogDescription>
              Reopen this contract? The status will be changed back to Active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isReopening}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReopenContract} disabled={isReopening}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this contract?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete this contract and all its payments? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteContract}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Contract
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={amountEditTarget !== null}
        onOpenChange={(open) => {
          if (!open) closeAmountEditDialog();
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{amountEditIsExtension ? "Edit Rental Period" : "Edit Amount"}</DialogTitle>
            <DialogDescription className="text-xs">
              {amountEditIsExtension ? (
                <>
                  <span className="block">Rental Period</span>
                  <span className="mt-1 block font-mono text-[11px]">
                    {formatDate(amountEditExtensionStartDate)} → {formatDate(amountEditExtensionEndDisplay)}
                  </span>
                </>
              ) : (
                amountEditTarget?.label ?? "Financial entry"
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {amountEditIsExtension && (
              <div className="space-y-2">
                <Label htmlFor="edit-extension-end-date" className="text-xs">
                  End date
                </Label>
                <Input
                  id="edit-extension-end-date"
                  type="date"
                  value={amountEditExtensionEndDate}
                  onChange={(event) => setAmountEditExtensionEndDate(event.target.value)}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-financial-amount" className="text-xs">
                {amountEditIsExtension ? "Amount" : "Amount (AED)"}
              </Label>
              <Input
                id="edit-financial-amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={amountEditValue}
                onChange={(event) => setAmountEditValue(event.target.value)}
                className="font-mono tabular-nums"
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeAmountEditDialog}
              disabled={savingAmountEdit}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveAmountEdit}
              disabled={savingAmountEdit}
            >
              {savingAmountEdit ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={paymentToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deletingPayment) setPaymentToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Payment</AlertDialogTitle>
            <AlertDialogDescription>
              Delete payment of {paymentToDelete ? fmtAed(Number(paymentToDelete.amount)) : "AED 0"}? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingPayment}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingPayment}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDeletePayment();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingPayment ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={feeToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deletingFee) setFeeToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Fee</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {feeToDelete?.label ?? "selected"} fee of {feeToDelete ? fmtAed(Number(feeToDelete.amount)) : "AED 0"}? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingFee}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingFee}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDeleteFee();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingFee ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showEditModal} onOpenChange={(v) => !v && setShowEditModal(false)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Edit Contract</DialogTitle>
            <DialogDescription className="text-xs">
              {contract ? `CTR-${contract.id.slice(0, 8).toUpperCase()}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Start Date
              </Label>
              <input
                type="date"
                value={editStartDate}
                onChange={(e) => setEditStartDate(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Start Time
              </Label>
              <input
                type="time"
                value={editStartTime}
                onChange={(e) => setEditStartTime(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button
              disabled={isSavingEdit || !editStartDate || !editStartTime || !editEndDate || !editEndTime || !editCarId}
              onClick={handleSaveEdit}
            >
              {isSavingEdit ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showExtendModal} onOpenChange={(v) => !v && setShowExtendModal(false)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Extend Contract</DialogTitle>
            <DialogDescription className="text-xs">
              {contract ? `CTR-${contract.id.slice(0, 8).toUpperCase()}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                New end date
              </Label>
              <input
                type="date"
                min={extensionMinDate}
                value={extendEndDate}
                onChange={(e) => {
                  setExtendEndDate(e.target.value);
                  setExtendError("");
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="extension-amount" className="text-xs uppercase tracking-wide text-muted-foreground">
                Amount (AED)
              </Label>
              <Input
                id="extension-amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={extendAmount}
                onChange={(e) => {
                  setExtendAmount(e.target.value);
                  setExtendError("");
                }}
                className="font-mono tabular-nums"
                placeholder="0.00"
              />
            </div>

            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
              <div className="grid gap-1 font-mono text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span>Period</span>
                  <span className="text-right text-foreground">
                    {formatDate(latestRentalPeriodEnd)} {"->"} {extendEndDate ? formatDate(extendEndDate) : "Select date"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Days</span>
                  <span className="text-right text-foreground">{extensionPreviewDays}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Charge</span>
                  <span className="text-right text-foreground">
                    {Number.isFinite(extensionPreviewCharge) ? fmtAed(extensionPreviewCharge) : "AED 0"}
                  </span>
                </div>
              </div>
            </div>

            {extendError && (
              <div className="rounded-md border border-tint-rose-foreground/20 bg-tint-rose px-3 py-2 text-xs text-tint-rose-foreground">
                {extendError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExtendModal(false)}>
              Cancel
            </Button>
            <Button
              disabled={isExtending || !extendEndDate || !extendAmount}
              onClick={handleExtendContract}
            >
              {isExtending ? "Saving..." : extensionConfirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCloseModal} onOpenChange={(v) => !v && setShowCloseModal(false)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Close Contract</DialogTitle>
            <DialogDescription className="text-xs">
              {contract ? `CTR-${contract.id.slice(0, 8).toUpperCase()}` : ""} · This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Return Date &amp; Time
              </Label>
              <input
                type="datetime-local"
                value={closeReturnDate}
                onChange={(e) => {
                  const nextCloseDate = e.target.value;
                  setCloseReturnDate(nextCloseDate);
                  if (!depositReturnDueDateEdited) {
                    setDepositReturnDueDate(addDaysToDateInput(nextCloseDate, 15));
                  }
                }}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Received By
              </Label>
              <Input
                placeholder="Staff name"
                value={closeReceivedBy}
                onChange={(e) => setCloseReceivedBy(e.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Final Mileage (km)
              </Label>
              <Input
                type="number"
                min={contract?.initial_mileage ?? 0}
                value={closeFinalMileage}
                onChange={(e) => setCloseFinalMileage(e.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Vehicle Status After Return
              </Label>
              <Select value={closeVehicleStatus} onValueChange={setCloseVehicleStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Available">Available</SelectItem>
                  <SelectItem value="Under Service">Under Service</SelectItem>
                  <SelectItem value="Reserved">Reserved</SelectItem>
                  <SelectItem value="Unavailable">Unavailable</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {closeDepositAmount > 0 && (
              <div className="grid gap-3 rounded-md border border-border bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Security Deposit
                    </Label>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Refundable amounts are scheduled for return after the hold period.
                    </p>
                  </div>
                  <div className="text-right font-mono text-sm font-semibold tabular-nums">
                    {fmtAed(closeDepositAmount)}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border border-border bg-background px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Deposit held
                    </div>
                    <div className="mt-0.5 font-mono font-semibold tabular-nums">
                      {fmtAed(closeDepositAmount)}
                    </div>
                  </div>
                  <div className="rounded-md border border-border bg-background px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Outstanding
                    </div>
                    <div className="mt-0.5 font-mono font-semibold tabular-nums">
                      {fmtAed(closeOutstandingBalance)}
                    </div>
                  </div>
                </div>

                <RadioGroup
                  value={depositCloseAction}
                  onValueChange={(value) => setDepositCloseAction(value as DepositCloseAction)}
                  className="gap-2"
                >
                  <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
                    <RadioGroupItem value="return_full" />
                    <span className="flex-1">Schedule full deposit return</span>
                    <span className="font-mono text-xs font-semibold tabular-nums">
                      {fmtAed(closeDepositAmount)}
                    </span>
                  </label>
                  <label
                    className={cn(
                      "flex min-h-10 cursor-pointer items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm",
                      closeOutstandingBalance <= 0 && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <RadioGroupItem value="apply_to_balance" disabled={closeOutstandingBalance <= 0} />
                    <span className="flex-1">Apply to outstanding balance</span>
                    <span className="font-mono text-xs font-semibold tabular-nums">
                      {fmtAed(Math.min(closeDepositAmount, closeOutstandingBalance))}
                    </span>
                  </label>
                  <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
                    <RadioGroupItem value="retain_partial" />
                    <span className="flex-1">Retain partial amount</span>
                  </label>
                  <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
                    <RadioGroupItem value="retain_full" />
                    <span className="flex-1">Retain full deposit</span>
                    <span className="font-mono text-xs font-semibold tabular-nums">
                      {fmtAed(closeDepositAmount)}
                    </span>
                  </label>
                </RadioGroup>

                {depositCloseAction === "retain_partial" && (
                  <div className="grid gap-1.5">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Retained Amount
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        AED
                      </span>
                      <Input
                        type="number"
                        min={0}
                        max={closeDepositAmount}
                        value={depositRetainedAmount}
                        onChange={(e) => setDepositRetainedAmount(e.target.value)}
                        className="pl-12"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                )}

                {(depositCloseAction === "retain_partial" || depositCloseAction === "retain_full") && (
                  <div className="grid gap-1.5">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Retention Reason
                    </Label>
                    <Textarea
                      value={depositRetainReason}
                      onChange={(e) => setDepositRetainReason(e.target.value)}
                      placeholder="Damage, fuel, late return, fines pending..."
                      className="min-h-[72px]"
                    />
                  </div>
                )}

                {closeDepositReturnAmount > 0 && (
                  <div className="grid gap-1.5">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Return Due Date
                    </Label>
                    <input
                      type="date"
                      value={depositReturnDueDate}
                      onChange={(e) => {
                        setDepositReturnDueDate(e.target.value);
                        setDepositReturnDueDateEdited(true);
                      }}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm tabular-nums ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Default is 15 days after close. Same-day return is allowed.
                    </p>
                  </div>
                )}

                <div className="grid gap-1 rounded-md bg-background px-3 py-2 text-xs">
                  {depositCloseAction === "apply_to_balance" && (
                    <>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Applied to balance</span>
                        <span className="font-mono font-semibold tabular-nums">
                          {fmtAed(closeDepositApplyAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Pending return</span>
                        <span className="font-mono font-semibold tabular-nums">
                          {fmtAed(closeDepositReturnAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Return due</span>
                        <span className="font-mono font-semibold tabular-nums">
                          {closeDepositReturnDueLabel}
                        </span>
                      </div>
                    </>
                  )}
                  {depositCloseAction === "return_full" && (
                    <>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Pending return</span>
                        <span className="font-mono font-semibold tabular-nums">
                          {fmtAed(closeDepositReturnAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Return due</span>
                        <span className="font-mono font-semibold tabular-nums">
                          {closeDepositReturnDueLabel}
                        </span>
                      </div>
                    </>
                  )}
                  {(depositCloseAction === "retain_partial" || depositCloseAction === "retain_full") && (
                    <>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Retained</span>
                        <span className="font-mono font-semibold tabular-nums">
                          {fmtAed(closeDepositRetainedAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Pending return</span>
                        <span className="font-mono font-semibold tabular-nums">
                          {fmtAed(closeDepositReturnAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Return due</span>
                        <span className="font-mono font-semibold tabular-nums">
                          {closeDepositReturnDueLabel}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="grid gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Close Summary
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Outstanding before deposit</span>
                <span className="font-mono font-semibold tabular-nums">
                  {fmtAed(closeOutstandingBalance)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Deposit held</span>
                <span className="font-mono font-semibold tabular-nums">
                  {fmtAed(closeDepositAmount)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Applied to balance</span>
                <span className="font-mono font-semibold tabular-nums">
                  {fmtAed(closeDepositApplyAmount)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Retained</span>
                <span className="font-mono font-semibold tabular-nums">
                  {fmtAed(closeDepositRetainedAmount)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Pending return</span>
                <span className="font-mono font-semibold tabular-nums">
                  {fmtAed(closeDepositReturnAmount)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Return due date</span>
                <span className="font-mono font-semibold tabular-nums">
                  {closeDepositReturnDueLabel}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Final outstanding after closing</span>
                <span className="font-mono font-semibold tabular-nums">
                  {fmtAed(closeFinalOutstanding)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Vehicle status after return</span>
                <span className="font-medium text-foreground">{closeVehicleStatus}</span>
              </div>
            </div>
          </div>

          {closeFinalOutstanding > 0 && (
            <div className="rounded-md border border-tint-amber-foreground/25 bg-tint-amber px-3 py-2 text-xs font-medium text-tint-amber-foreground">
              Contract will close with {fmtAed(closeFinalOutstanding)} still outstanding.
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseModal(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={isCloseConfirmDisabled} onClick={handleCloseContract}>
              {isClosing ? "Closing…" : "Confirm Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ReplaceVehicleModal
        contractId={contract.id}
        currentCarId={contract.car_id}
        contractStartDate={contract.start_date}
        isOpen={replaceVehicleOpen}
        onClose={() => setReplaceVehicleOpen(false)}
        onSuccess={() => {
          setReplaceVehicleOpen(false);
          fetchData();
        }}
      />
      <VehicleHistorySheet contractId={contract.id} open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </DashboardLayout>
  );
};

export default ContractDetail;
