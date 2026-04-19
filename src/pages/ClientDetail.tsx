import { useMemo } from "react";
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
import {
  initialClients,
  initialClientContracts,
  formatDate,
  type ClientContract,
} from "@/data/clients";

const statusClasses: Record<ClientContract["status"], string> = {
  Active: "bg-tint-blue text-tint-blue-foreground",
  "Expiring Soon": "bg-tint-amber text-tint-amber-foreground",
  Overdue: "bg-tint-rose text-tint-rose-foreground",
  Completed: "bg-muted text-muted-foreground",
};

const InfoRow = ({ label, value }: { label: string; value?: string }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-foreground">{value || "—"}</span>
  </div>
);

const ClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const client = initialClients.find((c) => c.id === id);
  const contracts = useMemo(
    () => initialClientContracts.filter((k) => k.clientId === id),
    [id],
  );

  const totals = useMemo(() => {
    const totalBilled = contracts.reduce((s, c) => s + c.totalAmount, 0);
    const totalPaid = contracts.reduce((s, c) => s + c.paidAmount, 0);
    const totalOutstanding = Math.max(0, totalBilled - totalPaid);
    return { totalBilled, totalPaid, totalOutstanding };
  }, [contracts]);

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
    <DashboardLayout title={client.name} subtitle="Client details">
      <div className="flex flex-col gap-5">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground">
            <Link to="/clients">
              <ArrowLeft className="h-4 w-4" />
              Back to clients
            </Link>
          </Button>
        </div>

        {/* Info card */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold text-foreground">Client Information</h2>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
            <InfoRow label="Full Name" value={client.name} />
            <InfoRow label="Phone" value={client.phone} />
            <InfoRow label="Email" value={client.email} />
            <InfoRow label="Nationality" value={client.nationality} />
            <InfoRow label="Emirates ID" value={client.emiratesId} />
            <InfoRow label="License Number" value={client.licenseNumber} />
            <InfoRow label="License Expiry" value={client.licenseExpiry ? formatDate(client.licenseExpiry) : ""} />
            <InfoRow label="Passport Number" value={client.passportNumber} />
          </div>
        </div>

        {/* Totals */}
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

        {/* Contracts */}
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">Contracts</h2>
            <span className="text-xs text-muted-foreground">{contracts.length} total</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-5 text-xs">Contract #</TableHead>
                <TableHead className="text-xs">Car</TableHead>
                <TableHead className="text-xs">Start</TableHead>
                <TableHead className="text-xs">End</TableHead>
                <TableHead className="text-xs">Total</TableHead>
                <TableHead className="text-xs">Paid</TableHead>
                <TableHead className="px-5 text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                    No contracts yet.
                  </TableCell>
                </TableRow>
              ) : (
                contracts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="px-5 font-mono text-xs text-foreground">{c.number}</TableCell>
                    <TableCell>
                      <div className="font-mono text-xs text-foreground">{c.carPlate}</div>
                      <div className="text-xs text-muted-foreground">{c.carModel}</div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(c.startDate)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(c.endDate)}</TableCell>
                    <TableCell className="text-sm font-medium text-foreground">AED {c.totalAmount.toLocaleString()}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">AED {c.paidAmount.toLocaleString()}</TableCell>
                    <TableCell className="px-5">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        statusClasses[c.status],
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
