import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";

type ParkingRow = {
  id: string;
  parking_date: string;
  location: string;
  parking_zone?: string | null;
  amount: number | string;
  status: string;
  cars: { plate: string | null; make: string | null; model: string | null } | null;
};

interface ParkingDetailModalProps {
  contractId: string;
  transactions: ParkingRow[];
  open: boolean;
  onClose: () => void;
}

const fmtAed = (value: number) =>
  `AED ${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "No date";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

export function ParkingDetailModal({ contractId, transactions, open, onClose }: ParkingDetailModalProps) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return transactions;
    return transactions.filter((transaction) =>
      [transaction.location, transaction.parking_zone, transaction.cars?.plate]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [search, transactions]);

  const total = useMemo(
    () => transactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0),
    [transactions],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/65 font-dm-sans" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full animate-in slide-in-from-bottom duration-200 overflow-hidden rounded-t-2xl border border-[#22222e] bg-[#12121a] text-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[#22222e] px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-6 text-white">Parking Charges</h2>
            <p className="mt-1 truncate font-ibm-plex-mono text-xs text-white/50">{contractId}</p>
          </div>
          <button
            type="button"
            aria-label="Close Parking charges"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[#22222e] text-white/70 transition hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="max-h-[calc(88vh-76px)] overflow-y-auto">
          <section className="space-y-3 px-4 py-4 sm:px-6">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search location, zone or plate"
                className="h-11 border-[#22222e] bg-white/[0.03] pl-9 font-dm-sans text-white placeholder:text-white/35 focus-visible:ring-white/20"
              />
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_74px_86px] gap-2 px-1 text-[11px] font-medium uppercase tracking-normal text-white/40">
              <span>Parking</span>
              <span>Status</span>
              <span className="text-right">Amount</span>
            </div>

            {filtered.length === 0 ? (
              <p className="rounded-md border border-[#22222e] bg-white/[0.02] px-3 py-8 text-center text-sm text-white/50">
                No Parking charges found.
              </p>
            ) : (
              <div className="space-y-2 pb-2">
                {filtered.map((transaction) => {
                  const vehicle = [transaction.cars?.plate, [transaction.cars?.make, transaction.cars?.model].filter(Boolean).join(" ")]
                    .filter(Boolean)
                    .join(" · ");
                  const isPaid = transaction.status.toLowerCase() === "paid";
                  return (
                    <div
                      key={transaction.id}
                      className="grid min-h-11 grid-cols-[minmax(0,1fr)_74px_86px] items-center gap-2 rounded-md border border-[#22222e] bg-white/[0.025] px-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{transaction.location || "Parking"}</p>
                        <p className="mt-1 truncate font-ibm-plex-mono text-[11px] tabular-nums text-white/50">
                          {formatDateTime(transaction.parking_date)}{transaction.parking_zone ? ` · Zone ${transaction.parking_zone}` : ""}
                        </p>
                        <p className="mt-1 truncate text-[11px] text-white/45">{vehicle || "No car"}</p>
                      </div>
                      <span className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${isPaid ? "border-[#22c55e]/25 bg-[#22c55e]/15 text-[#22c55e]" : "border-[#ef4444]/25 bg-[#ef4444]/15 text-[#ef4444]"}`}>
                        {isPaid ? "Paid" : transaction.status || "Unpaid"}
                      </span>
                      <p className="text-right font-ibm-plex-mono text-xs font-semibold tabular-nums text-white">
                        {fmtAed(Number(transaction.amount || 0))}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <footer className="sticky bottom-0 flex min-h-14 items-center justify-between gap-4 border-t border-[#22222e] bg-[#12121a] px-4 py-3 sm:px-6">
            <span className="text-sm font-medium text-white/70">Total charged to client</span>
            <span className="font-ibm-plex-mono text-base font-semibold tabular-nums text-[#a78bfa]">{fmtAed(total)}</span>
          </footer>
        </div>
      </div>
    </div>
  );
}

export default ParkingDetailModal;
