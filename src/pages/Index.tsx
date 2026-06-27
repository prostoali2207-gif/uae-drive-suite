import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  Car,
  ChevronRight,
  CornerDownLeft,
  FileText,
  Navigation,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StatCard } from "@/components/StatCard";
import { RevenueChart } from "@/components/RevenueChart";
import { RecentContracts } from "@/components/RecentContracts";
import ExpiringContracts from "@/components/ExpiringContracts";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const formatAED = (n: number) => `AED ${n.toLocaleString("en-AE")}`;

interface Stats {
  activeContracts: number;
  availableCars: number;
  totalCars: number;
  finesUnpaid: number;
  salikUnpaid: number;
  renewalsDue: number;
  returnsToday: number;
  overdueReturns: number;
  depositsReady: number;
}

const Index = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({
    activeContracts: 0,
    availableCars: 0,
    totalCars: 0,
    finesUnpaid: 0,
    salikUnpaid: 0,
    renewalsDue: 0,
    returnsToday: 0,
    overdueReturns: 0,
    depositsReady: 0,
  });

  useEffect(() => {
    const load = async () => {
      const today = new Date();
      const inAWeek = new Date();
      inAWeek.setDate(today.getDate() + 7);
      const todayStr = today.toISOString().slice(0, 10);
      const weekStr = inAWeek.toISOString().slice(0, 10);
      const fifteenDaysAgo = new Date();
      fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
      const cutoff = fifteenDaysAgo.toISOString().split("T")[0];

      const [contractsRes, carsRes, finesRes, salikRes, renewalsRes, totalCarsRes, returnsTodayRes, overdueReturnsRes, depositsReadyRes] = await Promise.all([
        supabase.from("contracts").select("id", { count: "exact", head: true }).in("status", ["Active", "Expiring Soon"]),
        supabase.from("cars").select("id", { count: "exact", head: true }).eq("status", "Available"),
        supabase.from("fines").select("amount").eq("status", "Unpaid"),
        supabase.from("salik").select("amount").eq("status", "Unpaid"),
        supabase.from("contracts").select("id", { count: "exact", head: true }).eq("status", "Active").gte("end_date", todayStr).lte("end_date", weekStr),
        supabase.from("cars").select("id", { count: "exact", head: true }),
        supabase.from("contracts").select("id", { count: "exact", head: true }).eq("status", "Active").eq("end_date", todayStr),
        supabase.from("contracts").select("id", { count: "exact", head: true }).eq("status", "Active").lt("end_date", todayStr),
        supabase
          .from("contracts")
          .select("id", { count: "exact", head: true })
          .eq("status", "Closed")
          .is("deposit_returned" as never, null)
          .gt("deposit_amount", 0)
          .lte("end_date", cutoff),
      ]);

      setStats({
        activeContracts: contractsRes.count ?? 0,
        availableCars: carsRes.count ?? 0,
        totalCars: totalCarsRes.count ?? 0,
        finesUnpaid: (finesRes.data || []).reduce((s, f) => s + Number(f.amount), 0),
        salikUnpaid: (salikRes.data || []).reduce((s, r) => s + Number(r.amount), 0),
        renewalsDue: renewalsRes.count ?? 0,
        returnsToday: returnsTodayRes.count ?? 0,
        overdueReturns: overdueReturnsRes.count ?? 0,
        depositsReady: depositsReadyRes.count ?? 0,
      });
    };
    load();
  }, []);

  const urgentWorkCount = stats.returnsToday + stats.overdueReturns;
  const todayWorkRows = [
    {
      label: "Returns Today",
      sublabel: "Active contracts ending today",
      value: stats.returnsToday.toLocaleString("en-AE"),
      icon: CornerDownLeft,
      color: "text-red-500 bg-red-500/10",
      to: "/contracts",
    },
    {
      label: "Overdue Returns",
      sublabel: "Active contracts past end date",
      value: stats.overdueReturns.toLocaleString("en-AE"),
      icon: AlertCircle,
      color: "text-red-500 bg-red-500/10",
      to: "/contracts",
    },
    {
      label: "Fines Unpaid",
      sublabel: "Traffic fines to collect",
      value: formatAED(stats.finesUnpaid),
      icon: AlertTriangle,
      color: "text-amber-500 bg-amber-500/10",
      to: "/fines",
      amount: true,
    },
    {
      label: "Salik Unpaid",
      sublabel: "Toll charges to collect",
      value: formatAED(stats.salikUnpaid),
      icon: Navigation,
      color: "text-amber-500 bg-amber-500/10",
      to: "/fines",
      amount: true,
    },
    {
      label: "Deposits Ready to Return",
      sublabel: "Closed contracts held 15+ days",
      value: stats.depositsReady.toLocaleString("en-AE"),
      icon: Banknote,
      color: "text-green-500 bg-green-500/10",
      to: "/contracts",
    },
    {
      label: "Cars Available",
      sublabel: "Ready fleet inventory",
      value: stats.availableCars.toLocaleString("en-AE"),
      icon: Car,
      color: "text-muted-foreground bg-muted",
      to: "/fleet",
    },
  ];

  return (
    <DashboardLayout title="Dashboard" subtitle="Overview of your fleet operations">
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Today's Work</h3>
                <p className="text-xs text-muted-foreground">Priority operations for returns and collections</p>
              </div>
              <span className="shrink-0 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-500">
                {urgentWorkCount.toLocaleString("en-AE")} urgent
              </span>
            </div>
            <div className="divide-y divide-border">
              {todayWorkRows.map((row) => {
                const Icon = row.icon;
                return (
                  <button
                    key={row.label}
                    type="button"
                    onClick={() => navigate(row.to)}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", row.color)}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{row.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{row.sublabel}</span>
                    </span>
                    <span className={cn("shrink-0 text-right text-sm font-semibold text-foreground", row.amount && "font-mono tabular-nums")}>
                      {row.value}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-sm font-semibold text-foreground">Renewals Due</h3>
              <p className="text-xs text-muted-foreground">Contracts ending soon</p>
            </div>
            <div className="p-4">
              <ExpiringContracts />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard label="Active Contracts" value={String(stats.activeContracts)} icon={FileText} tint="blue" />
          <StatCard
            label="Fleet Available"
            value={`${stats.availableCars.toLocaleString("en-AE")} of ${stats.totalCars.toLocaleString("en-AE")} total`}
            icon={Car}
            tint="green"
            valueClassName="font-mono tabular-nums"
          />
        </div>

        <RevenueChart />

        <RecentContracts />
      </div>
    </DashboardLayout>
  );
};

export default Index;
