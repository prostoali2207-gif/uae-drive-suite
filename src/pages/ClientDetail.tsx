import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
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

interface ClientRecord {
  id: string;
  full_name: string;
  phone: string;
  emirates_id: string;
  nationality: string;
  email: string | null;
  license_number: string;
  license_expiry: string | null;
  passport_number: string;
}

interface ContractRow {
  id: string;
  car_id: string;
  start_date: string;
  end_date: string;
  total_amount: number;
  payment_status: string;
  status: string;
  cars: { plate: string; make: string; model: string } | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const statusClasses: Record<string, string> = {
  Active: "bg-tint-blue text-tint-blue-foreground",
  "Expiring Soon": "bg-tint-amber text-tint-amber-foreground",
  Overdue: "bg-tint-rose text-tint-rose-foreground",
  Completed: "bg-muted text-muted-foreground",
};

const InfoRow = ({ label, value }: { label: string; value?: string | null }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-foreground">{value || "—"}</span>
  </div>
);

const ClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      const [clientRes, contractsRes] = await Promise.all([
        supabase.from("clients").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("contracts")
          .select("id, car_id, start_date, end_date, total_amount, payment_status, status, cars(plate, make, model)")
          .eq("client_id", id)
          .order("created_at", { ascending: false }),
      ]);
      if (clientRes.error) toast.error("Failed to load client");
      else setClient(clientRes.data);
      if (!contractsRes.error) setContracts((contractsRes.data as ContractRow[]) || []);
      setLoading(false);
    };
    fetchData();
  }, [id]);

  const totals = useMemo(() => {
    const totalBilled = contracts.reduce((s, c) => s + Number(c.total_amount), 0);
    const totalPaid = contracts
      .filter((c) => c.payment_status === "Paid")
      .reduce((s, c) => s + Number(c.total_amount), 0);
    const totalOutstanding = Math.max(0, totalBilled - totalPaid);
    return { totalBilled, totalPaid, totalOutstanding };
  }, [contracts]);

  if (loading) {
    return (
      <DashboardLayout title="Client">
        <div className="h-24 text-center text-sm text-muted-foreground pt-10">Loading...</div>
      </DashboardLayout>
    );
  }

  if (!client) {
    return (
      <DashboardLayout title="Client not found">
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">This client does not exist.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link to="/clients">Back to clients</Link>
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={client.full_name} subtitle="Client details">
      <div className="flex flex-col gap-5">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground">
            <Link to="/clients">
              <ArrowLeft className="h-4 w-4" />
              Back to clients
            </Link>
          </Button>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold text-foreground">Client Information</h2>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
            <InfoRow label="Full Name" value={client.full_name} />
            <InfoRow label="Phone" value={client.phone} />
            <InfoRow label="Email" value={client.email} />
            <InfoRow label="Nationality" value={client.nationality} />
            <InfoRow label="Emirates ID" value={client.emirates_id} />
            <InfoRow label="License Number" value={client.license_number} />
            <InfoRow label="License Expiry" value={formatDate(client.license_expiry)} />
            <InfoRow label="Passport Number" value={client.passport_number} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="text-xs text-muted-foreground">Total Billed</div>
            <div className="mt-1 text-xl font-semibold text-foreground">AED {totals.totalBilled.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="text-xs text-muted-foreground">Total Paid</div>
            <div className="mt-1 text-xl font-semibold text-tint-green-foreground">AED {totals.totalPaid.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="text-xs text-muted-foreground">Total Outstanding</div>
            <div className={cn(
              "mt-1 text-xl font-semibold",
              totals.totalOutstanding > 0 ? "text-tint-rose-foreground" : "text-foreground",
            )}>
              AED {totals.totalOutstanding.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">Contracts</h2>
            <span className="text-xs text-muted-foreground">{contracts.length} total</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-5 text-xs">Car</TableHead>
                <TableHead className="text-xs">Start</TableHead>
                <TableHead className="text-xs">End</TableHead>
                <TableHead className="text-xs">Total</TableHead>
                <TableHead className="text-xs">Payment</TableHead>
                <TableHead className="px-5 text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                    No contracts yet.
                  </TableCell>
                </TableRow>
              ) : (
                contracts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="px-5">
                      <div className="font-mono text-xs text-foreground">{c.cars?.plate ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{c.cars ? `${c.cars.make} ${c.cars.model}` : ""}</div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(c.start_date)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(c.end_date)}</TableCell>
                    <TableCell className="text-sm font-medium text-foreground">AED {Number(c.total_amount).toLocaleString()}</TableCell>
                    <TableCell>
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        c.payment_status === "Paid"
                          ? "bg-tint-green text-tint-green-foreground"
                          : c.payment_status === "Partial"
                          ? "bg-tint-amber text-tint-amber-foreground"
                          : "bg-tint-rose text-tint-rose-foreground",
                      )}>
                        {c.payment_status}
                      </span>
                    </TableCell>
                    <TableCell className="px-5">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        statusClasses[c.status] ?? "bg-muted text-muted-foreground",
                      )}>
                        {c.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ClientDetail;
