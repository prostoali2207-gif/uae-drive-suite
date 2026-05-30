import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
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

interface NewClient {
  id: string;
  full_name: string;
  phone: string;
  nationality: string;
  created_at: string;
  client_type: string;
}

const Index = () => {
  const navigate = useNavigate();
  const [newClients, setNewClients] = useState<NewClient[]>([]);
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

  useEffect(() => {
    supabase
      .from("clients")
      .select("id, full_name, phone, nationality, created_at, client_type")
      .eq("is_new" as never, true)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (!error) setNewClients((data as NewClient[]) || []);
      });
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
            containerClassName="bg-[rgba(240,78,78,0.10)] border-[rgba(240,78,78,0.22)]"
            valueClassName="text-[#F04E4E]"
            labelClassName="text-[#F87171]"
          />
          <StatCard
            label="Salik Unpaid"
            value={formatAED(stats.salikUnpaid)}
            icon={Wallet}
            tint="violet"
            containerClassName="bg-[rgba(248,172,26,0.12)] border-[rgba(248,172,26,0.22)]"
            valueClassName="text-[#F8AC1A]"
            labelClassName="text-[#FCD34D]"
          />
          <StatCard
            label="Renewals Due This Week"
            value={String(stats.renewalsDue)}
            icon={CalendarClock}
            tint="amber"
            highlight={stats.renewalsDue > 0 ? "amber" : undefined}
          />
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              {newClients.length > 0 && (
                <span className="h-2 w-2 rounded-full bg-blue-600" />
              )}
              <h3 className="text-sm font-semibold text-foreground">New Registrations</h3>
            </div>
          </div>

          {newClients.length === 0 ? (
            <p className="px-5 py-6 text-sm text-fd-subtle">No new registrations</p>
          ) : (
            <div>
              {newClients.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => navigate(`/clients/${client.id}`)}
                  className="flex w-full items-center justify-between gap-4 border-b border-border px-5 py-3 text-left last:border-b-0 hover:bg-muted/50"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="font-medium text-foreground">{client.full_name}</span>
                    <span
                      className={
                        client.client_type === "Tourist"
                          ? "rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700"
                          : "rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700"
                      }
                    >
                      {client.client_type === "Tourist" ? "Tourist" : "Resident"}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span className="font-mono text-sm text-fd-subtle">{client.phone}</span>
                    <span className="text-sm text-fd-muted">
                      {formatDistanceToNow(new Date(client.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </button>
              ))}
              <div className="border-t border-border px-5 py-3">
                <button
                  type="button"
                  onClick={() => navigate("/clients")}
                  className="text-sm text-blue-500 hover:underline"
                >
                  View all new clients →
                </button>
              </div>
            </div>
          )}
        </div>

        <ExpiringContracts />

        <RecentContracts />
      </div>
    </DashboardLayout>
  );
};

export default Index;
