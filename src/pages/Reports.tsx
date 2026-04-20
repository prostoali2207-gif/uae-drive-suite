import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { TrendingUp, Car, Users, AlertTriangle, FileWarning } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { supabase } from "@/lib/supabase";

interface Payment {
  amount: number;
  payment_date: string;
  status: string;
  client_id: string;
}
interface CarRow {
  id: string;
  status: string;
}
interface Contract {
  id: string;
  client_id: string;
  car_id: string;
  end_date: string;
  total_amount: number;
  status: string;
  payment_status: string;
}
interface ClientRow {
  id: string;
  full_name: string;
}
interface Fine {
  amount: number;
  status: string;
}

const formatAed = (n: number) =>
  new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 0,
  }).format(n);

const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;

const config = {
  revenue: { label: "Revenue (AED)", color: "hsl(var(--foreground))" },
} satisfies ChartConfig;

const Reports = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [cars, setCars] = useState<CarRow[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [fines, setFines] = useState<Fine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [p, c, k, cl, f] = await Promise.all([
        supabase.from("payments").select("amount, payment_date, status, client_id"),
        supabase.from("cars").select("id, status"),
        supabase
          .from("contracts")
          .select("id, client_id, car_id, end_date, total_amount, status, payment_status"),
        supabase.from("clients").select("id, full_name"),
        supabase.from("fines").select("amount, status"),
      ]);
      setPayments((p.data as Payment[]) || []);
      setCars((c.data as CarRow[]) || []);
      setContracts((k.data as Contract[]) || []);
      setClients((cl.data as ClientRow[]) || []);
      setFines((f.data as Fine[]) || []);
      setLoading(false);
    })();
  }, []);

  const revenue = useMemo(() => {
    const now = new Date();
    const thisMonth = monthKey(now);
    const lastMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const last3Cutoff = new Date(now.getFullYear(), now.getMonth() - 2, 1);

    let curr = 0;
    let prev = 0;
    let last3 = 0;
    const monthly: Record<string, { label: string; revenue: number; sort: number }> = {};

    // seed last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthly[monthKey(d)] = {
        label: d.toLocaleDateString("en-GB", { month: "short" }),
        revenue: 0,
        sort: d.getFullYear() * 12 + d.getMonth(),
      };
    }

    for (const p of payments) {
      if (p.status !== "Paid") continue;
      const d = new Date(p.payment_date);
      const key = monthKey(d);
      const amt = Number(p.amount);
      if (key === thisMonth) curr += amt;
      if (key === lastMonth) prev += amt;
      if (d >= last3Cutoff) last3 += amt;
      if (monthly[key]) monthly[key].revenue += amt;
    }

    const chart = Object.values(monthly).sort((a, b) => a.sort - b.sort);
    return { curr, prev, last3, chart };
  }, [payments]);

  const utilization = useMemo(() => {
    const total = cars.length;
    const rented = cars.filter((c) => c.status === "Rented").length;
    const available = cars.filter((c) => c.status === "Available").length;
    const service = cars.filter((c) => c.status === "Service").length;
    const pct = total > 0 ? Math.round((rented / total) * 100) : 0;
    return { total, rented, available, service, pct };
  }, [cars]);

  const topClients = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const p of payments) {
      if (p.status !== "Paid") continue;
      totals[p.client_id] = (totals[p.client_id] || 0) + Number(p.amount);
    }
    const nameById = Object.fromEntries(clients.map((c) => [c.id, c.full_name]));
    return Object.entries(totals)
      .map(([id, total]) => ({ id, name: nameById[id] || "Unknown", total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [payments, clients]);

  const overdueContracts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nameById = Object.fromEntries(clients.map((c) => [c.id, c.full_name]));
    return contracts
      .filter((c) => {
        const end = new Date(c.end_date);
        return (
          c.payment_status !== "Paid" ||
          (end < today && c.status !== "Completed")
        );
      })
      .map((c) => ({
        id: c.id,
        client: nameById[c.client_id] || "—",
        end_date: c.end_date,
        total: Number(c.total_amount),
        status: c.status,
        payment_status: c.payment_status,
      }))
      .sort((a, b) => a.end_date.localeCompare(b.end_date))
      .slice(0, 10);
  }, [contracts, clients]);

  const finesSummary = useMemo(() => {
    const unpaid = fines.filter((f) => f.status === "Unpaid");
    const charged = fines.filter((f) => f.status === "Charged to Client");
    return {
      unpaidTotal: unpaid.reduce((s, f) => s + Number(f.amount), 0),
      unpaidCount: unpaid.length,
      chargedTotal: charged.reduce((s, f) => s + Number(f.amount), 0),
      chargedCount: charged.length,
    };
  }, [fines]);

  const trendDelta =
    revenue.prev > 0
      ? Math.round(((revenue.curr - revenue.prev) / revenue.prev) * 100)
      : null;

  return (
    <DashboardLayout title="Reports" subtitle="Performance overview">
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading reports...</div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Revenue summary */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  This Month
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-tint-green-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{formatAed(revenue.curr)}</div>
                {trendDelta !== null && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {trendDelta >= 0 ? "+" : ""}
                    {trendDelta}% vs last month
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Last Month
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{formatAed(revenue.prev)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Last 3 Months
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{formatAed(revenue.last3)}</div>
              </CardContent>
            </Card>
          </div>

          {/* Revenue chart + utilization */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Revenue · Last 6 months</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={config} className="h-[240px] w-full">
                  <BarChart data={revenue.chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} className="text-xs" />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                      className="text-xs"
                    />
                    <ChartTooltip cursor={{ fill: "hsl(var(--muted))" }} content={<ChartTooltipContent hideLabel={false} />} />
                    <Bar dataKey="revenue" fill="hsl(var(--foreground))" radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base">Fleet Utilization</CardTitle>
                <Car className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div>
                  <div className="text-3xl font-semibold">{utilization.pct}%</div>
                  <div className="text-xs text-muted-foreground">
                    {utilization.rented} of {utilization.total} cars rented
                  </div>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-foreground transition-all"
                    style={{ width: `${utilization.pct}%` }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-tint-green/40 px-2 py-2">
                    <div className="text-sm font-semibold text-tint-green-foreground">{utilization.available}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Available</div>
                  </div>
                  <div className="rounded-md bg-tint-blue/40 px-2 py-2">
                    <div className="text-sm font-semibold text-tint-blue-foreground">{utilization.rented}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Rented</div>
                  </div>
                  <div className="rounded-md bg-tint-amber/40 px-2 py-2">
                    <div className="text-sm font-semibold text-tint-amber-foreground">{utilization.service}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Service</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top clients + Fines summary */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4" />
                  Top Clients by Payments
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-5">Client</TableHead>
                      <TableHead className="px-5 text-right">Total Paid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topClients.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="h-20 text-center text-sm text-muted-foreground">
                          No payments recorded yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      topClients.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="px-5 font-medium">{c.name}</TableCell>
                          <TableCell className="px-5 text-right font-medium">
                            {formatAed(c.total)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base">Fines Summary</CardTitle>
                <AlertTriangle className="h-4 w-4 text-tint-rose-foreground" />
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="rounded-lg bg-tint-rose/40 p-3">
                  <div className="text-xs text-muted-foreground">Unpaid</div>
                  <div className="text-xl font-semibold text-tint-rose-foreground">
                    {formatAed(finesSummary.unpaidTotal)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {finesSummary.unpaidCount} fine{finesSummary.unpaidCount === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="rounded-lg bg-tint-amber/40 p-3">
                  <div className="text-xs text-muted-foreground">Charged to Clients</div>
                  <div className="text-xl font-semibold text-tint-amber-foreground">
                    {formatAed(finesSummary.chargedTotal)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {finesSummary.chargedCount} fine{finesSummary.chargedCount === 1 ? "" : "s"}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Overdue contracts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileWarning className="h-4 w-4" />
                Overdue Contracts
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-5">Client</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="px-5 text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overdueContracts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-20 text-center text-sm text-muted-foreground">
                        No overdue contracts. 🎉
                      </TableCell>
                    </TableRow>
                  ) : (
                    overdueContracts.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="px-5 font-medium">{c.client}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.end_date}</TableCell>
                        <TableCell className="text-sm">{c.status}</TableCell>
                        <TableCell className="text-sm text-tint-rose-foreground">{c.payment_status}</TableCell>
                        <TableCell className="px-5 text-right font-medium">{formatAed(c.total)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
};

export default Reports;
