import { useMemo, useState } from "react";
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
import { toast } from "@/hooks/use-toast";

type PaymentMethod = "Cash" | "Bank Transfer" | "Card";
type PaymentStatus = "Paid" | "Partial" | "Overdue";

interface Payment {
  id: string;
  date: string;
  client: string;
  contractNo: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
}

const initialPayments: Payment[] = [
  { id: "p1", date: "2025-04-12", client: "Ahmed Al Mansouri", contractNo: "C-1042", amount: 4500, method: "Bank Transfer", status: "Paid" },
  { id: "p2", date: "2025-04-08", client: "Sara Khan", contractNo: "C-1039", amount: 2200, method: "Card", status: "Partial" },
  { id: "p3", date: "2025-04-05", client: "Mohammed Hassan", contractNo: "C-1037", amount: 1800, method: "Cash", status: "Overdue" },
  { id: "p4", date: "2025-04-02", client: "Layla Ibrahim", contractNo: "C-1035", amount: 6000, method: "Bank Transfer", status: "Paid" },
  { id: "p5", date: "2025-03-28", client: "Omar Sultan", contractNo: "C-1031", amount: 3200, method: "Card", status: "Paid" },
  { id: "p6", date: "2025-03-22", client: "Fatima Noor", contractNo: "C-1028", amount: 1500, method: "Cash", status: "Overdue" },
];

const statusStyles: Record<PaymentStatus, string> = {
  Paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  Partial: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  Overdue: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
};

const formatAed = (n: number) =>
  new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 0 }).format(n);

export default function Payments() {
  const [payments, setPayments] = useState<Payment[]>(initialPayments);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Omit<Payment, "id">>({
    date: new Date().toISOString().slice(0, 10),
    client: "",
    contractNo: "",
    amount: 0,
    method: "Cash",
    status: "Paid",
  });

  const summary = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const collectedThisMonth = payments
      .filter((p) => {
        const d = new Date(p.date);
        return p.status === "Paid" && d.getMonth() === month && d.getFullYear() === year;
      })
      .reduce((s, p) => s + p.amount, 0);
    const outstanding = payments
      .filter((p) => p.status !== "Paid")
      .reduce((s, p) => s + p.amount, 0);
    const overdueCount = payments.filter((p) => p.status === "Overdue").length;
    return { collectedThisMonth, outstanding, overdueCount };
  }, [payments]);

  const handleSubmit = () => {
    if (!form.client || !form.contractNo || form.amount <= 0) {
      toast({ title: "Missing information", description: "Please fill in all fields.", variant: "destructive" });
      return;
    }
    const newPayment: Payment = { id: `p${Date.now()}`, ...form, amount: Number(form.amount) };
    setPayments((prev) => [newPayment, ...prev]);
    toast({ title: "Payment recorded", description: `${formatAed(newPayment.amount)} from ${newPayment.client}.` });
    setOpen(false);
    setForm({
      date: new Date().toISOString().slice(0, 10),
      client: "",
      contractNo: "",
      amount: 0,
      method: "Cash",
      status: "Paid",
    });
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
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
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
                  <Input
                    value={form.client}
                    onChange={(e) => setForm({ ...form, client: e.target.value })}
                    placeholder="Client name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contract #</Label>
                  <Input
                    value={form.contractNo}
                    onChange={(e) => setForm({ ...form, contractNo: e.target.value })}
                    placeholder="C-1042"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Payment Method</Label>
                    <Select
                      value={form.method}
                      onValueChange={(v: PaymentMethod) => setForm({ ...form, method: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
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
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
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
                <Button onClick={handleSubmit}>Save Payment</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Collected This Month</CardTitle>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{formatAed(summary.collectedThisMonth)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding Total</CardTitle>
              <Wallet className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{formatAed(summary.outstanding)}</div>
            </CardContent>
          </Card>
          <Card className={summary.overdueCount > 0 ? "border-rose-500/40 bg-rose-500/5" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Overdue Count</CardTitle>
              <AlertTriangle className={`h-4 w-4 ${summary.overdueCount > 0 ? "text-rose-500" : "text-muted-foreground"}`} />
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
                  <TableHead>Contract #</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.date}</TableCell>
                    <TableCell className="font-medium">{p.client}</TableCell>
                    <TableCell className="font-mono text-xs">{p.contractNo}</TableCell>
                    <TableCell className="text-right font-medium">{formatAed(p.amount)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">{p.method}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusStyles[p.status]}>{p.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {payments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      No payments recorded yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
