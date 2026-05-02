import { useMemo, useState } from "react";
import {
  Plus,
  ChevronDown,
  Check,
  Receipt,
  Car,
  AlertTriangle,
  Zap,
  Sparkles,
  Download,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

/* ============================================================
 * Types — kept compatible with parent ContractDetail.tsx
 * ============================================================ */

export interface FTContract {
  id: string;
  client_id: string;
  car_id: string;
  start_date: string;
  end_date: string;
  rate_type: string;
  rate_amount: number;
  total_amount: number;
  deposit_amount: number;
  status: string;
}

export interface FTFine {
  id: string;
  fine_date: string;
  fine_type: string;
  amount: number;
  status: string;
  source: string;
}

export interface FTSalik {
  id: string;
  charge_date: string;
  trips: number;
  amount: number;
  status: string;
}

export interface FTPayment {
  id: string;
  payment_date: string;
  amount: number;
  method: string;
  status: string;
  ledger_ref?: string | null;
}

interface Props {
  contract: FTContract;
  days: number;
  fines: FTFine[];
  salik: FTSalik[];
  payments: FTPayment[];
  contractNumber: string;
  onChanged: () => void; // triggers parent refetch
}

/* ============================================================
 * Helpers
 * ============================================================ */

const fmt = (n: number) =>
  `AED ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

type CategoryKey = "Rental" | "Traffic" | "Salik" | "Other";

interface LedgerItem {
  ref: string; // unique ref, also stored on payments.method to allocate
  category: CategoryKey;
  date: string;
  description: string;
  amount: number;
}

/* ============================================================
 * Toast (local mini system layered on sonner with dark style)
 * ============================================================ */

const notify = (msg: string) => {
  toast.success(msg, {
    style: {
      background: "#141820",
      color: "#E5E7EB",
      border: "1px solid #1E2430",
    },
  });
};

/* ============================================================
 * Pay Modal
 * ============================================================ */

function PayModal({
  open,
  onClose,
  item,
  remaining,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  item: LedgerItem | null;
  remaining: number;
  onConfirm: (data: { amount: number; method: string; note: string }) => Promise<void>;
}) {
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<"Cash" | "Card" | "Transfer">("Cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // reset on open
  useMemo(() => {
    if (open) {
      setAmount(remaining > 0 ? String(remaining) : "");
      setMethod("Cash");
      setNote("");
    }
  }, [open, remaining]);

  if (!open || !item) return null;

  const amt = Number(amount) || 0;
  const valid = amt > 0 && amt <= remaining + 0.001;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-[#1E2430] bg-[#141820] p-6 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">Record Payment</h3>
            <p className="mt-0.5 text-xs text-gray-400">{item.description}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-500 hover:bg-white/5 hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
              Amount (AED)
            </label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-[#1E2430] bg-[#0D1117] px-3 py-2 text-sm font-semibold text-white tabular-nums outline-none focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/30"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Remaining balance: <span className="text-gray-300 tabular-nums">{fmt(remaining)}</span>
            </p>
          </div>

          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
              Payment Method
            </label>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5 rounded-md border border-[#1E2430] bg-[#0D1117] p-1">
              {(["Cash", "Card", "Transfer"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={[
                    "rounded px-3 py-1.5 text-xs font-medium transition-colors",
                    method === m
                      ? "bg-gradient-to-r from-[#3B82F6] to-[#6366F1] text-white shadow"
                      : "text-gray-400 hover:bg-white/5 hover:text-gray-200",
                  ].join(" ")}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
              Note (optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reference, receipt #, etc."
              className="mt-1.5 w-full rounded-md border border-[#1E2430] bg-[#0D1117] px-3 py-2 text-sm text-white placeholder:text-gray-600 outline-none focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/30"
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-[#1E2430] bg-transparent px-4 py-2 text-xs font-medium text-gray-300 hover:bg-white/5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            disabled={!valid || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm({ amount: amt, method, note });
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-md bg-gradient-to-r from-[#3B82F6] to-[#6366F1] px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-[#3B82F6]/20 transition-all hover:shadow-[#6366F1]/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Recording…" : `Confirm Payment · ${fmt(amt)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * Add Fee Modal
 * ============================================================ */

function AddFeeModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (data: {
    category: "Traffic" | "Salik" | "Other";
    description: string;
    amount: number;
    date: string;
  }) => Promise<void>;
}) {
  const [category, setCategory] = useState<"Traffic" | "Salik" | "Other">("Traffic");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  useMemo(() => {
    if (open) {
      setCategory("Traffic");
      setDescription("");
      setAmount("");
      setDate(new Date().toISOString().slice(0, 10));
    }
  }, [open]);

  if (!open) return null;
  const amt = Number(amount) || 0;
  const valid = description.trim() && amt > 0 && date;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-[#1E2430] bg-[#141820] p-6 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">Add Ledger Entry</h3>
            <p className="mt-0.5 text-xs text-gray-400">Manually log a fee, fine or extra charge.</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-500 hover:bg-white/5 hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
              Category
            </label>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5 rounded-md border border-[#1E2430] bg-[#0D1117] p-1">
              {(["Traffic", "Salik", "Other"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={[
                    "rounded px-3 py-1.5 text-xs font-medium transition-colors",
                    category === c
                      ? "bg-gradient-to-r from-[#3B82F6] to-[#6366F1] text-white shadow"
                      : "text-gray-400 hover:bg-white/5 hover:text-gray-200",
                  ].join(" ")}
                >
                  {c === "Traffic" ? "Traffic Fine" : c === "Salik" ? "Salik" : "Other Fee"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Sheikh Zayed Rd · over speeding"
              className="mt-1.5 w-full rounded-md border border-[#1E2430] bg-[#0D1117] px-3 py-2 text-sm text-white placeholder:text-gray-600 outline-none focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
                Amount (AED)
              </label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-[#1E2430] bg-[#0D1117] px-3 py-2 text-sm font-semibold text-white tabular-nums outline-none focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/30"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-[#1E2430] bg-[#0D1117] px-3 py-2 text-sm text-white outline-none focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/30 [color-scheme:dark]"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-[#1E2430] bg-transparent px-4 py-2 text-xs font-medium text-gray-300 hover:bg-white/5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            disabled={!valid || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm({ category, description: description.trim(), amount: amt, date });
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-md bg-gradient-to-r from-[#3B82F6] to-[#6366F1] px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-[#3B82F6]/20 transition-all hover:shadow-[#6366F1]/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add Entry"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * Category Group
 * ============================================================ */

const CATEGORY_META: Record<
  CategoryKey,
  { label: string; color: string; icon: typeof Car }
> = {
  Rental: { label: "Rental", color: "#3B82F6", icon: Car },
  Traffic: { label: "Traffic Fines", color: "#EF4444", icon: AlertTriangle },
  Salik: { label: "Salik", color: "#6366F1", icon: Zap },
  Other: { label: "Other Fees", color: "#10B981", icon: Sparkles },
};

function CategoryGroup({
  category,
  items,
  paidByRef,
  onPay,
}: {
  category: CategoryKey;
  items: LedgerItem[];
  paidByRef: Record<string, number>;
  onPay: (item: LedgerItem) => void;
}) {
  const [open, setOpen] = useState(category === "Rental" || items.length > 0);
  const meta = CATEGORY_META[category];
  const total = items.reduce((s, i) => s + i.amount, 0);
  const paid = items.reduce((s, i) => s + Math.min(i.amount, paidByRef[i.ref] ?? 0), 0);

  return (
    <div
      className="overflow-hidden rounded-lg border border-[#1E2430] bg-[#141820] transition-colors"
      style={{ boxShadow: open ? `inset 3px 0 0 0 ${meta.color}` : `inset 3px 0 0 0 ${meta.color}80` }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
      >
        <div className="flex items-center gap-2.5">
          <meta.icon className="h-4 w-4" style={{ color: meta.color }} />
          <span className="text-sm font-semibold text-white">{meta.label}</span>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium tabular-nums text-gray-400">
            {items.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {paid > 0 && (
            <span className="text-[11px] tabular-nums text-[#10B981]">
              {fmt(paid)} paid
            </span>
          )}
          <span className="text-sm font-bold tabular-nums text-white">{fmt(total)}</span>
          <ChevronDown
            className={[
              "h-4 w-4 text-gray-500 transition-transform duration-200",
              open ? "rotate-180" : "",
            ].join(" ")}
          />
        </div>
      </button>

      <div
        className={[
          "grid transition-all duration-300 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        ].join(" ")}
      >
        <div className="overflow-hidden">
          <div className="border-t border-[#1E2430]">
            {items.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-500">
                No entries in this category.
              </div>
            ) : (
              items.map((item, idx) => {
                const paidAmt = Math.min(item.amount, paidByRef[item.ref] ?? 0);
                const remaining = item.amount - paidAmt;
                const fullyPaid = remaining <= 0.001;
                const partial = paidAmt > 0 && !fullyPaid;
                return (
                  <div
                    key={item.ref}
                    className={[
                      "flex items-center gap-3 border-b border-[#1E2430] px-4 py-3 last:border-b-0 transition-opacity",
                      fullyPaid ? "opacity-50" : "",
                    ].join(" ")}
                  >
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold tabular-nums"
                      style={{
                        backgroundColor: `${meta.color}1A`,
                        color: meta.color,
                      }}
                    >
                      {idx + 1}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium text-gray-100">
                        {item.description}
                      </span>
                      <span className="text-[11px] text-gray-500">
                        {formatDate(item.date)}
                        {partial && (
                          <span className="ml-2 text-[#F59E0B]">
                            · Partial: {fmt(paidAmt)}
                          </span>
                        )}
                      </span>
                    </div>
                    <span
                      className="w-28 text-right text-sm font-bold tabular-nums"
                      style={{ color: meta.color }}
                    >
                      {fmt(item.amount)}
                    </span>
                    {fullyPaid ? (
                      <span className="inline-flex h-7 w-16 items-center justify-center gap-1 rounded-md bg-[#10B981]/10 text-xs font-medium text-[#10B981]">
                        <Check className="h-3.5 w-3.5" />
                        Paid
                      </span>
                    ) : (
                      <button
                        onClick={() => onPay(item)}
                        className="inline-flex h-7 w-16 items-center justify-center rounded-md border border-[#3B82F6]/40 bg-[#3B82F6]/10 text-xs font-medium text-[#3B82F6] transition-colors hover:bg-[#3B82F6]/20"
                      >
                        Pay
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * Main Component
 * ============================================================ */

export function FinancialsTab({
  contract,
  days,
  fines,
  salik,
  payments,
  contractNumber,
  onChanged,
}: Props) {
  const [payTarget, setPayTarget] = useState<{ item: LedgerItem; remaining: number } | null>(
    null,
  );
  const [addOpen, setAddOpen] = useState(false);

  /* ----------- Build ledger items ----------- */
  const items: LedgerItem[] = useMemo(() => {
    const list: LedgerItem[] = [];
    list.push({
      ref: `rental-${contract.id}`,
      category: "Rental",
      date: contract.start_date,
      description: `${contract.rate_type} rental · ${days} days @ ${fmt(contract.rate_amount)}`,
      amount: Number(contract.total_amount),
    });
    fines.forEach((f) => {
      const cat: CategoryKey =
        f.fine_type === "Salik" ? "Salik" : f.fine_type === "Other" ? "Other" : "Traffic";
      list.push({
        ref: `fine-${f.id}`,
        category: cat,
        date: f.fine_date,
        description: `${f.fine_type}${f.source ? ` · ${f.source}` : ""}`,
        amount: Number(f.amount),
      });
    });
    salik.forEach((s) => {
      list.push({
        ref: `salik-${s.id}`,
        category: "Salik",
        date: s.charge_date,
        description: `Salik · ${s.trips} toll trip${s.trips === 1 ? "" : "s"}`,
        amount: Number(s.amount),
      });
    });
    return list;
  }, [contract, days, fines, salik]);

  /* ----------- Allocate payments to items via ledger_ref ----------- */
  const paidByRef: Record<string, number> = useMemo(() => {
    const map: Record<string, number> = {};
    // Targeted payments: method field stores "<method>|<ref>" when paying a specific entry
    const targeted = payments.filter((p) => (p.method || "").includes("|"));
    const general = payments.filter((p) => !(p.method || "").includes("|"));

    for (const p of targeted) {
      const ref = (p.method || "").split("|")[1];
      if (!ref) continue;
      map[ref] = (map[ref] ?? 0) + Number(p.amount);
    }
    // General payments → FIFO across items in display order
    let pool = general.reduce((s, p) => s + Number(p.amount), 0);
    for (const it of items) {
      if (pool <= 0) break;
      const already = map[it.ref] ?? 0;
      const need = Math.max(0, it.amount - already);
      const apply = Math.min(need, pool);
      if (apply > 0) {
        map[it.ref] = already + apply;
        pool -= apply;
      }
    }
    return map;
  }, [payments, items]);

  /* ----------- Totals ----------- */
  const totalCharges = items.reduce((s, i) => s + i.amount, 0);
  const totalPaid = Object.entries(paidByRef).reduce(
    (s, [ref, p]) => s + Math.min(p, items.find((i) => i.ref === ref)?.amount ?? 0),
    0,
  );
  const balanceDue = Math.max(0, totalCharges - totalPaid);
  const pct = totalCharges > 0 ? Math.min(100, (totalPaid / totalCharges) * 100) : 0;

  /* ----------- Group by category ----------- */
  const grouped: Record<CategoryKey, LedgerItem[]> = {
    Rental: items.filter((i) => i.category === "Rental"),
    Traffic: items.filter((i) => i.category === "Traffic"),
    Salik: items.filter((i) => i.category === "Salik"),
    Other: items.filter((i) => i.category === "Other"),
  };

  /* ----------- Actions ----------- */
  const handlePay = async ({
    amount,
    method,
    note,
  }: {
    amount: number;
    method: string;
    note: string;
  }) => {
    if (!payTarget) return;
    const ref = payTarget.item.ref;
    // Encode ledger ref into method column (no schema change needed)
    const encodedMethod = `${method}|${ref}`;
    const { error } = await supabase.from("payments").insert({
      contract_id: contract.id,
      client_id: contract.client_id,
      amount,
      method: encodedMethod,
      status: "Paid",
      payment_date: new Date().toISOString().slice(0, 10),
    } as never);
    if (error) {
      toast.error("Failed to record payment");
      return;
    }
    notify(`Payment of ${fmt(amount)} confirmed${note ? ` · ${note}` : ""}`);
    setPayTarget(null);
    onChanged();
  };

  const handleAddFee = async ({
    category,
    description,
    amount,
    date,
  }: {
    category: "Traffic" | "Salik" | "Other";
    description: string;
    amount: number;
    date: string;
  }) => {
    const fine_type =
      category === "Traffic" ? "Traffic" : category === "Salik" ? "Salik" : "Other";
    const { error } = await supabase.from("fines").insert({
      contract_id: contract.id,
      client_id: contract.client_id,
      car_id: contract.car_id,
      fine_date: date,
      fine_type,
      amount,
      original_amount: amount,
      service_fee: 0,
      source: description,
      status: "Unpaid",
    } as never);
    if (error) {
      toast.error("Failed to add entry");
      return;
    }
    notify(`Added ${fine_type} entry · ${fmt(amount)}`);
    setAddOpen(false);
    onChanged();
  };

  const handleExport = () => {
    const lines: string[] = [];
    lines.push(`FleetDesk — Ledger Report`);
    lines.push(`Contract: ${contractNumber}`);
    lines.push(`Generated: ${new Date().toLocaleString("en-GB")}`);
    lines.push(``);
    lines.push(`Total Charges : ${fmt(totalCharges)}`);
    lines.push(`Total Paid    : ${fmt(totalPaid)}`);
    lines.push(`Balance Due   : ${fmt(balanceDue)}`);
    lines.push(``);
    (["Rental", "Traffic", "Salik", "Other"] as CategoryKey[]).forEach((cat) => {
      const list = grouped[cat];
      if (!list.length) return;
      lines.push(`── ${CATEGORY_META[cat].label} ──`);
      list.forEach((i, idx) => {
        const paid = Math.min(i.amount, paidByRef[i.ref] ?? 0);
        const status =
          paid >= i.amount ? "PAID" : paid > 0 ? `PARTIAL (${fmt(paid)})` : "UNPAID";
        lines.push(
          `  ${idx + 1}. [${formatDate(i.date)}] ${i.description} — ${fmt(i.amount)} [${status}]`,
        );
      });
      lines.push(``);
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${contractNumber}-ledger.txt`;
    a.click();
    URL.revokeObjectURL(url);
    notify("Ledger exported");
  };

  /* ============================================================
   * Render — scoped dark theme
   * ============================================================ */

  return (
    <div
      className="rounded-xl border border-[#1E2430] bg-[#0D1117] p-5 text-gray-100"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      {/* Header strip with export */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Financial Ledger</h2>
          <p className="text-xs text-gray-500">All charges and payments for this contract.</p>
        </div>
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#1E2430] bg-[#141820] px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-white/5"
        >
          <Download className="h-3.5 w-3.5" />
          Export PDF
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="Total Charges" value={totalCharges} color="#E5E7EB" />
        <SummaryCard label="Total Paid" value={totalPaid} color="#10B981" />
        <SummaryCard
          label="Balance Due"
          value={balanceDue}
          color={balanceDue > 0 ? "#EF4444" : "#10B981"}
        />
      </div>

      {/* Progress bar */}
      <div className="mt-5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium text-gray-400">{Math.round(pct)}% collected</span>
          <span className="tabular-nums text-gray-500">
            {fmt(totalPaid)} / {fmt(totalCharges)}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#1E2430]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#3B82F6] to-[#6366F1] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1.5 text-xs text-gray-400">
          <Receipt className="h-3.5 w-3.5" />
          <span className="tabular-nums">{items.length} ledger entries</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#1E2430] bg-[#141820] px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-white/5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Fee / Fine
          </button>
          <button
            onClick={() => {
              // open Pay modal pointed at first unpaid item
              const target = items.find(
                (i) => (paidByRef[i.ref] ?? 0) < i.amount - 0.001,
              );
              if (!target) {
                toast.message("Nothing to pay — all entries are settled");
                return;
              }
              setPayTarget({
                item: target,
                remaining: target.amount - (paidByRef[target.ref] ?? 0),
              });
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-[#3B82F6] to-[#6366F1] px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-[#3B82F6]/20 transition-all hover:shadow-[#6366F1]/30"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Payment
          </button>
        </div>
      </div>

      {/* Categories */}
      <div className="mt-4 space-y-2.5">
        {(["Rental", "Traffic", "Salik", "Other"] as CategoryKey[]).map((cat) => (
          <CategoryGroup
            key={cat}
            category={cat}
            items={grouped[cat]}
            paidByRef={paidByRef}
            onPay={(item) =>
              setPayTarget({
                item,
                remaining: item.amount - (paidByRef[item.ref] ?? 0),
              })
            }
          />
        ))}
      </div>

      <PayModal
        open={!!payTarget}
        item={payTarget?.item ?? null}
        remaining={payTarget?.remaining ?? 0}
        onClose={() => setPayTarget(null)}
        onConfirm={handlePay}
      />
      <AddFeeModal open={addOpen} onClose={() => setAddOpen(false)} onConfirm={handleAddFee} />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-[#1E2430] bg-[#141820] p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{label}</div>
      <div
        className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight"
        style={{ color }}
      >
        {fmt(value)}
      </div>
    </div>
  );
}
