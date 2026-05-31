import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
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
  MoreHorizontal,
  History,
  Trash2,
  Lock,
  Tag,
} from "lucide-react";
import { RecordPaymentModal } from "@/components/RecordPaymentModal";
import { ReplaceVehicleModal } from "@/components/ReplaceVehicleModal";
import { VehicleHistorySheet } from "@/components/VehicleHistorySheet";
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
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface ContractRecord {
  id: string;
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
}

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

function toDateTimeInput(date: string, time: string | null | undefined): string {
  if (!date) return "";
  return `${date.slice(0, 10)}T${formatTimeDisplay(time)}`;
}

function parseDateTime(date: string, time: string | null | undefined): Date {
  return new Date(toDateTimeInput(date, time));
}

function formatDateTime(date: string, time: string | null | undefined): string {
  return `${formatDate(date)} · ${formatTimeDisplay(time)}`;
}

function describeDuration(hours: number): string {
  const safeHours = Math.max(0, Math.ceil(hours));
  const days = Math.floor(safeHours / 24);
  const remainingHours = safeHours % 24;
  if (days && remainingHours) return `${days} days ${remainingHours} hours`;
  if (days) return `${days} days`;
  return `${remainingHours} hours`;
}

function calculateRentalTotal(rateType: string, rateAmount: number, totalHours: number): number {
  const hours = Math.max(0, totalHours);
  const hourlyRate =
    rateType === "Monthly"
      ? rateAmount / (30 * 24)
      : rateType === "Yearly"
        ? rateAmount / (365 * 24)
        : rateAmount / 24;
  return Math.round(hourlyRate * hours * 100) / 100;
}

const fmtAed = (n: number) => `AED ${Number(n).toLocaleString()}`;

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
  <section className={cn("rounded-lg border border-border bg-card", className)}>
    <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">{title}</h3>
      </div>
      {action}
    </header>
    <div className="px-4 py-3">{children}</div>
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
  fines: FineRow[];
  salik: SalikRow[];
  contractFees: ContractFeeRow[];
  totals: { charges: number; credits: number; outstanding: number };
  onUpdateFineNote: (id: string, note: string) => void;
  onUpdateSalikNote: (id: string, note: string) => void;
};

const FinancialsAccordion = ({
  contract,
  days,
  fines,
  salik,
  contractFees,
  totals,
  onUpdateFineNote,
  onUpdateSalikNote,
}: FinancialsAccordionProps) => {
  const rentalTotal = Number(contract.total_amount);
  const finesTotal = fines.reduce((s, f) => s + Number(f.amount), 0);
  const salikTotal = salik.reduce((s, x) => s + Number(x.amount), 0);
  const otherFees = contractFees;
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
      <AccordionRow label="Rental" count={1} total={rentalTotal} accent="blue">
        <EntryRow>
          <div className="flex flex-1 min-w-0 flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground">
              {formatDate(contract.start_date)} – {formatDate(contract.end_date)} · {days} days
            </span>
            <span className="text-xs text-foreground/80">
              {contract.rate_type} @ {fmtAed(contract.rate_amount)}
            </span>
          </div>
          <StatusPill status={contract.status} />
          <span className="w-24 text-right text-sm font-bold tabular-nums text-foreground">
            {fmtAed(rentalTotal)}
          </span>
        </EntryRow>
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
            onClick={() => { setFinePage(0); setShowFinesModal(true); }}
            className="text-[11px] font-medium text-tint-blue-foreground hover:underline"
          >
            View All →
          </button>
        </div>
      </div>

      <Dialog open={showFinesModal} onOpenChange={setShowFinesModal}>
        <DialogContent className="flex max-h-[85vh] w-full max-w-4xl flex-col gap-0 p-0">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle className="text-sm font-semibold">Traffic Fines</DialogTitle>
            <DialogDescription className="text-xs">
              {fines.length} records · Total {fmtAed(finesTotal)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {fines.length === 0 ? (
              <div className="px-6 py-10 text-center text-xs text-muted-foreground">No fines.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 px-4 text-[11px]">Date</TableHead>
                    <TableHead className="h-9 px-4 text-[11px]">Fine No.</TableHead>
                    <TableHead className="h-9 px-4 text-[11px]">Type</TableHead>
                    <TableHead className="h-9 px-4 text-[11px]">Source</TableHead>
                    <TableHead className="h-9 px-4 text-[11px] text-right">Amount</TableHead>
                    <TableHead className="h-9 px-4 text-[11px]">Status</TableHead>
                    <TableHead className="h-9 w-8 px-2" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {finesPageItems.map((f) => (
                    <Fragment key={f.id}>
                      <TableRow className={cn(f.status === "Paid" && "opacity-50")}>
                        <TableCell className="px-4 py-2 text-[11px] tabular-nums text-muted-foreground whitespace-nowrap">
                          {formatDate(f.fine_date)}
                        </TableCell>
                        <TableCell className="px-4 py-2 font-mono text-xs">
                          {f.fine_number ?? "—"}
                        </TableCell>
                        <TableCell className="px-4 py-2 text-xs">
                          <div>{f.fine_type}</div>
                          {f.notes && (
                            <div className="mt-0.5 max-w-[180px] truncate text-[10px] text-muted-foreground">
                              {f.notes}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-2 text-xs">{f.source}</TableCell>
                        <TableCell className="px-4 py-2 text-right font-mono text-xs font-bold text-tint-rose-foreground whitespace-nowrap">
                          {fmtAed(Number(f.amount))}
                        </TableCell>
                        <TableCell className="px-4 py-2">
                          <StatusPill status={f.status} />
                        </TableCell>
                        <TableCell className="px-2 py-2 w-8">
                          <button
                            type="button"
                            onClick={(e) => openFineMenu(e, f.id)}
                            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </TableCell>
                      </TableRow>
                      {editingFineId === f.id && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={7} className="bg-muted/30 px-4 py-2">
                            <div className="flex items-start gap-2">
                              <textarea
                                autoFocus
                                rows={2}
                                placeholder="Add note..."
                                value={fineNoteDraft}
                                onChange={(e) => setFineNoteDraft(e.target.value)}
                                className="flex-1 resize-none rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              />
                              <div className="flex flex-col gap-1">
                                <Button
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  disabled={savingFineNote}
                                  onClick={async () => {
                                    setSavingFineNote(true);
                                    const { error } = await supabase
                                      .from("fines")
                                      .update({ notes: fineNoteDraft } as never)
                                      .eq("id", f.id);
                                    setSavingFineNote(false);
                                    if (error) {
                                      toast.error("Failed to save note");
                                    } else {
                                      onUpdateFineNote(f.id, fineNoteDraft);
                                      setEditingFineId(null);
                                      toast.success("Note saved");
                                    }
                                  }}
                                >
                                  {savingFineNote ? "…" : "Save"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => setEditingFineId(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          {finesTotalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-6 py-3">
              <span className="text-[11px] text-muted-foreground">
                Page {finePage + 1} of {finesTotalPages} · {fines.length} total
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  disabled={finePage === 0}
                  onClick={() => setFinePage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  disabled={finePage >= finesTotalPages - 1}
                  onClick={() => setFinePage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
            onClick={() => { setSalikPage(0); setShowSalikModal(true); }}
            className="text-[11px] font-medium text-tint-blue-foreground hover:underline"
          >
            View All →
          </button>
        </div>
      </div>

      <Dialog open={showSalikModal} onOpenChange={setShowSalikModal}>
        <DialogContent className="flex max-h-[85vh] w-full max-w-4xl flex-col gap-0 p-0">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle className="text-sm font-semibold">Salik Charges</DialogTitle>
            <DialogDescription className="text-xs">
              {salik.length} records · Total {fmtAed(salikTotal)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {salik.length === 0 ? (
              <div className="px-6 py-10 text-center text-xs text-muted-foreground">No Salik charges.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 px-4 text-[11px]">Date</TableHead>
                    <TableHead className="h-9 px-4 text-[11px]">Transaction ID</TableHead>
                    <TableHead className="h-9 px-4 text-[11px]">Toll Gate</TableHead>
                    <TableHead className="h-9 px-4 text-[11px]">Direction</TableHead>
                    <TableHead className="h-9 px-4 text-[11px] text-right">Trips</TableHead>
                    <TableHead className="h-9 px-4 text-[11px] text-right">Amount</TableHead>
                    <TableHead className="h-9 w-8 px-2" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salikPageItems.map((s) => (
                    <Fragment key={s.id}>
                      <TableRow className={cn(s.status === "Paid" && "opacity-50")}>
                        <TableCell className="px-4 py-2 text-[11px] tabular-nums text-muted-foreground whitespace-nowrap">
                          {formatDate(s.charge_date)}
                        </TableCell>
                        <TableCell className="px-4 py-2 font-mono text-xs">
                          <div>{s.transaction_id ?? "—"}</div>
                          {s.notes && (
                            <div className="mt-0.5 max-w-[180px] truncate text-[10px] text-muted-foreground">
                              {s.notes}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-2 text-xs">{s.toll_gate ?? "—"}</TableCell>
                        <TableCell className="px-4 py-2 text-xs">{s.direction ?? "—"}</TableCell>
                        <TableCell className="px-4 py-2 text-right font-mono text-xs tabular-nums">
                          {s.trips}
                        </TableCell>
                        <TableCell className="px-4 py-2 text-right font-mono text-xs font-bold tabular-nums whitespace-nowrap">
                          {fmtAed(Number(s.amount))}
                        </TableCell>
                        <TableCell className="px-2 py-2 w-8">
                          <button
                            type="button"
                            onClick={(e) => openSalikMenu(e, s.id)}
                            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </TableCell>
                      </TableRow>
                      {editingSalikId === s.id && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={7} className="bg-muted/30 px-4 py-2">
                            <div className="flex items-start gap-2">
                              <textarea
                                autoFocus
                                rows={2}
                                placeholder="Add note..."
                                value={salikNoteDraft}
                                onChange={(e) => setSalikNoteDraft(e.target.value)}
                                className="flex-1 resize-none rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              />
                              <div className="flex flex-col gap-1">
                                <Button
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  disabled={savingSalikNote}
                                  onClick={async () => {
                                    setSavingSalikNote(true);
                                    const { error } = await supabase
                                      .from("salik")
                                      .update({ notes: salikNoteDraft } as never)
                                      .eq("id", s.id);
                                    setSavingSalikNote(false);
                                    if (error) {
                                      toast.error("Failed to save note");
                                    } else {
                                      onUpdateSalikNote(s.id, salikNoteDraft);
                                      setEditingSalikId(null);
                                      toast.success("Note saved");
                                    }
                                  }}
                                >
                                  {savingSalikNote ? "…" : "Save"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => setEditingSalikId(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          {salikTotalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-6 py-3">
              <span className="text-[11px] text-muted-foreground">
                Page {salikPage + 1} of {salikTotalPages} · {salik.length} total
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  disabled={salikPage === 0}
                  onClick={() => setSalikPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  disabled={salikPage >= salikTotalPages - 1}
                  onClick={() => setSalikPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
          </EntryRow>
        ))}
      </AccordionRow>


    </div>

    </>
  );
};

const ContractDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [contract, setContract] = useState<ContractRecord | null>(null);
  const [fines, setFines] = useState<FineRow[]>([]);
  const [salik, setSalik] = useState<SalikRow[]>([]);
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
  const [closeVehicleStatus, setCloseVehicleStatus] = useState("Available");
  const [isClosing, setIsClosing] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendEndDateTime, setExtendEndDateTime] = useState("");
  const [extendError, setExtendError] = useState("");
  const [isExtending, setIsExtending] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editCarId, setEditCarId] = useState("");
  const [availableCars, setAvailableCars] = useState<AvailableCarRow[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [replaceVehicleOpen, setReplaceVehicleOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [replacementCount, setReplacementCount] = useState(0);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const navigate = useNavigate();

  const fetchContractFees = useCallback(async () => {
    if (!contract?.id) {
      setContractFees([]);
      return;
    }
    const { data, error } = await (supabase as any)
      .from("contract_fees")
      .select("id, category, label, amount")
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
      const [paymentsRes, finesRes, salikRes] = await Promise.all([
        supabase
          .from("payments")
          .select("id, payment_date, amount, method, status")
          .eq("contract_id", c.id)
          .order("payment_date", { ascending: false }),
        supabase
          .from("fines")
          .select("id, fine_date, fine_number, fine_type, amount, status, source, notes")
          .eq("contract_id", c.id)
          .order("fine_date", { ascending: false }),
        supabase
          .from("salik")
          .select("id, charge_date, transaction_id, toll_gate, direction, trips, amount, status, notes")
          .eq("contract_id", c.id)
          .order("charge_date", { ascending: false }),
      ]);
      if (!paymentsRes.error) setPayments(paymentsRes.data || []);
      if (!finesRes.error) setFines(finesRes.data || []);
      if (!salikRes.error) setSalik(salikRes.data || []);
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
    const charges = ledger.reduce((s, e) => s + e.debit, 0);
    const credits = ledger.reduce((s, e) => s + e.credit, 0);
    const deposit = Number(contract?.deposit_amount ?? 0);
    // Outstanding excludes the refundable deposit
    const outstanding = Math.max(0, charges - deposit - credits);
    return { charges, credits, outstanding };
  }, [ledger, contract]);

  const extensionPreview = useMemo(() => {
    if (!contract || !extendEndDateTime) {
      return { extraHours: 0, durationText: "0 hours", addedAmount: 0, newTotal: Number(contract?.total_amount ?? 0) };
    }

    const currentEnd = parseDateTime(contract.end_date, contract.end_time);
    const newEnd = new Date(extendEndDateTime);
    const extraHours = (newEnd.getTime() - currentEnd.getTime()) / 3_600_000;
    const addedAmount =
      extraHours > 0
        ? calculateRentalTotal(contract.rate_type, Number(contract.rate_amount), extraHours)
        : 0;

    return {
      extraHours,
      durationText: describeDuration(extraHours),
      addedAmount,
      newTotal: Math.round((Number(contract.total_amount) + addedAmount) * 100) / 100,
    };
  }, [contract, extendEndDateTime]);

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

  const openExtendModal = () => {
    if (!contract) return;
    setExtendEndDateTime(toDateTimeInput(contract.end_date, contract.end_time));
    setExtendError("");
    setShowExtendModal(true);
  };

  const handleExtendContract = async () => {
    if (!contract) return;
    setExtendError("");

    const currentEnd = parseDateTime(contract.end_date, contract.end_time);
    const newEnd = new Date(extendEndDateTime);
    if (!extendEndDateTime || Number.isNaN(newEnd.getTime()) || newEnd <= currentEnd) {
      setExtendError("New end date and time must be later than the current end.");
      return;
    }

    setIsExtending(true);
    const oldEndIso = currentEnd.toISOString();
    const newEndIso = newEnd.toISOString();
    const newEndDate = extendEndDateTime.slice(0, 10);
    const newEndTime = formatTimeForDb(extendEndDateTime.slice(11, 16));

    const { data: candidates, error: availabilityError } = await supabase
      .from("contracts")
      .select("id, start_date, start_time, end_date, end_time, status, clients(full_name)")
      .eq("car_id", contract.car_id)
      .neq("id", contract.id)
      .neq("status", "Cancelled")
      .lte("start_date", newEndDate)
      .gte("end_date", contract.end_date);

    if (availabilityError) {
      setIsExtending(false);
      setExtendError("Could not check vehicle availability. Try again.");
      return;
    }

    const overlap = ((candidates ?? []) as any[]).find((item) => {
      const candidateStart = parseDateTime(item.start_date, item.start_time).toISOString();
      const candidateEnd = parseDateTime(item.end_date, item.end_time).toISOString();
      return candidateStart < newEndIso && candidateEnd > oldEndIso;
    });

    if (overlap) {
      setIsExtending(false);
      const clientName = overlap.clients?.full_name ? ` for ${overlap.clients.full_name}` : "";
      setExtendError(`Vehicle is already booked${clientName} during the requested extension window.`);
      return;
    }

    const oldEndLabel = formatDateTime(contract.end_date, contract.end_time);
    const newEndLabel = formatDateTime(newEndDate, newEndTime);
    const timelineEntry = `Contract extended from ${oldEndLabel} to ${newEndLabel}. Added ${extensionPreview.durationText} (${fmtAed(extensionPreview.addedAmount)}).`;
    const nextNotes = contract.notes ? `${contract.notes}\n\n${timelineEntry}` : timelineEntry;

    const { error } = await supabase
      .from("contracts")
      .update({
        end_date: newEndDate,
        end_time: newEndTime,
        total_amount: extensionPreview.newTotal,
        notes: nextNotes,
      } as never)
      .eq("id", contract.id);

    setIsExtending(false);
    if (error) {
      toast.error("Failed to extend contract");
      return;
    }

    toast.success("Contract extended");
    setShowExtendModal(false);
    fetchData();
  };

  const handleCloseContract = async () => {
    if (!contract) return;
    setIsClosing(true);
    const [contractRes, vehicleRes] = await Promise.all([
      supabase
        .from("contracts")
        .update({ status: "Closed" } as never)
        .eq("id", contract.id),
      supabase
        .from("cars")
        .update({ status: closeVehicleStatus } as never)
        .eq("id", contract.car_id),
    ]);
    setIsClosing(false);
    if (contractRes.error || vehicleRes.error) {
      toast.error("Failed to close contract");
      return;
    }
    toast.success("Contract closed");
    navigate("/contracts");
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

  const handleOpenEditModal = async () => {
    if (!contract) return;
    setEditStartDate(contract.start_date);
    setEditEndDate(contract.end_date);
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
    const { error } = await supabase
      .from("contracts")
      .update({ start_date: editStartDate, end_date: editEndDate, car_id: editCarId } as never)
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
  const isOverdue = totals.outstanding > 0 && contract.status !== "Cancelled";
  const canExtendContract = ["active", "expiring soon", "overdue"].includes(contract.status.toLowerCase());
  const paymentAllocationDues = {
    rental: Number(contract.total_amount),
    fines: fines
      .filter((fine) => fine.status.toLowerCase() !== "paid")
      .reduce((sum, fine) => sum + Number(fine.amount), 0),
    salik: salik
      .filter((charge) => charge.status.toLowerCase() !== "paid")
      .reduce((sum, charge) => sum + Number(charge.amount), 0),
    fees: contractFees.reduce((sum, fee) => sum + Number(fee.amount), 0),
  };

  return (
    <DashboardLayout title={contractNumber} subtitle="Contract details">
      <div className="-mx-4 -my-6 md:-mx-8 md:-my-8">
        {/* Sticky header */}
        <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="sm" className="h-8 -ml-2 gap-1.5 text-muted-foreground">
                <Link to="/contracts">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Contracts
                </Link>
              </Button>
              <div className="h-5 w-px bg-border" />
              <div className="flex items-center gap-2.5">
                <h2 className="font-mono text-sm font-semibold tracking-tight text-foreground">
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

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" className="h-8 gap-1.5" disabled>
                  <Download className="h-3.5 w-3.5" />
                  Invoice
                </Button>
                {canExtendContract && (
                  <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={openExtendModal}>
                    <CalendarPlus className="h-3.5 w-3.5" />
                    Extend
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => {
                    const d = contract.end_date;
                    setCloseReturnDate(d.includes("T") ? d.slice(0, 16) : `${d}T00:00`);
                    setCloseReceivedBy("");
                    setCloseVehicleStatus("Available");
                    setShowCloseModal(true);
                  }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Close
                </Button>
                <Button size="sm" className="h-8 gap-1.5" onClick={handleOpenEditModal}>
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview" className="px-4 py-4 md:px-8">
          <TabsList className="h-9 bg-muted/60 p-0.5">
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
            <TabsTrigger value="timeline" className="h-8 gap-1.5 px-3 text-xs">
              <Clock className="h-3.5 w-3.5" />
              Timeline & Notes
            </TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="mt-4 space-y-3">
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
                    {fmtAed(totals.charges - Number(contract.deposit_amount))}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Paid
                  </div>
                  <div className="mt-0.5 text-base font-semibold tabular-nums text-tint-green-foreground">
                    {fmtAed(totals.credits)}
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
                    {fmtAed(totals.outstanding)}
                  </div>
                </div>
              </div>
            </Panel>
          </TabsContent>

          {/* FINANCIALS */}
          <TabsContent value="financials" className="mt-4 space-y-3">
            <div className="grid grid-cols-3 gap-2 mb-4">
              {/* Total charged card */}
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total charged
                </div>
                <div className="mt-0.5 font-mono text-base font-semibold tabular-nums text-foreground">
                  {fmtAed(totals.charges - Number(contract.deposit_amount))}
                </div>
              </div>

              {/* Paid card */}
              <div className="rounded-md border border-green-900/20 bg-green-950/10 p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Paid
                </div>
                <div className="mt-0.5 font-mono text-base font-semibold tabular-nums text-[#3B6D11]">
                  {fmtAed(totals.credits)}
                </div>
              </div>

              {/* Balance due card */}
              <div
                className={cn(
                  "rounded-md border p-3",
                  totals.outstanding > 0 ? "border-red-900/20 bg-red-950/10" : "border-border bg-muted/30",
                )}
              >
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Balance due
                </div>
                <div
                  className={cn(
                    "mt-0.5 font-mono text-base font-semibold tabular-nums",
                    totals.outstanding > 0 ? "text-[#A32D2D]" : "text-foreground",
                  )}
                >
                  {fmtAed(totals.outstanding)}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Receipt className="h-3.5 w-3.5" />
                <span>{ledger.length} ledger entries</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5"
                  onClick={() => setShowFeeModal(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Fee
                </Button>
                <Button size="sm" className="h-8 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setShowPaymentModal(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Add Payment
                </Button>
              </div>
            </div>

            <FinancialsAccordion
              contract={contract}
              days={days}
              fines={fines}
              salik={salik}
              contractFees={contractFees}
              totals={totals}
              onUpdateFineNote={(fineId, note) =>
                setFines((prev) =>
                  prev.map((f) => (f.id === fineId ? { ...f, notes: note } : f)),
                )
              }
              onUpdateSalikNote={(salikId, note) =>
                setSalik((prev) =>
                  prev.map((s) => (s.id === salikId ? { ...s, notes: note } : s)),
                )
              }
            />
            <div className="flex items-center justify-between rounded-md border border-border p-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Security deposit</span>
                    <span className="text-base font-semibold tabular-nums">{fmtAed(Number(contract.deposit_amount))}</span>
                    {((contract as any).deposit_collection_method || (contract as any).deposit_method || (contract as any).deposit_payment_method) && (
                      <span className="text-[10px] text-muted-foreground">
                        Collected via {(contract as any).deposit_collection_method || (contract as any).deposit_method || (contract as any).deposit_payment_method}
                      </span>
                    )}
                  </div>
                  {contract.status.toLowerCase() === "closed" && (
                    <span className="text-[10px] text-muted-foreground">
                      Refundable after 15 days from close date
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full",
                    ((contract as any).deposit_status ?? "Held").toLowerCase() === "refunded" &&
                      "bg-tint-green text-tint-green-foreground",
                    ((contract as any).deposit_status ?? "Held").toLowerCase() === "deducted" &&
                      "bg-tint-rose text-tint-rose-foreground",
                    !["refunded", "deducted"].includes(((contract as any).deposit_status ?? "Held").toLowerCase()) &&
                      "bg-muted text-muted-foreground",
                  )}
                >
                  {(contract as any).deposit_status ?? "Held"}
                </span>
              </div>
            </div>
            <RecordPaymentModal
              open={showPaymentModal}
              onClose={() => setShowPaymentModal(false)}
              onSuccess={fetchData}
              contractId={contract.id}
              balanceDue={totals.outstanding}
              clientId={contract.client_id}
              allocationDues={paymentAllocationDues}
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
          <TabsContent value="documents" className="mt-4">
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

          {/* TIMELINE & NOTES */}
          <TabsContent value="timeline" className="mt-4 grid gap-3 lg:grid-cols-2">
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
                      Outstanding balance: {fmtAed(totals.outstanding)}
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
                End Date
              </Label>
              <input
                type="date"
                value={editEndDate}
                onChange={(e) => setEditEndDate(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Vehicle
              </Label>
              <Select value={editCarId} onValueChange={setEditCarId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select vehicle" />
                </SelectTrigger>
                <SelectContent>
                  {availableCars.map((car) => (
                    <SelectItem key={car.id} value={car.id}>
                      {car.plate} · {car.year} {car.make} {car.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button disabled={isSavingEdit || !editStartDate || !editEndDate || !editCarId} onClick={handleSaveEdit}>
              {isSavingEdit ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCloseModal} onOpenChange={(v) => !v && setShowCloseModal(false)}>
        <DialogContent className="sm:max-w-[440px]">
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
                onChange={(e) => setCloseReturnDate(e.target.value)}
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseModal(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={isClosing} onClick={handleCloseContract}>
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
