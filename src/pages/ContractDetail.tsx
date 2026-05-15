import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface ContractRecord {
  id: string;
  client_id: string;
  car_id: string;
  start_date: string;
  end_date: string;
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

interface FineRow {
  id: string;
  fine_date: string;
  fine_type: string;
  amount: number;
  status: string;
  source: string;
}

interface SalikRow {
  id: string;
  charge_date: string;
  trips: number;
  amount: number;
  status: string;
}

interface PaymentRow {
  id: string;
  payment_date: string;
  amount: number;
  method: string;
  status: string;
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

const fmtAed = (n: number) => `AED ${Number(n).toLocaleString()}`;

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

const EntryRow = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-3 border-b border-border/40 px-3 py-2.5 last:border-b-0">
    {children}
  </div>
);

type FinancialsAccordionProps = {
  contract: ContractRecord;
  days: number;
  fines: FineRow[];
  salik: SalikRow[];
  totals: { charges: number; credits: number; outstanding: number };
};

const FinancialsAccordion = ({
  contract,
  days,
  fines,
  salik,
  totals,
}: FinancialsAccordionProps) => {
  const rentalTotal = Number(contract.total_amount);
  const finesTotal = fines.reduce((s, f) => s + Number(f.amount), 0);
  const salikTotal = salik.reduce((s, x) => s + Number(x.amount), 0);
  const otherFees: {
    id: string;
    date: string;
    type: string;
    description: string;
    status: string;
    amount: number;
  }[] = [];
  const otherTotal = otherFees.reduce((s, o) => s + o.amount, 0);

  return (
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

      <AccordionRow
        label="Traffic Fines"
        count={fines.length}
        total={finesTotal}
        accent="red"
        totalClass="text-tint-rose-foreground"
      >
        {fines.map((f) => (
          <EntryRow key={f.id}>
            <span className="w-24 shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {formatDate(f.fine_date)}
            </span>
            <span className="flex-1 truncate text-xs text-foreground/90">
              {f.fine_type} · {f.source}
            </span>
            <StatusPill status={f.status} />
            <span className="w-24 text-right text-sm font-bold tabular-nums text-tint-rose-foreground">
              {fmtAed(Number(f.amount))}
            </span>
          </EntryRow>
        ))}
      </AccordionRow>

      <AccordionRow label="Salik" count={salik.length} total={salikTotal} accent="cyan">
        {salik.map((s) => (
          <EntryRow key={s.id}>
            <span className="w-24 shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {formatDate(s.charge_date)}
            </span>
            <span className="inline-flex items-center rounded-full bg-tint-blue px-2 py-0.5 text-[10px] font-medium text-tint-blue-foreground">
              {s.trips} trips
            </span>
            <span className="flex-1" />
            <StatusPill status={s.status} />
            <span className="w-24 text-right text-sm font-bold tabular-nums text-foreground">
              {fmtAed(Number(s.amount))}
            </span>
          </EntryRow>
        ))}
      </AccordionRow>

      <AccordionRow
        label="Other Fees"
        count={otherFees.length}
        total={otherTotal}
        accent="purple"
      >
        {otherFees.map((o) => {
          const typeColors: Record<string, string> = {
            Delivery: "bg-tint-blue text-tint-blue-foreground",
            Pickup: "bg-tint-blue text-tint-blue-foreground",
            Damage: "bg-tint-amber text-tint-amber-foreground",
          };
          return (
            <EntryRow key={o.id}>
              <span className="w-24 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {formatDate(o.date)}
              </span>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                  typeColors[o.type] ?? "bg-muted text-muted-foreground",
                )}
              >
                {o.type}
              </span>
              <span className="flex-1 truncate text-xs text-foreground/90">{o.description}</span>
              <StatusPill status={o.status} />
              <span className="w-24 text-right text-sm font-bold tabular-nums text-foreground">
                {fmtAed(o.amount)}
              </span>
            </EntryRow>
          );
        })}
      </AccordionRow>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Total charged card */}
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Total charged
          </div>
          <div className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
            {fmtAed(totals.charges - Number(contract.deposit_amount))}
          </div>
        </div>

        {/* Paid card */}
        <div className="rounded-md border border-tint-green-foreground/30 bg-[#EAF3DE] p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Paid
          </div>
          <div className="mt-0.5 text-base font-semibold tabular-nums text-[#3B6D11]">
            {fmtAed(totals.credits)}
          </div>
        </div>

        {/* Balance due card */}
        <div className="rounded-md border border-tint-rose-foreground/30 bg-[#FCEBEB] p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Balance due
          </div>
          <div className="mt-0.5 text-base font-semibold tabular-nums text-[#A32D2D]">
            {fmtAed(totals.outstanding)}
          </div>
        </div>
      </div>
    </div>
  );
};

const ContractDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [contract, setContract] = useState<ContractRecord | null>(null);
  const [fines, setFines] = useState<FineRow[]>([]);
  const [salik, setSalik] = useState<SalikRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
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
            .select("id, fine_date, fine_type, amount, status, source")
            .or(`car_id.eq.${c.car_id},client_id.eq.${c.client_id}`)
            .gte("fine_date", c.start_date)
            .lte("fine_date", c.end_date)
            .order("fine_date", { ascending: false }),
          supabase
            .from("salik")
            .select("id, charge_date, trips, amount, status")
            .or(`car_id.eq.${c.car_id},client_id.eq.${c.client_id}`)
            .gte("charge_date", c.start_date)
            .lte("charge_date", c.end_date)
            .order("charge_date", { ascending: false }),
        ]);
        if (!paymentsRes.error) setPayments(paymentsRes.data || []);
        if (!finesRes.error) setFines(finesRes.data || []);
        if (!salikRes.error) setSalik(salikRes.data || []);
      }
      setLoading(false);
    };
    fetchData();
  }, [id]);

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
              <div className="flex flex-col items-end leading-tight">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Outstanding Balance
                </span>
                <span
                  className={cn(
                    "text-xl font-bold tabular-nums tracking-tight",
                    isOverdue ? "text-tint-rose-foreground" : "text-foreground",
                  )}
                >
                  {fmtAed(totals.outstanding)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" className="h-8 gap-1.5" disabled>
                  <Download className="h-3.5 w-3.5" />
                  Invoice
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1.5" disabled>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Close
                </Button>
                <Button size="sm" className="h-8 gap-1.5" disabled>
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
              <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled>
                <CalendarPlus className="h-3.5 w-3.5" />
                Extend Rental
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled>
                <Pencil className="h-3.5 w-3.5" />
                Edit Details
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Receipt className="h-3.5 w-3.5" />
                <span>{ledger.length} ledger entries</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled>
                  <Plus className="h-3.5 w-3.5" />
                  Add Fee / Fine
                </Button>
                <Button size="sm" className="h-8 gap-1.5" disabled>
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
              totals={totals}
            />
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
      </div>
    </DashboardLayout>
  );
};

export default ContractDetail;
