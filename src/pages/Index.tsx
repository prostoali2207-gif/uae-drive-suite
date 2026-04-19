import { FileText, Car, AlertTriangle, Wallet, CalendarClock } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StatCard } from "@/components/StatCard";

const Index = () => {
  return (
    <DashboardLayout title="Dashboard" subtitle="Overview of your fleet operations">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Active Contracts" value="128" icon={FileText} tint="blue" />
        <StatCard label="Available Cars" value="42" icon={Car} tint="green" />
        <StatCard label="Fines Unpaid" value="AED 8,450" icon={AlertTriangle} tint="rose" />
        <StatCard label="Salik Balance" value="AED 1,275" icon={Wallet} tint="violet" />
        <StatCard label="Renewals Due This Week" value="9" icon={CalendarClock} tint="amber" />
      </div>
    </DashboardLayout>
  );
};

export default Index;
