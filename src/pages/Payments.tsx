import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreditCard, Plus, TrendingUp, TriangleAlert as AlertTriangle, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { ListPagination, getPaginatedRows } from "@/components/ListPagination";

interface PaymentRow {
  id: string;
  payment_date: string;
  amount: number;
  method: string;
  status: string;
  client_id: string;
  contract_id: string | null;
  clients: { full_name: string } | null;
  contracts: { id: string } | null;
}

interface ClientOption { id: string; full_name: string; }
interface ContractOption { id: string; client_id: string; }

const statusStyles: Record<string, string> = {
  Paid: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  Partial: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  Overdue: "bg-rose-500/15 text-rose-700 border-rose-500/30",
};

const formatAed = (n: number) =>
  new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 0 }).format(n);

export default function Payments() {
  const navigate = useNavigate();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [contractBalances, setContractBalances] = useState<Array<{ contract_id: string; balance_due: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [form, setForm] = useState({
    client_id: "",
    contract_id: "",
  });

  const fetchData = async () => {
    const [paymentsRes, clientsRes, contractsRes, balancesRes] = await Promise.all([
      supabase
        .from("payments")
        .select("*, clients(full_name), contracts(id)")
        .order("payment_date", { ascending: false }),
      supabase.from("clients").select("id, full_name").order("full_name"),
      supabase.from("contracts").select("id, client_id").order("created_at", { ascending: false }),
      (supabase as any).from("contract_balances").select("contract_id, balance_due"),
    ]);
    if (!paymentsRes.error) setPayments((paymentsRes.data as PaymentRow[]) || []);
    if (!clientsRes.error) setClients(clientsRes.data || []);
    if (!contractsRes.error) setContracts(contractsRes.data || []);
    if (balancesRes.error) {
      toast.error("Failed to load outstanding balances");
    } else {
      setContractBalances(
        (balancesRes.data || []).map((row: { contract_id: string; balance_due: number | string | null }) => ({
          contract_id: row.contract_id,
          balance_due: Number(row.balance_due || 0),
        })),
      );
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(payments.length / pageSize));
    if (page > totalPages) setPage(totalPages);
  }, [payments.length, page, pageSize]);

  const paginatedPayments = useMemo(
    () => getPaginatedRows(payments, page, pageSize),
    [payments, page, pageSize],
  );

  const clientContracts = useMemo(
    () => contracts.filter((c) => c.client_id === form.client_id),
    [contracts, form.client_id],
  );

  const summary = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const collectedThisMonth = payments
      .filter((p) => {
        const d = new Date(p.payment_date);
        return p.status === "Paid" && d.getMonth() === month && d.getFullYear() === year;
      })
      .reduce((s, p) => s + Number(p.amount), 0);
    const outstanding = contractBalances.reduce((sum, row) => sum + Math.max(0, Number(row.balance_due) || 0), 0);
    const balanceCount = contractBalances.filter((row) => Number(row.balance_due) > 0.009).length;
    return { collectedThisMonth, outstanding, balanceCount };
  }, [contractBalances, payments]);

  const handleOpenContractPayment = () => {
    if (!form.client_id || !form.contract_id) {
      toast.error("Select a client and contract.");
      return;
    }
    setOpen(false);
    navigate(`/contracts/${form.contract_id}`);
  };

  return (
    <DashboardLayout title="Payments" subtitle="Track collected revenue and outstanding balances.">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                Record Payment
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Record Payment</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4">
                <p className="text-sm text-muted-foreground">
                  Select the contract first. The payment is recorded inside the contract so it is allocated to the correct rent, fees, fines, Salik or Parking balance.
                </p>
                <div className="space-y-2">
                  <Label>Client</Label>
                  <Select
                    value={form.client_id}
                    onValueChange={(v) => setForm({ ...form, client_id: v, contract_id: "" })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Contract</Label>
                  <Select
                    value={form.contract_id}
                    onValueChange={(v) => setForm({ ...form, contract_id: v })}
                    disabled={!form.client_id}
                  >
                    <SelectTrigger><SelectValue placeholder="Select contract" /></SelectTrigger>
                    <SelectContent>
                      {clientContracts.map((c) => <SelectItem key={c.id} value={c.id}>{c.id.slice(0, 8)}...</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleOpenContractPayment} disabled={!form.contract_id}>Open Contract</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Collected This Month</CardTitle>
              <TrendingUp className="h-4 w-4 text-tint-green-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{formatAed(summary.collectedThisMonth)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding Total</CardTitle>
              <Wallet className="h-4 w-4 text-tint-amber-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{formatAed(summary.outstanding)}</div>
            </CardContent>
          </Card>
          <Card className={summary.balanceCount > 0 ? "border-rose-500/40 bg-rose-500/5" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Contracts With Balance</CardTitle>
              <AlertTriangle className={`h-4 w-4 ${summary.balanceCount > 0 ? "text-tint-rose-foreground" : "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{summary.balanceCount}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4" />
              All Payments
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      Loading payments...
                    </TableCell>
                  </TableRow>
                ) : payments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      No payments recorded yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedPayments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.payment_date}</TableCell>
                      <TableCell className="font-medium">{p.clients?.full_name ?? "—"}</TableCell>
                      <TableCell className="text-right font-medium">{formatAed(Number(p.amount))}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">{p.method}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusStyles[p.status] ?? ""}>{p.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <ListPagination
              page={page}
              pageSize={pageSize}
              total={payments.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
