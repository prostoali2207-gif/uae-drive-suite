import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Status = "Active" | "Expiring" | "Overdue";

interface Contract {
  id: string;
  client: string;
  plate: string;
  start: string;
  end: string;
  status: Status;
}

const contracts: Contract[] = [
  { id: "1", client: "Ahmed Al Mansoori", plate: "DXB A 12345", start: "12 Mar 2026", end: "12 May 2026", status: "Active" },
  { id: "2", client: "Sara Hassan", plate: "DXB F 87231", start: "02 Feb 2026", end: "22 Apr 2026", status: "Expiring" },
  { id: "3", client: "Mohammed Khan", plate: "AUH B 44120", start: "18 Jan 2026", end: "18 Apr 2026", status: "Overdue" },
  { id: "4", client: "Layla Ibrahim", plate: "DXB N 55891", start: "05 Apr 2026", end: "05 Jul 2026", status: "Active" },
  { id: "5", client: "Omar Saeed", plate: "SHJ 1 22019", start: "20 Mar 2026", end: "23 Apr 2026", status: "Expiring" },
];

const statusClasses: Record<Status, string> = {
  Active: "bg-tint-green text-tint-green-foreground",
  Expiring: "bg-tint-amber text-tint-amber-foreground",
  Overdue: "bg-tint-rose text-tint-rose-foreground",
};

export function RecentContracts() {
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
          {contracts.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="px-5 font-medium text-foreground">{c.client}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{c.plate}</TableCell>
              <TableCell className="text-muted-foreground">{c.start}</TableCell>
              <TableCell className="text-muted-foreground">{c.end}</TableCell>
              <TableCell className="px-5 text-right">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                    statusClasses[c.status],
                  )}
                >
                  {c.status}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
