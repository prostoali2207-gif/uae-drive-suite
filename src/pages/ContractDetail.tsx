import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Save, X } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

const statusClasses: Record<string, string> = {
  Active: "bg-tint-blue text-tint-blue-foreground",
  "Expiring Soon": "bg-tint-amber text-tint-amber-foreground",
  Overdue: "bg-tint-rose text-tint-rose-foreground",
  Completed: "bg-muted text-muted-foreground",
  Cancelled: "bg-muted text-muted-foreground",
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

const InfoRow = ({ label, value }: { label: string; value?: string | null | number }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-foreground">{value || value === 0 ? value : "—"}</span>
  </div>
);

const SectionCard = ({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) => (
  <div className="rounded-xl border border-border bg-card">
    <div className="flex items-center justify-between border-b border-border px-5 py-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {action}
    </div>
    <div className="p-5">{children}</div>
  </div>
);

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

  const totals = useMemo(() => {
    const paid = payments
      .filter((p) => p.status === "Paid")
      .reduce((s, p) => s + Number(p.amount), 0);
    const total = Number(contract?.total_amount ?? 0);
    const outstanding = Math.max(0, total - paid);
    const finesTotal = fines.reduce((s, f) => s + Number(f.amount), 0);
    const salikTotal = salik.reduce((s, x) => s + Number(x.amount), 0);
    return { paid, total, outstanding, finesTotal, salikTotal };
  }, [payments, fines, salik, contract]);

  const days = useMemo(
    () => (contract ? diffDays(contract.start_date, contract.end_date) : 0),
    [contract],
  );

  const saveNotes = async () => {
    if (!contract) return;
    setSavingNotes(true);
    const { error } = await supabase
      .from("contracts")
      // notes column may not exist yet; cast to bypass type check
      .update({ notes: notesDraft } as never)
      .eq("id", contract.id);
    setSavingNotes(false);
    if (error) {
      toast.error("Failed to save notes. Notes column may not exist yet.");
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

  return (
    <DashboardLayout title={contractNumber} subtitle="Contract details">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground">
            <Link to="/contracts">
              <ArrowLeft className="h-4 w-4" />
              Back to contracts
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
                statusClasses[contract.status] ?? "bg-muted text-muted-foreground",
              )}
            >
              {contract.status}
            </span>
            <Button variant="outline" size="sm" className="gap-1.5" disabled>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <SectionCard title="Client">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <InfoRow label="Full Name" value={contract.clients?.full_name} />
              <InfoRow label="Phone" value={contract.clients?.phone} />
              <InfoRow label="Email" value={contract.clients?.email} />
              <InfoRow label="Nationality" value={contract.clients?.nationality} />
              <InfoRow
                label={contract.clients?.client_type === "Tourist" ? "Passport" : "Emirates ID"}
                value={
                  contract.clients?.client_type === "Tourist"
                    ? contract.clients?.passport_number
                    : contract.clients?.emirates_id
                }
              />
              <InfoRow label="Client Type" value={contract.clients?.client_type} />
            </div>
            {contract.client_id && (
              <div className="mt-4">
                <Button asChild variant="outline" size="sm">
                  <Link to={`/clients/${contract.client_id}`}>View client profile</Link>
                </Button>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Vehicle">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <InfoRow label="Plate" value={contract.cars?.plate} />
              <InfoRow label="Make / Model" value={contract.cars ? `${contract.cars.make} ${contract.cars.model}` : "—"} />
              <InfoRow label="Year" value={contract.cars?.year} />
              <InfoRow label="Initial Mileage" value={`${contract.initial_mileage.toLocaleString()} km`} />
              <InfoRow label="Fuel Level" value={contract.fuel_level} />
            </div>
          </SectionCard>

          <SectionCard title="Rental Period">
            <div className="grid grid-cols-3 gap-x-6 gap-y-4">
              <InfoRow label="Start Date" value={formatDate(contract.start_date)} />
              <InfoRow label="End Date" value={formatDate(contract.end_date)} />
              <InfoRow label="Total Days" value={days} />
            </div>
          </SectionCard>

          <SectionCard title="Financial Summary">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <InfoRow
                label={`${contract.rate_type} Rate`}
                value={`AED ${Number(contract.rate_amount).toLocaleString()}`}
              />
              <InfoRow
                label="Total Amount"
                value={`AED ${Number(contract.total_amount).toLocaleString()}`}
              />
              <InfoRow label="Paid" value={`AED ${totals.paid.toLocaleString()}`} />
              <InfoRow
                label="Deposit"
                value={`AED ${Number(contract.deposit_amount).toLocaleString()}`}
              />
            </div>
            <div
              className={cn(
                "mt-4 flex items-center justify-between rounded-lg border px-4 py-3",
                totals.outstanding > 0
                  ? "border-tint-rose bg-tint-rose"
                  : "border-border bg-muted/40",
              )}
            >
              <span className="text-xs font-medium text-muted-foreground">Outstanding Balance</span>
              <span
                className={cn(
                  "text-lg font-semibold",
                  totals.outstanding > 0 ? "text-tint-rose-foreground" : "text-foreground",
                )}
              >
                AED {totals.outstanding.toLocaleString()}
              </span>
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Documents">
          <p className="text-sm text-muted-foreground">No documents uploaded.</p>
        </SectionCard>

        <SectionCard
          title="Fines & Salik"
          action={
            <span className="text-xs text-muted-foreground">
              Total: AED {(totals.finesTotal + totals.salikTotal).toLocaleString()}
            </span>
          }
        >
          {fines.length === 0 && salik.length === 0 ? (
            <p className="text-sm text-muted-foreground">No fines or Salik charges linked to this contract.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Details</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fines.map((f) => (
                  <TableRow key={`fine-${f.id}`}>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(f.fine_date)}</TableCell>
                    <TableCell className="text-sm font-medium">Fine</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{f.fine_type} · {f.source}</TableCell>
                    <TableCell className="text-right text-sm font-medium">AED {Number(f.amount).toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{f.status}</TableCell>
                  </TableRow>
                ))}
                {salik.map((s) => (
                  <TableRow key={`salik-${s.id}`}>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(s.charge_date)}</TableCell>
                    <TableCell className="text-sm font-medium">Salik</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.trips} trips</TableCell>
                    <TableCell className="text-right text-sm font-medium">AED {Number(s.amount).toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>

        <SectionCard
          title="Payment History"
          action={<span className="text-xs text-muted-foreground">{payments.length} payments</span>}
        >
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded for this contract.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Method</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(p.payment_date)}</TableCell>
                    <TableCell className="text-sm">{p.method}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.status}</TableCell>
                    <TableCell className="text-right text-sm font-medium">AED {Number(p.amount).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>

        <SectionCard
          title="Notes"
          action={
            editingNotes ? (
              <div className="flex items-center gap-2">
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
              rows={4}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Add notes about this contract..."
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {contract.notes || "No notes yet. Click Edit to add some."}
            </p>
          )}
        </SectionCard>
      </div>
    </DashboardLayout>
  );
};

export default ContractDetail;
