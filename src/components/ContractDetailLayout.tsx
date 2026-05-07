import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, LayoutGrid, FileText, Clock, Wallet, Download, Pencil, MoreHorizontal, Calendar, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface ContractDetailLayoutProps {
  contractId: string;
  contractStatus: string;
  financialsCount: number;
  children: ReactNode;
}

const NAV_ITEMS = [
  { name: "Dashboard", href: "/" },
  { name: "Fleet", href: "/fleet" },
  { name: "Contracts", href: "/contracts", active: true },
  { name: "Clients", href: "/clients" },
  { name: "Fines & Salik", href: "/fines" },
  { name: "Payments", href: "/payments" },
  { name: "Reports", href: "/reports" },
  { name: "Settings", href: "/settings" },
];

const statusBadgeClass = (status: string) => {
  switch (status) {
    case "Active":
      return "bg-tint-blue text-tint-blue-foreground border-tint-blue-foreground/20";
    case "Expiring Soon":
      return "bg-tint-amber text-tint-amber-foreground border-tint-amber-foreground/20";
    case "Overdue":
      return "bg-tint-rose text-tint-rose-foreground border-tint-rose-foreground/20";
    case "Completed":
      return "bg-tint-green text-tint-green-foreground border-tint-green-foreground/20";
    case "Cancelled":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
};

export function ContractDetailLayout({
  contractId,
  contractStatus,
  financialsCount,
  children,
}: ContractDetailLayoutProps) {
  return (
    <div className="flex min-h-screen bg-[#0f1117] text-[#e8edf5]">
      {/* Left Sidebar Nav */}
      <aside className="fixed top-0 left-0 h-screen w-[220px] border-r border-[#252d3d] bg-[#161b27] flex flex-col">
        <div className="flex items-center gap-2 border-b border-[#252d3d] px-4 py-3">
          <LayoutGrid className="h-5 w-5 text-[#3b82f6]" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">FleetDesk</h1>
            <p className="text-[10px] uppercase tracking-wider text-[#6b7a99] font-medium">UAE Rentals</p>
          </div>
        </div>
        <nav className="flex-1 py-4 px-2 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-[#1c2333]",
                item.active ? "bg-[#1c2333] text-[#e8edf5]" : "text-[#6b7a99]"
              )}
            >
              {item.name}
            </Link>
          ))}
        </nav>
        <div className="border-t border-[#252d3d] p-4 text-xs text-[#6b7a99] font-mono">
          muzafirvat@gmail.com
        </div>
      </aside>

      <div className="flex flex-1 flex-col ml-[220px]">
        {/* Top Bar */}
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-[#252d3d] bg-[#0f1117] px-6">
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="sm" className="h-8 -ml-2 gap-1.5 text-[#6b7a99] hover:text-[#e8edf5]">
              <Link to="/contracts">
                <ArrowLeft className="h-3.5 w-3.5" />
                Contracts
              </Link>
            </Button>
            <Separator orientation="vertical" className="h-5 bg-[#252d3d]" />
            <div className="flex items-center gap-2.5">
              <h2 className="font-mono text-sm font-semibold tracking-tight text-[#e8edf5]">
                CTR-{contractId}
              </h2>
              <StatusBadge status={contractStatus.toLowerCase() as "active" | "completed" | "overdue"}>
                {contractStatus}
              </StatusBadge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[#3b82f6] hover:bg-[#3b82f6]/10">
              <Download className="h-3.5 w-3.5" />
              Invoice
            </Button>
            <Button size="sm" className="h-8 gap-1.5 bg-[#3b82f6] text-white hover:bg-[#3b82f6]/90 shadow-lg shadow-[#3b82f6]/20 transition-all active:scale-95">
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[#6b7a99] hover:text-[#e8edf5]">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </div>
        </header>

        {/* Tabs Row */}
        <div className="border-b border-[#252d3d] bg-[#0f1117] px-6">
          <Tabs defaultValue="overview" className="-mb-px">
            <TabsList className="h-9 bg-transparent p-0">
              <TabsTrigger value="overview" className="h-9 gap-1.5 px-4 text-xs data-[state=active]:bg-transparent data-[state=active]:text-[#e8edf5] data-[state=active]:border-b-2 data-[state=active]:border-[#3b82f6] rounded-none border-b-2 border-transparent transition-all">
                <LayoutGrid className="h-3.5 w-3.5" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="financials" className="h-9 gap-1.5 px-4 text-xs data-[state=active]:bg-transparent data-[state=active]:text-[#e8edf5] data-[state=active]:border-b-2 data-[state=active]:border-[#3b82f6] rounded-none border-b-2 border-transparent transition-all">
                <Wallet className="h-3.5 w-3.5" />
                Financials
                {financialsCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-[#252d3d] px-1.5 py-0.5 text-[10px] font-mono text-[#e8edf5]">
                    {financialsCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="documents" className="h-9 gap-1.5 px-4 text-xs data-[state=active]:bg-transparent data-[state=active]:text-[#e8edf5] data-[state=active]:border-b-2 data-[state=active]:border-[#3b82f6] rounded-none border-b-2 border-transparent transition-all">
                <FileText className="h-3.5 w-3.5" />
                Documents
              </TabsTrigger>
              <TabsTrigger value="timeline" className="h-9 gap-1.5 px-4 text-xs data-[state=active]:bg-transparent data-[state=active]:text-[#e8edf5] data-[state=active]:border-b-2 data-[state=active]:border-[#3b82f6] rounded-none border-b-2 border-transparent transition-all">
                <Clock className="h-3.5 w-3.5" />
                Timeline & Notes
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Main Content Area */}
        <main className="flex flex-1 overflow-hidden">
          {/* Left column */}
          <div className="flex-1 overflow-y-auto p-6 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#252d3d]">
            <Tabs defaultValue="overview" className="w-full">
              {children}
            </Tabs>
          </div>
          
          {/* Right column */}
          <aside className="w-[280px] shrink-0 overflow-y-auto p-6 border-l border-[#252d3d] bg-[#0f1117]/50 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#252d3d]">
            <div className="space-y-4">
              {/* WIDGET 1 - Outstanding payment box */}
              <div className="rounded-lg border border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.1)] p-4 text-center animate-fade-up animate-delay-100">
                <p className="text-[11px] uppercase tracking-wide text-[#ef4444] mb-1">CLIENT OWES</p>
                <p className="font-mono text-3xl font-bold text-[#ef4444] mb-3">AED 780</p>
                <Button className="w-full bg-[#ef4444] text-white hover:bg-[#dc2626] rounded-md py-2 text-sm font-medium transition-colors">
                  + Record Payment
                </Button>
              </div>

              {/* WIDGET 2 - Actions */}
              <div className="rounded-lg border border-[#252d3d] bg-[#161b27] animate-fade-up animate-delay-200">
                <header className="flex items-center justify-between border-b border-[#252d3d] px-4 py-2.5">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[#6b7a99]">ACTIONS</h3>
                </header>
                <div className="p-2 space-y-1">
                  <Button variant="ghost" className="w-full justify-start gap-2 rounded-md bg-[#1c2333] border border-[#252d3d] px-3 py-2 text-sm font-medium text-[#e8edf5] hover:bg-[#1c2333]/70">
                    <Calendar className="h-4 w-4 text-[#6b7a99]" />
                    Extend Rental
                  </Button>
                  <Button variant="ghost" className="w-full justify-start gap-2 rounded-md bg-[#1c2333] border border-[#252d3d] px-3 py-2 text-sm font-medium text-[#e8edf5] hover:bg-[#1c2333]/70">
                    <Download className="h-4 w-4 text-[#6b7a99]" />
                    Download Invoice
                  </Button>
                  <Button variant="ghost" className="w-full justify-start gap-2 rounded-md bg-[#1c2333] border border-[#252d3d] px-3 py-2 text-sm font-medium text-[#e8edf5] hover:bg-[#1c2333]/70">
                    <Pencil className="h-4 w-4 text-[#6b7a99]" />
                    Edit Contract
                  </Button>
                  <Button variant="ghost" className="w-full justify-start gap-2 rounded-md bg-[#1c2333] border border-[#252d3d] px-3 py-2 text-sm font-medium text-[#6b7a99] hover:bg-[#1c2333]/70">
                    <XCircle className="h-4 w-4 text-[#6b7a99]" />
                    Close Contract
                  </Button>
                </div>
              </div>

              {/* WIDGET 3 - Rental Period */}
              <div className="rounded-lg border border-[#252d3d] bg-[#161b27] animate-fade-up animate-delay-300">
                <header className="flex items-center justify-between border-b border-[#252d3d] px-4 py-2.5">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[#6b7a99]">RENTAL PERIOD</h3>
                </header>
                <div className="grid grid-cols-2 divide-x divide-[#252d3d] border-b border-[#252d3d]">
                  <div className="p-4 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-[#6b7a99]">START</p>
                    <p className="text-xl font-bold text-[#e8edf5]">09 Apr</p>
                    <p className="text-xs text-[#6b7a99]">2026</p>
                  </div>
                  <div className="p-4 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-[#6b7a99]">END</p>
                    <p className="text-xl font-bold text-[#e8edf5]">12 Apr</p>
                    <p className="text-xs text-[#6b7a99]">2026</p>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#6b7a99]">Duration:</span>
                    <span className="font-medium text-[#e8edf5]">3 days</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#6b7a99]">Daily rate:</span>
                    <span className="font-mono font-medium text-[#e8edf5]">AED 160</span>
                  </div>
                  <Separator className="bg-[#252d3d]" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#6b7a99]">Deposit held:</span>
                    <span className="font-mono font-medium text-[#6b7a99]">AED 1 000</span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}