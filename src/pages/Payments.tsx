import { useEffect, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreditCard, Plus, TrendingUp, AlertTriangle, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

type PaymentMethod = "Cash" | "Bank Transfer" | "Card";
type PaymentStatus = "Paid" | "Partial" | "Overdue";

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
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    payment_date: new Date().toISOString().slice(0, 10),
    client_id: "",
    contract_id: "",
    amount: 0,
    method: "Cash" as PaymentMethod,
    status: "Paid" as PaymentStatus,
  });

  const fetchData = async () => {
    const [paymentsRes, clientsRes, contractsRes] = await Promise.all([
      supabase
        .from("payments")
        .select("*, clients(full_name), contracts(id)")
        .order("payment_date", { ascending: false }),
      supabase.from("clients").select("id, full_name").order("full_name"),
      supabase.from("contracts").select("id, client_id").order("created_at", { ascending: false }),
    ]);
    if (!paymentsRes.error) setPayments((paymentsRes.data as PaymentRow[]) || []);
    if (!clientsRes.error) setClients(clientsRes.data || []);
    if (!contractsRes.error) setContracts(contractsRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

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
    const outstanding = payments
      .filter((p) => p.status !== "Paid")
      .reduce((s, p) => s + Number(p.amount), 0);
    const overdueCount = payments.filter((p) => p.status === "Overdue").length;
    return { collectedThisMonth, outstanding, overdueCount };
  }, [payments]);

  const handleSubmit = async () => {
    if (!form.client_id || form.amount <= 0) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("payments").insert({
      payment_date: form.payment_date,
      client_id: form.client_id,
      contract_id: form.contract_id || null,
      amount: Number(form.amount),
      method: form.method,
      status: form.status,
    });
    setSaving(false);
    if (error) {
      toast.error("Failed to record payment: " + error.message);
    } else {
      toast.success("Payment recorded");
      setOpen(false);
      setForm({
        payment_date: new Date().toISOString().slice(0, 10),
        client_id: "",
        contract_id: "",
        amount: 0,
        method: "Cash",
        status: "Paid",
      });
      fetchData();
    }
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={form.payment_date}
                      onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Amount (AED)</Label>
                    <Input
                      type="number"
                      value={form.amount || ""}
                      onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                    />
                  </div>
                </div>
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
                  <Label>Contract <span className="text-muted-foreground">(optional)</span></Label>
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Payment Method</Label>
                    <Select
                      value={form.method}
                      onValueChange={(v: PaymentMethod) => setForm({ ...form, method: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                        <SelectItem value="Card">Card</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={form.status}
                      onValueChange={(v: PaymentStatus) => setForm({ ...form, status: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Paid">Paid</SelectItem>
                        <SelectItem value="Partial">Partial</SelectItem>
                        <SelectItem value="Overdue">Overdue</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving..." : "Save Payment"}</Button>
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
          <Card className={summary.overdueCount > 0 ? "border-rose-500/40 bg-rose-500/5" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Overdue Count</CardTitle>
              <AlertTriangle className={`h-4 w-4 ${summary.overdueCount > 0 ? "text-tint-rose-foreground" : "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{summary.overdueCount}</div>
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
                  payments.map((p) => (
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
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
