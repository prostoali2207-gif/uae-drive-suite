import { useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface ContractRow {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  clients: { full_name: string } | null;
  cars: { plate: string } | null;
}

const statusClasses: Record<string, string> = {
  Active: "bg-tint-green text-tint-green-foreground",
  "Expiring Soon": "bg-tint-amber text-tint-amber-foreground",
  Overdue: "bg-tint-rose text-tint-rose-foreground",
  Completed: "bg-muted text-muted-foreground",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function getDisplayStatus(contract: ContractRow, todayStr: string): string {
  return contract.status === "Active" && contract.end_date < todayStr ? "Overdue" : contract.status;
}

export function RecentContracts() {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const todayStr = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    supabase
      .from("contracts")
      .select("id, start_date, end_date, status, clients(full_name), cars(plate)")
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (!error) setContracts((data as ContractRow[]) || []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Recent Contracts</h3>
          <p className="text-xs text-muted-foreground">Latest 5 rental agreements</p>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="px-5 text-xs">Client</TableHead>
            <TableHead className="text-xs">Plate</TableHead>
            <TableHead className="text-xs">Start</TableHead>
            <TableHead className="text-xs">End</TableHead>
            <TableHead className="px-5 text-right text-xs">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={5} className="h-20 text-center text-sm text-muted-foreground">Loading...</TableCell>
            </TableRow>
          ) : contracts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-20 text-center text-sm text-muted-foreground">No contracts yet.</TableCell>
            </TableRow>
          ) : (
            contracts.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="px-5 font-medium text-foreground">{c.clients?.full_name ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{c.cars?.plate ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(c.start_date)}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(c.end_date)}</TableCell>
                <TableCell className="px-5 text-right">
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", statusClasses[getDisplayStatus(c, todayStr)] ?? "bg-muted text-muted-foreground")}>
                    {getDisplayStatus(c, todayStr)}
                  </span>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
