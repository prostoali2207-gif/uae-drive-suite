import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  MoreHorizontal,
  LayoutGrid,
  Wallet,
  FileText,
  Clock,
  User,
  Car,
  DollarSign,
  ChevronDown,
  Plus,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";

// StatusBadge Component
const StatusBadge = ({ status }: { status: "active" | "completed" | "overdue" }) => {
  const getStatusStyles = () => {
    switch (status) {
      case "active":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "completed":
        return "bg-slate-500/20 text-slate-400 border-slate-500/30";
      case "overdue":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      default:
        return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    }
  };

  return (
    <span 
      className={`inline-flex items-center px-[10px] py-[3px] rounded-[20px] text-[11px] uppercase tracking-[0.04em] font-medium border ${getStatusStyles()}`}
    >
      {status}
    </span>
  );
};

// Financials Components and Constants
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function diffDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return Math.max(0, Math.round((e - s) / 86_400_000));
}

const fmtAed = (n: number) => `AED ${Number(n).toLocaleString()}`;

const STATUS_STYLES: Record<string, { dot: string; bg: string; text: string }> = {
  Paid: { dot: "bg-green-500/20", bg: "bg-green-500/20", text: "text-green-400" },
  "Expiring Soon": { dot: "bg-amber-500/20", bg: "bg-amber-500/20", text: "text-amber-400" },
  Upcoming: { dot: "bg-blue-500/20", bg: "bg-blue-500/20", text: "text-blue-400" },
  "Charged to Client": { dot: "bg-purple-500/20", bg: "bg-purple-500/20", text: "text-purple-400" },
  Unpaid: { dot: "bg-red-500/20", bg: "bg-red-500/20", text: "text-red-400" },
  Disputed: { dot: "bg-amber-500/20", bg: "bg-amber-500/20", text: "text-amber-400" },
  Active: { dot: "bg-blue-500/20", bg: "bg-blue-500/20", text: "text-blue-400" },
  Held: { dot: "bg-purple-500/20", bg: "bg-purple-500/20", text: "text-purple-400" },
  Completed: { dot: "bg-green-500/20", bg: "bg-green-500/20", text: "text-green-400" },
};

type AccentKey = "blue" | "red" | "cyan" | "purple";

const ACCENT_VAR: Record<AccentKey, string> = {
  blue: "#3b82f6",
  red: "#ef4444",
  cyan: "#3b82f6",
  purple: "#8b5cf6",
};

// Mock data for Financials
const mockContract = {
  id: "CTR-A34B8DE2",
  start_date: "2026-04-09",
  end_date: "2026-04-12",
  rate_type: "Daily",
  rate_amount: 160,
  total_amount: 980,
  deposit_amount: 1000,
  status: "Completed",
};

const mockFines = [
  {
    id: "1",
    fine_date: "2026-04-10",
    fine_type: "Speeding",
    amount: 200,
    status: "Unpaid",
    source: "RTA",
  },
];

const mockSalik = [
  {
    id: "1",
    charge_date: "2026-04-10",
    trips: 2,
    amount: 8,
    status: "Paid",
  },
];

const mockTotals = {
  charges: 1980,
  credits: 200,
  outstanding: 780,
};

const days = 3;

// Financials Components
type AccordionRowProps = {
  label: string;
  count: number;
  total: number;
  accent: AccentKey;
  totalClass?: string;
  children: React.ReactNode;
};

const AccordionRow = ({
  label,
  count,
  total,
  accent,
  totalClass,
  children,
}: AccordionRowProps) => {
  const [open, setOpen] = useState(false);
  const accentColor = ACCENT_VAR[accent];
  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border bg-[#161b27] transition-colors",
        open && "bg-[#1c2333]/40",
      )}
      style={{ borderColor: open ? accentColor : "#252d3d" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-stretch gap-0 text-left"
      >
        <span className="w-[3px] shrink-0" style={{ backgroundColor: accentColor }} aria-hidden />
        <div className="flex flex-1 items-center justify-between gap-3 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#e8edf5]">
              {label}
            </span>
            <span className="rounded-full bg-[#1c2333] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[#6b7a99]">
              {count}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("text-sm font-bold tabular-nums", totalClass ?? "text-[#e8edf5]")}>
              {fmtAed(total)}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-[#6b7a99] transition-transform duration-200",
                open && "rotate-180",
              )}
            />
          </div>
        </div>
      </button>
      <div
        className={cn(
          "grid transition-all duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="max-h-[280px] overflow-y-auto bg-[#0f1117]/40 custom-scrollbar">
            {count === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-[#6b7a99]">No entries.</div>
            ) : (
              children
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const StatusPill = ({ status }: { status: string }) => {
  const s = STATUS_STYLES[status] ?? {
    dot: "bg-[#6b7a99]",
    bg: "bg-[#1c2333]",
    text: "text-[#6b7a99]",
  };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium",
        s.bg,
        s.text,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {status}
    </span>
  );
};

const EntryRow = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-3 border-b border-[#252d3d]/40 px-3 py-2.5 last:border-b-0">
    {children}
  </div>
);

const FinancialsAccordion = () => {
  const rentalTotal = Number(mockContract.total_amount);
  const finesTotal = mockFines.reduce((s, f) => s + Number(f.amount), 0);
  const salikTotal = mockSalik.reduce((s, x) => s + Number(x.amount), 0);
  const otherFees: {
    id: string;
    date: string;
    type: string;
    description: string;
    status: string;
    amount: number;
  }[] = [];
  const otherTotal = otherFees.reduce((s, o) => s + o.amount, 0);

  return (
    <div className="space-y-2">
      <AccordionRow label="Rental" count={1} total={rentalTotal} accent="blue">
        <EntryRow>
          <div className="flex flex-1 min-w-0 flex-col gap-0.5">
            <span className="text-[11px] text-[#6b7a99]">
              {formatDate(mockContract.start_date)} – {formatDate(mockContract.end_date)} · {days} days
            </span>
            <span className="text-xs text-[#e8edf5]/80">
              {mockContract.rate_type} @ {fmtAed(mockContract.rate_amount)}
            </span>
          </div>
          <StatusPill status={mockContract.status} />
          <span className="w-24 text-right text-sm font-bold tabular-nums text-[#e8edf5]">
            {fmtAed(rentalTotal)}
          </span>
        </EntryRow>
      </AccordionRow>

      <AccordionRow
        label="Traffic Fines"
        count={mockFines.length}
        total={finesTotal}
        accent="red"
        totalClass="text-[#ef4444]"
      >
        {mockFines.map((f) => (
          <EntryRow key={f.id}>
            <span className="w-24 shrink-0 text-[11px] tabular-nums text-[#6b7a99]">
              {formatDate(f.fine_date)}
            </span>
            <span className="flex-1 truncate text-xs text-[#e8edf5]/90">
              {f.fine_type} · {f.source}
            </span>
            <StatusPill status={f.status} />
            <span className="w-24 text-right text-sm font-bold tabular-nums text-[#ef4444]">
              {fmtAed(Number(f.amount))}
            </span>
          </EntryRow>
        ))}
      </AccordionRow>

      <AccordionRow label="Salik" count={mockSalik.length} total={salikTotal} accent="cyan">
        {mockSalik.map((s) => (
          <EntryRow key={s.id}>
            <span className="w-24 shrink-0 text-[11px] tabular-nums text-[#6b7a99]">
              {formatDate(s.charge_date)}
            </span>
            <span className="inline-flex items-center rounded-full bg-[#3b82f6] px-2 py-0.5 text-[10px] font-medium text-[#60a5fa]">
              {s.trips} trips
            </span>
            <span className="flex-1" />
            <StatusPill status={s.status} />
            <span className="w-24 text-right text-sm font-bold tabular-nums text-[#e8edf5]">
              {fmtAed(Number(s.amount))}
            </span>
          </EntryRow>
        ))}
      </AccordionRow>

      <AccordionRow
        label="Other Fees"
        count={otherFees.length}
        total={otherTotal}
        accent="purple"
      >
        {otherFees.map((o) => {
          const typeColors: Record<string, string> = {
            Delivery: "bg-[#3b82f6] text-[#60a5fa]",
            Pickup: "bg-[#3b82f6] text-[#60a5fa]",
            Damage: "bg-[#f59e0b] text-[#fbbf24]",
          };
          return (
            <EntryRow key={o.id}>
              <span className="w-24 shrink-0 text-[11px] tabular-nums text-[#6b7a99]">
                {formatDate(o.date)}
              </span>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                  typeColors[o.type] ?? "bg-[#1c2333] text-[#6b7a99]",
                )}
              >
                {o.type}
              </span>
              <span className="flex-1 truncate text-xs text-[#e8edf5]/90">{o.description}</span>
              <StatusPill status={o.status} />
              <span className="w-24 text-right text-sm font-bold tabular-nums text-[#e8edf5]">
                {fmtAed(o.amount)}
              </span>
            </EntryRow>
          );
        })}
      </AccordionRow>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#252d3d] bg-[#161b27] px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
          <span className="text-[#6b7a99]">
            Total charges:{" "}
            <span className="font-semibold tabular-nums text-[#e8edf5]">
              {fmtAed(mockTotals.charges - Number(mockContract.deposit_amount))}
            </span>
          </span>
          <span className="text-[#6b7a99]">
            Paid:{" "}
            <span className="font-semibold tabular-nums text-[#22c55e]">
              {fmtAed(mockTotals.credits)}
            </span>
          </span>
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold tabular-nums",
            mockTotals.outstanding > 0
              ? "border-[#ef4444]/40 bg-[#ef4444]/20 text-[#ef4444]"
              : "border-[#252d3d] bg-[#1c2333] text-[#e8edf5]",
          )}
        >
          Balance Due: {fmtAed(mockTotals.outstanding)}
        </span>
      </div>
    </div>
  );
};

const ContractDetailNew = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Add custom styles
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeUp {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      .fade-up {
        animation: fadeUp 0.5s ease-out forwards;
      }
      
      .custom-scrollbar::-webkit-scrollbar {
        width: 5px;
      }
      
      .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
      }
      
      .custom-scrollbar::-webkit-scrollbar-thumb {
        background-color: #2e3850;
        border-radius: 3px;
      }
      
      .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background-color: #3a4358;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <div className="flex h-screen bg-[#0f1117] text-[#e8edf5]">
      {/* Left Sidebar */}
      <div className="w-[220px] h-screen bg-[#161b27] border-r border-[#252d3d] flex flex-col">
        {/* Logo Area */}
        <div className="p-6 border-b border-[#252d3d]">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 bg-[#3b82f6] rounded-lg flex items-center justify-center">
              <div className="w-4 h-4 bg-white rounded-sm"></div>
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#e8edf5]">FleetDesk</h1>
              <p className="text-xs text-[#6b7a99]">UAE Rentals</p>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 p-4">
          <ul className="space-y-1">
            <li>
              <Link 
                to="/dashboard"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#6b7a99] hover:text-[#e8edf5] hover:bg-[#1c2333] transition-all duration-150 ease"
              >
                <div className="w-4 h-4"></div>
                Dashboard
              </Link>
            </li>
            <li>
              <Link 
                to="/fleet"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#6b7a99] hover:text-[#e8edf5] hover:bg-[#1c2333] transition-all duration-150 ease"
              >
                <div className="w-4 h-4"></div>
                Fleet
              </Link>
            </li>
            <li>
              <Link 
                to="/contracts"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm bg-[#3b82f6] text-white"
              >
                <div className="w-4 h-4"></div>
                Contracts
              </Link>
            </li>
            <li>
              <Link 
                to="/clients"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#6b7a99] hover:text-[#e8edf5] hover:bg-[#1c2333] transition-all duration-150 ease"
              >
                <div className="w-4 h-4"></div>
                Clients
              </Link>
            </li>
            <li>
              <Link 
                to="/fines"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#6b7a99] hover:text-[#e8edf5] hover:bg-[#1c2333] transition-all duration-150 ease"
              >
                <div className="w-4 h-4"></div>
                Fines & Salik
              </Link>
            </li>
            <li>
              <Link 
                to="/payments"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#6b7a99] hover:text-[#e8edf5] hover:bg-[#1c2333] transition-all duration-150 ease"
              >
                <div className="w-4 h-4"></div>
                Payments
              </Link>
            </li>
            <li>
              <Link 
                to="/reports"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#6b7a99] hover:text-[#e8edf5] hover:bg-[#1c2333] transition-all duration-150 ease"
              >
                <div className="w-4 h-4"></div>
                Reports
              </Link>
            </li>
            <li>
              <Link 
                to="/settings"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#6b7a99] hover:text-[#e8edf5] hover:bg-[#1c2333] transition-all duration-150 ease"
              >
                <div className="w-4 h-4"></div>
                Settings
              </Link>
            </li>
          </ul>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-[#252d3d]">
          <p className="text-xs text-[#6b7a99]">muzafirvat@gmail.com</p>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="h-14 bg-[#161b27] border-b border-[#252d3d] flex items-center justify-between px-6">
          {/* Left Side */}
          <div className="flex items-center gap-4">
            <Link 
              to="/contracts"
              className="flex items-center gap-2 text-[#6b7a99] hover:text-[#e8edf5] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Contracts</span>
            </Link>
            <div className="w-px h-4 bg-[#252d3d]"></div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-[#e8edf5]">CTR-A34B8DE2</span>
              <StatusBadge status="completed" />
            </div>
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-3">
            <button className="px-3 py-1.5 text-sm text-[#6b7a99] hover:text-[#e8edf5] hover:bg-[#1c2333] rounded transition-all duration-150 ease">
              Invoice
            </button>
            <button className="px-3 py-1.5 text-sm bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-all duration-150 ease">
              Edit
            </button>
            <button className="p-1.5 text-[#6b7a99] hover:text-[#e8edf5] hover:bg-[#1c2333] rounded transition-all duration-150 ease">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs Row */}
        <div className="bg-[#161b27] border-b border-[#252d3d] px-6">
          <div className="flex items-center gap-6 overflow-x-auto">
            <button
              onClick={() => setActiveTab("overview")}
              className={`flex items-center gap-2 py-3 border-b-2 transition-all duration-150 ease whitespace-nowrap ${
                activeTab === "overview" 
                  ? "border-[#3b82f6] text-[#e8edf5]" 
                  : "border-transparent text-[#6b7a99] hover:text-[#e8edf5]"
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="text-sm font-medium">Overview</span>
            </button>
            <button
              onClick={() => setActiveTab("financials")}
              className={`flex items-center gap-2 py-3 border-b-2 transition-all duration-150 ease whitespace-nowrap ${
                activeTab === "financials" 
                  ? "border-[#3b82f6] text-[#e8edf5]" 
                  : "border-transparent text-[#6b7a99] hover:text-[#e8edf5]"
              }`}
            >
              <Wallet className="w-4 h-4" />
              <span className="text-sm font-medium">Financials</span>
              <span className="px-1.5 py-0.5 bg-[#1c2333] text-[#6b7a99] text-xs rounded">5</span>
            </button>
            <button
              onClick={() => setActiveTab("documents")}
              className={`flex items-center gap-2 py-3 border-b-2 transition-all duration-150 ease whitespace-nowrap ${
                activeTab === "documents" 
                  ? "border-[#3b82f6] text-[#e8edf5]" 
                  : "border-transparent text-[#6b7a99] hover:text-[#e8edf5]"
              }`}
            >
              <FileText className="w-4 h-4" />
              <span className="text-sm font-medium">Documents</span>
            </button>
            <button
              onClick={() => setActiveTab("timeline")}
              className={`flex items-center gap-2 py-3 border-b-2 transition-all duration-150 ease whitespace-nowrap ${
                activeTab === "timeline" 
                  ? "border-[#3b82f6] text-[#e8edf5]" 
                  : "border-transparent text-[#6b7a99] hover:text-[#e8edf5]"
              }`}
            >
              <Clock className="w-4 h-4" />
              <span className="text-sm font-medium">Timeline & Notes</span>
            </button>
          </div>
        </div>

        {/* Main Content Area - Two Column Grid */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column */}
          <div className="flex-1 bg-[#0f1117] overflow-y-auto custom-scrollbar p-6">
            {/* Overview Tab Content */}
            {activeTab === "overview" && (
              <div className="space-y-4">
                {/* CARD 1 — Client */}
                <div 
                  className={`bg-[#161b27] border border-[#252d3d] rounded-[10px] overflow-hidden transition-all duration-500 hover:border-[#2e3850] fade-up ${
                    mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                  }`}
                  style={{ transitionDelay: '50ms' }}
                >
                  <div className="flex items-center justify-between px-5 py-3 border-b border-[#252d3d]">
                    <span className="text-[11px] uppercase tracking-wider text-[#6b7a99]">CLIENT</span>
                    <Link 
                      to="/clients/123"
                      className="text-[11px] text-[#3b82f6] hover:text-[#60a5fa] transition-colors"
                    >
                      View profile →
                    </Link>
                  </div>
                  <div className="p-5">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                        <span className="text-white font-semibold">MA</span>
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-[#e8edf5]">Maxim Akopov</h3>
                        <p className="text-sm text-[#6b7a99]">Tourist · Russia 🇷🇺</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-[#6b7a99] mb-1">Phone</p>
                        <p className="text-sm text-[#e8edf5]">+79150131048</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-[#6b7a99] mb-1">Email</p>
                        <p className="text-sm text-[#6b7a99]">—</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-[#6b7a99] mb-1">Passport</p>
                        <p className="text-sm font-mono text-[#e8edf5]">763237275</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-[#6b7a99] mb-1">Client type</p>
                        <p className="text-sm text-[#e8edf5]">Tourist</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CARD 2 — Vehicle */}
                <div 
                  className={`bg-[#161b27] border border-[#252d3d] rounded-[10px] overflow-hidden transition-all duration-500 hover:border-[#2e3850] fade-up ${
                    mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                  }`}
                  style={{ transitionDelay: '100ms' }}
                >
                  <div className="px-5 py-3 border-b border-[#252d3d]">
                    <span className="text-[11px] uppercase tracking-wider text-[#6b7a99]">VEHICLE</span>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-[#6b7a99] mb-1">Make/Model</p>
                        <p className="text-sm text-[#e8edf5]">Mazda 3</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-[#6b7a99] mb-1">Year</p>
                        <p className="text-sm text-[#e8edf5]">2021</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-[#6b7a99] mb-1">Plate</p>
                        <p className="text-sm font-mono text-[#e8edf5]">AJM B 98128</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-[#6b7a99] mb-1">Fuel level</p>
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            <div className="w-3 h-3 bg-amber-500 rounded-sm"></div>
                            <div className="w-3 h-3 bg-[#252d3d] rounded-sm"></div>
                            <div className="w-3 h-3 bg-[#252d3d] rounded-sm"></div>
                            <div className="w-3 h-3 bg-[#252d3d] rounded-sm"></div>
                          </div>
                          <span className="text-sm text-[#e8edf5]">Quarter</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-[#6b7a99] mb-1">Initial mileage</p>
                        <p className="text-sm text-[#e8edf5]">0 km</p>
                      </div>
                    </div>
                    
                    {/* Rental Period Timeline */}
                    <div className="pt-4 border-t border-[#252d3d]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[#e8edf5]">09 Apr</span>
                          <div className="w-2 h-2 bg-[#3b82f6] rounded-full"></div>
                          <div className="w-16 h-0.5 bg-[#3b82f6]"></div>
                          <div className="w-2 h-2 bg-[#3b82f6] rounded-full"></div>
                          <span className="text-sm text-[#e8edf5]">12 Apr</span>
                        </div>
                        <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs font-medium rounded border border-green-500/30">
                          Completed
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CARD 3 — Financial Snapshot */}
                <div 
                  className={`bg-[#161b27] border border-[#252d3d] rounded-[10px] overflow-hidden transition-all duration-500 hover:border-[#2e3850] fade-up ${
                    mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                  }`}
                  style={{ transitionDelay: '150ms' }}
                >
                  <div className="px-5 py-3 border-b border-[#252d3d]">
                    <span className="text-[11px] uppercase tracking-wider text-[#6b7a99]">FINANCIAL SNAPSHOT</span>
                  </div>
                  <div className="grid grid-cols-4 divide-x divide-[#252d3d]">
                    <div className="p-4 text-center">
                      <p className="text-[11px] uppercase tracking-wider text-[#6b7a99] mb-2">Total charges</p>
                      <p className="text-lg font-mono font-semibold text-[#e8edf5]">980 AED</p>
                    </div>
                    <div className="p-4 text-center bg-green-500/10">
                      <p className="text-[11px] uppercase tracking-wider text-[#6b7a99] mb-2">Paid</p>
                      <p className="text-lg font-mono font-semibold text-[#22c55e]">200 AED</p>
                    </div>
                    <div className="p-4 text-center">
                      <p className="text-[11px] uppercase tracking-wider text-[#6b7a99] mb-2">Deposit held</p>
                      <p className="text-lg font-mono text-[#6b7a99]">1000 AED</p>
                    </div>
                    <div className="p-4 text-center bg-red-500/10">
                      <p className="text-[11px] uppercase tracking-wider text-[#6b7a99] mb-2">Client owes</p>
                      <p className="text-lg font-mono font-semibold text-[#ef4444]">780 AED</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Financials Tab Content */}
            {activeTab === "financials" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-[#6b7a99]">
                    <Receipt className="h-3.5 w-3.5" />
                    <span>5 ledger entries</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#1c2333] border border-[#252d3d] rounded text-[#e8edf5] hover:bg-[#2e3850] transition-all duration-150 ease">
                      <Plus className="h-3.5 w-3.5" />
                      Add Fee / Fine
                    </button>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#3b82f6] rounded text-white hover:bg-[#2563eb] transition-all duration-150 ease">
                      <Plus className="h-3.5 w-3.5" />
                      Add Payment
                    </button>
                  </div>
                </div>

                <FinancialsAccordion />
              </div>
            )}
            
            {/* Documents Tab Content */}
            {activeTab === "documents" && (
              <div className="space-y-4">
                <div className="text-center py-20">
                  <div className="w-16 h-16 bg-[#1c2333] rounded-lg flex items-center justify-center mb-4 mx-auto">
                    <FileText className="w-8 h-8 text-[#6b7a99]" />
                  </div>
                  <h3 className="text-lg font-medium text-[#e8edf5] mb-2">Documents</h3>
                  <p className="text-sm text-[#6b7a99]">Contract documents and attachments</p>
                </div>
              </div>
            )}
            
            {/* Timeline & Notes Tab Content */}
            {activeTab === "timeline" && (
              <div className="space-y-4">
                <div className="text-center py-20">
                  <div className="w-16 h-16 bg-[#1c2333] rounded-lg flex items-center justify-center mb-4 mx-auto">
                    <Clock className="w-8 h-8 text-[#6b7a99]" />
                  </div>
                  <h3 className="text-lg font-medium text-[#e8edf5] mb-2">Timeline & Notes</h3>
                  <p className="text-sm text-[#6b7a99]">Activity timeline and internal notes</p>
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar */}
          <div className="w-[280px] bg-[#161b27] border-l border-[#252d3d] overflow-y-auto custom-scrollbar p-6">
            <div className="space-y-4">
              {/* WIDGET 1 — Outstanding payment box */}
              <div 
                className={`bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] rounded-[10px] p-4 transition-all duration-500 fade-up ${
                  mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                }`}
                style={{ transitionDelay: '50ms' }}
              >
                <p className="text-[11px] uppercase tracking-wider text-red-400 mb-2">CLIENT OWES</p>
                <p className="text-[28px] font-bold font-mono text-[#ef4444] mb-3">AED 780</p>
                <button className="w-full bg-[#ef4444] text-white px-3 py-2.5 rounded-[7px] text-sm font-medium hover:bg-[#dc2626] transition-colors">
                  + Record Payment
                </button>
              </div>

              {/* WIDGET 2 — Actions */}
              <div 
                className={`bg-[#161b27] border border-[#252d3d] rounded-[10px] overflow-hidden transition-all duration-500 hover:border-[#2e3850] fade-up ${
                  mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                }`}
                style={{ transitionDelay: '100ms' }}
              >
                <div className="px-4 py-3 border-b border-[#252d3d]">
                  <span className="text-[11px] uppercase tracking-wider text-[#6b7a99]">ACTIONS</span>
                </div>
                <div className="p-3 space-y-1.5">
                  <button className="w-full bg-[#1c2333] border border-[#252d3d] rounded-[7px] px-3 py-2 text-left text-sm text-[#e8edf5] hover:bg-[#2e3850] transition-all duration-150 ease flex items-center gap-2">
                    <span className="text-base">📅</span>
                    Extend Rental
                  </button>
                  <button className="w-full bg-[#1c2333] border border-[#252d3d] rounded-[7px] px-3 py-2 text-left text-sm text-[#e8edf5] hover:bg-[#2e3850] transition-all duration-150 ease flex items-center gap-2">
                    <span className="text-base">⬇</span>
                    Download Invoice
                  </button>
                  <button className="w-full bg-[#1c2333] border border-[#252d3d] rounded-[7px] px-3 py-2 text-left text-sm text-[#e8edf5] hover:bg-[#2e3850] transition-all duration-150 ease flex items-center gap-2">
                    <span className="text-base">✏️</span>
                    Edit Contract
                  </button>
                  <button className="w-full bg-[#1c2333] border border-[#252d3d] rounded-[7px] px-3 py-2 text-left text-sm text-[#6b7a99] hover:bg-[#2e3850] transition-all duration-150 ease flex items-center gap-2">
                    <span className="text-base">✕</span>
                    Close Contract
                  </button>
                </div>
              </div>

              {/* WIDGET 3 — Rental Period */}
              <div 
                className={`bg-[#161b27] border border-[#252d3d] rounded-[10px] overflow-hidden transition-all duration-500 hover:border-[#2e3850] fade-up ${
                  mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                }`}
                style={{ transitionDelay: '150ms' }}
              >
                <div className="px-4 py-3 border-b border-[#252d3d]">
                  <span className="text-[11px] uppercase tracking-wider text-[#6b7a99]">RENTAL PERIOD</span>
                </div>
                
                {/* Top section - 2-column grid */}
                <div className="grid grid-cols-2 divide-x divide-[#252d3d]">
                  <div className="p-4 text-center">
                    <p className="text-[11px] uppercase tracking-wider text-[#6b7a99] mb-1">START</p>
                    <p className="text-lg font-semibold text-[#e8edf5]">09 Apr</p>
                    <p className="text-sm text-[#6b7a99]">2026</p>
                  </div>
                  <div className="p-4 text-center">
                    <p className="text-[11px] uppercase tracking-wider text-[#6b7a99] mb-1">END</p>
                    <p className="text-lg font-semibold text-[#e8edf5]">12 Apr</p>
                    <p className="text-sm text-[#6b7a99]">2026</p>
                  </div>
                </div>
                
                {/* Bottom section - details */}
                <div className="px-4 py-[14px] space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[#6b7a99]">Duration:</span>
                    <span className="text-[#e8edf5]">3 days</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#6b7a99]">Daily rate:</span>
                    <span className="font-mono text-[#e8edf5]">AED 160</span>
                  </div>
                  <div className="h-px bg-[#252d3d] my-2"></div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#6b7a99]">Deposit held:</span>
                    <span className="font-mono text-[#6b7a99]">AED 1 000</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContractDetailNew;
