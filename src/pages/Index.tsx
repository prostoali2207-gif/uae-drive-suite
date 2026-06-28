import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  ChevronRight,
  CornerDownLeft,
  Navigation,
  Wallet,
  Wrench,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import ExpiringContracts from "@/components/ExpiringContracts";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

const formatAED = (n: number) => `AED ${n.toLocaleString("en-AE")}`;
type RenewalFilter = "today" | "tomorrow" | "week";
type CarsNotReadyReason = {
  label: "Insurance Expired" | "Insurance Soon" | "Mulkiya Expired" | "Mulkiya Soon";
  tone: "red" | "yellow";
};

interface CarsNotReadyRow {
  id: string;
  make: string;
  model: string;
  plate: string;
  reasons: CarsNotReadyReason[];
}

const renewalFilters: { value: RenewalFilter; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "week", label: "This Week" },
];

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
  maintenanceCount: number;
  unpaidBalanceTotal: number;
  unpaidBalanceContracts: number;
  revenueThisMonth: number;
}

const Index = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [renewalFilter, setRenewalFilter] = useState<RenewalFilter>("today");
  const [carsNotReady, setCarsNotReady] = useState<CarsNotReadyRow[]>([]);
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
    maintenanceCount: 0,
    unpaidBalanceTotal: 0,
    unpaidBalanceContracts: 0,
    revenueThisMonth: 0,
  });

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      const today = new Date();
      const inAWeek = new Date();
      inAWeek.setDate(today.getDate() + 7);
      const todayStr = today.toISOString().slice(0, 10);
      const weekStr = inAWeek.toISOString().slice(0, 10);
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(today.getDate() + 30);
      const thirtyDaysStr = thirtyDaysFromNow.toISOString().slice(0, 10);
      const monthStartStr = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(today.getDate() + 7);
      const sevenDaysStr = sevenDaysFromNow.toISOString().split("T")[0];
      const activeStatuses = ["Active", "Expiring Soon"];
      const { data: profileData } = await supabase
        .from("profiles")
        .select("deposit_return_days" as never)
        .eq("id", user.id)
        .single();

      const depositReturnDays = (profileData as { deposit_return_days?: number | null } | null)?.deposit_return_days ?? 15;
      const fifteenDaysAgo = new Date();
      fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - depositReturnDays);
      const cutoff = fifteenDaysAgo.toISOString().split("T")[0];

      const [
        contractsRes,
        carsRes,
        finesRes,
        salikRes,
        renewalsRes,
        totalCarsRes,
        returnsTodayRes,
        overdueReturnsRes,
        depositsReadyRes,
        maintenanceRes,
        revenueThisMonthRes,
        carsNotReadyRes,
      ] = await Promise.all([
        supabase.from("contracts").select("id", { count: "exact" }).in("status", activeStatuses),
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
        supabase
          .from("car_maintenance")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", user.id)
          .or(`next_service_date.lte.${sevenDaysStr},oil_change_date.lte.${sevenDaysStr}`)
          .or(`next_service_date.gte.${todayStr},oil_change_date.gte.${todayStr}`),
        supabase
          .from("payments")
          .select("amount")
          .eq("status", "Paid")
          .gte("payment_date", monthStartStr)
          .lte("payment_date", todayStr),
        supabase
          .from("cars")
          .select("id, make, model, plate, insurance_expiry, mulkiya_expiry")
          .or("insurance_expiry.not.is.null,mulkiya_expiry.not.is.null")
          .order("plate", { ascending: true }),
      ]);

      const activeContractIds = (contractsRes.data || []).map((contract) => contract.id);
      let unpaidBalanceTotal = 0;
      let unpaidBalanceContracts = 0;

      if (activeContractIds.length > 0) {
        const { data: balancesData } = await (supabase as any)
          .from("contract_balances")
          .select("contract_id, balance_due")
          .in("contract_id", activeContractIds);

        const positiveBalances = (balancesData || [])
          .map((balance: { contract_id: string; balance_due: number | string | null }) => Number(balance.balance_due || 0))
          .filter((balance: number) => balance > 0);

        unpaidBalanceTotal = positiveBalances.reduce((sum: number, balance: number) => sum + balance, 0);
        unpaidBalanceContracts = positiveBalances.length;
      }

      const carsNotReadyRows = (carsNotReadyRes.data || [])
        .map((car) => {
          const reasons: CarsNotReadyReason[] = [];

          if (car.insurance_expiry) {
            if (car.insurance_expiry < todayStr) {
              reasons.push({ label: "Insurance Expired", tone: "red" });
            } else if (car.insurance_expiry <= thirtyDaysStr) {
              reasons.push({ label: "Insurance Soon", tone: "yellow" });
            }
          }

          if (car.mulkiya_expiry) {
            if (car.mulkiya_expiry < todayStr) {
              reasons.push({ label: "Mulkiya Expired", tone: "red" });
            } else if (car.mulkiya_expiry <= thirtyDaysStr) {
              reasons.push({ label: "Mulkiya Soon", tone: "yellow" });
            }
          }

          return {
            id: car.id,
            make: car.make,
            model: car.model,
            plate: car.plate,
            reasons,
          };
        })
        .filter((car) => car.reasons.length > 0);

      setCarsNotReady(carsNotReadyRows);

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
        maintenanceCount: maintenanceRes.count ?? 0,
        unpaidBalanceTotal,
        unpaidBalanceContracts,
        revenueThisMonth: (revenueThisMonthRes.data || []).reduce((s, p) => s + Number(p.amount), 0),
      });
    };
    load();
  }, [user]);

  const taskCount = stats.returnsToday + stats.overdueReturns + (stats.maintenanceCount > 0 ? stats.maintenanceCount : 0);
  const todayWorkRows = [
    {
      label: "Returns Today",
      sublabel: "Active contracts ending today",
      value: stats.returnsToday.toLocaleString("en-AE"),
      icon: CornerDownLeft,
      color: "text-red-500 bg-red-500/10",
      to: "/contracts?filter=returns-today",
    },
    {
      label: "Overdue Returns",
      sublabel: "Active contracts past end date",
      value: stats.overdueReturns.toLocaleString("en-AE"),
      icon: AlertCircle,
      color: "text-red-500 bg-red-500/10",
      to: "/contracts?filter=overdue",
    },
    {
      label: "Fines Unpaid",
      sublabel: "Traffic fines to collect",
      value: formatAED(stats.finesUnpaid),
      icon: AlertTriangle,
      color: "text-amber-500 bg-amber-500/10",
      to: "/fines?type=fines&status=unpaid",
      amount: true,
    },
    {
      label: "Salik Unpaid",
      sublabel: "Toll charges to collect",
      value: formatAED(stats.salikUnpaid),
      icon: Navigation,
      color: "text-amber-500 bg-amber-500/10",
      to: "/fines?type=salik&status=unpaid",
      amount: true,
    },
    {
      label: "Unpaid Balances",
      sublabel: "Active customer balances to collect",
      value: `${formatAED(stats.unpaidBalanceTotal)} · ${stats.unpaidBalanceContracts.toLocaleString("en-AE")} contracts`,
      icon: Wallet,
      color: "text-amber-500 bg-amber-500/10",
      to: "/contracts?sort=balance_desc",
      amount: true,
    },
    {
      label: "Deposits Ready to Return",
      sublabel: "Closed contracts held 15+ days",
      value: stats.depositsReady.toLocaleString("en-AE"),
      icon: Banknote,
      color: "text-green-500 bg-green-500/10",
      to: "/contracts?filter=deposits-ready",
    },
    stats.maintenanceCount > 0 ? {
      label: "Maintenance Due",
      sublabel: "Vehicles due for service or oil change within 7 days",
      value: stats.maintenanceCount.toLocaleString("en-AE"),
      icon: Wrench,
      color: "text-amber-500 bg-amber-500/10",
      to: "/fleet",
    } : null,
  ].filter(Boolean);

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
              <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                {taskCount.toLocaleString("en-AE")} tasks
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
              <div className="mb-3 flex gap-2">
                {renewalFilters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setRenewalFilter(filter.value)}
                    className={cn(
                      "min-h-10 rounded-md px-3 text-sm font-medium transition-colors",
                      renewalFilter === filter.value
                        ? "bg-white text-slate-950 shadow-sm"
                        : "bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <ExpiringContracts filter={renewalFilter} />
            </div>
          </div>
        </div>

        {carsNotReady.length > 0 && (
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Cars Not Ready <span className="font-mono tabular-nums">— {carsNotReady.length.toLocaleString("en-AE")}</span>
                </h3>
                <p className="text-xs text-muted-foreground">Vehicle documents expired or due within 30 days</p>
              </div>
            </div>
            <div className="divide-y divide-border">
              {carsNotReady.map((car) => (
                <button
                  key={car.id}
                  type="button"
                  onClick={() => navigate("/fleet")}
                  className="flex w-full flex-col gap-2 px-5 py-3 text-left transition-colors hover:bg-muted/50 sm:flex-row sm:items-center"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground">{car.plate}</span>
                    <span className="truncate text-sm text-muted-foreground">
                      {car.make} {car.model}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-2">
                    {car.reasons.map((reason) => (
                      <span
                        key={reason.label}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          reason.tone === "red"
                            ? "bg-red-500/10 text-red-600"
                            : "bg-yellow-500/15 text-yellow-700",
                        )}
                      >
                        {reason.label}
                      </span>
                    ))}
                  </span>
                  <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-border bg-card px-5 py-3 text-sm text-muted-foreground">
          Active contracts <span className="font-medium text-foreground">{stats.activeContracts.toLocaleString("en-AE")}</span>
          <span className="mx-2 text-border">·</span>
          Available cars <span className="font-medium text-foreground">{stats.availableCars.toLocaleString("en-AE")}/{stats.totalCars.toLocaleString("en-AE")}</span>
          <span className="mx-2 text-border">·</span>
          Revenue this month <span className="font-mono font-medium tabular-nums text-foreground">{formatAED(stats.revenueThisMonth)}</span>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Index;
