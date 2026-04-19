import { FileText, Car, AlertTriangle, Wallet, CalendarClock } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StatCard } from "@/components/StatCard";
import { RevenueChart } from "@/components/RevenueChart";
import { RecentContracts } from "@/components/RecentContracts";

const finesUnpaid = 8450;
const renewalsDue = 9;

const formatAED = (n: number) => `AED ${n.toLocaleString("en-AE")}`;

const Index = () => {
  return (
    <DashboardLayout title="Dashboard" subtitle="Overview of your fleet operations">
      <div className="flex flex-col gap-6">
        <RevenueChart />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard label="Active Contracts" value="128" icon={FileText} tint="blue" />
          <StatCard label="Available Cars" value="42" icon={Car} tint="green" />
          <StatCard
            label="Fines Unpaid"
            value={formatAED(finesUnpaid)}
            icon={AlertTriangle}
            tint="rose"
            highlight={finesUnpaid > 0 ? "rose" : undefined}
          />
          <StatCard label="Salik Balance" value={formatAED(1275)} icon={Wallet} tint="violet" />
          <StatCard
            label="Renewals Due This Week"
            value={String(renewalsDue)}
            icon={CalendarClock}
            tint="amber"
            highlight={renewalsDue > 0 ? "amber" : undefined}
          />
        </div>

        <RecentContracts />
      </div>
    </DashboardLayout>
  );
};

export default Index;
