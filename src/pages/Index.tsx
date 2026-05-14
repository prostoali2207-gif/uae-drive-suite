import { useEffect, useState } from "react";
import { FileText, Car, AlertTriangle, Wallet, CalendarClock } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StatCard } from "@/components/StatCard";
import { RevenueChart } from "@/components/RevenueChart";
import { RecentContracts } from "@/components/RecentContracts";
import ExpiringContracts from "@/components/ExpiringContracts";
import { supabase } from "@/integrations/supabase/client";

const formatAED = (n: number) => `AED ${n.toLocaleString("en-AE")}`;

interface Stats {
  activeContracts: number;
  availableCars: number;
  finesUnpaid: number;
  salikUnpaid: number;
  renewalsDue: number;
}

const Index = () => {
  const [stats, setStats] = useState<Stats>({
    activeContracts: 0,
    availableCars: 0,
    finesUnpaid: 0,
    salikUnpaid: 0,
    renewalsDue: 0,
  });

  useEffect(() => {
    const load = async () => {
      const today = new Date();
      const inAWeek = new Date();
      inAWeek.setDate(today.getDate() + 7);
      const todayStr = today.toISOString().slice(0, 10);
      const weekStr = inAWeek.toISOString().slice(0, 10);

      const [contractsRes, carsRes, finesRes, salikRes, renewalsRes] = await Promise.all([
        supabase.from("contracts").select("id", { count: "exact", head: true }).in("status", ["Active", "Expiring Soon"]),
        supabase.from("cars").select("id", { count: "exact", head: true }).eq("status", "Available"),
        supabase.from("fines").select("amount").eq("status", "Unpaid"),
        supabase.from("salik").select("amount").eq("status", "Unpaid"),
        supabase.from("contracts").select("id", { count: "exact", head: true }).eq("status", "Active").gte("end_date", todayStr).lte("end_date", weekStr),
      ]);

      setStats({
        activeContracts: contractsRes.count ?? 0,
        availableCars: carsRes.count ?? 0,
        finesUnpaid: (finesRes.data || []).reduce((s, f) => s + Number(f.amount), 0),
        salikUnpaid: (salikRes.data || []).reduce((s, r) => s + Number(r.amount), 0),
        renewalsDue: renewalsRes.count ?? 0,
      });
    };
    load();
  }, []);

  return (
    <DashboardLayout title="Dashboard" subtitle="Overview of your fleet operations">
      <div className="flex flex-col gap-6">
        <RevenueChart />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard label="Active Contracts" value={String(stats.activeContracts)} icon={FileText} tint="blue" />
          <StatCard label="Available Cars" value={String(stats.availableCars)} icon={Car} tint="green" />
          <StatCard
            label="Fines Unpaid"
            value={formatAED(stats.finesUnpaid)}
            icon={AlertTriangle}
            tint="rose"
            highlight={stats.finesUnpaid > 0 ? "rose" : undefined}
          />
          <StatCard label="Salik Unpaid" value={formatAED(stats.salikUnpaid)} icon={Wallet} tint="violet" />
          <StatCard
            label="Renewals Due This Week"
            value={String(stats.renewalsDue)}
            icon={CalendarClock}
            tint="amber"
            highlight={stats.renewalsDue > 0 ? "amber" : undefined}
          />
        </div>

        <ExpiringContracts />

        <RecentContracts />
      </div>
    </DashboardLayout>
  );
};

export default Index;
