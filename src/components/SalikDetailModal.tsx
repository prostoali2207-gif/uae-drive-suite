import React, { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

interface SalikDetailModalProps {
  contractId: string;
  open: boolean;
  onClose: () => void;
}

type SalikRow = {
  id: string;
  transaction_id: string | null;
  toll_gate: string | null;
  charge_date: string | null;
  trip_time: string | null;
  status: string | null;
  trips: number | string | null;
  amount: number | string | null;
  original_amount: number | string | null;
  service_fee: number | string | null;
  cars: {
    plate: string | null;
    make: string | null;
    model: string | null;
  } | null;
};

const formatAed = (value: number) =>
  `AED ${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (value: string | null) => {
  if (!value) return "No date";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const toNumber = (value: number | string | null) => Number(value) || 0;

export function SalikDetailModal({ contractId, open, onClose }: SalikDetailModalProps) {
  const [transactions, setTransactions] = useState<SalikRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let active = true;

    const fetchTransactions = async () => {
      setLoading(true);
      setError(null);

      const { data, error: salikError } = await (supabase as any)
        .from("salik")
        .select("id, transaction_id, toll_gate, charge_date, trip_time, status, trips, amount, original_amount, service_fee, cars(plate, make, model)")
        .eq("contract_id", contractId)
        .order("charge_date", { ascending: false });

      if (!active) return;

      if (salikError) {
        setError(salikError.message || "Failed to load Salik transactions.");
        setTransactions([]);
      } else {
        setTransactions((data ?? []) as SalikRow[]);
      }

      setLoading(false);
    };

    fetchTransactions();

    return () => {
      active = false;
    };
  }, [contractId, open]);

  const summary = useMemo(
    () =>
      transactions.reduce(
        (totals, transaction) => ({
          trips: totals.trips + toNumber(transaction.trips),
          tolls: totals.tolls + toNumber(transaction.original_amount),
          serviceFees: totals.serviceFees + toNumber(transaction.service_fee),
          total: totals.total + toNumber(transaction.amount),
        }),
        { trips: 0, tolls: 0, serviceFees: 0, total: 0 },
      ),
    [transactions],
  );

  const filteredTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return transactions;

    return transactions.filter((transaction) =>
      [transaction.transaction_id, transaction.toll_gate].some((value) =>
        value?.toLowerCase().includes(query),
      ),
    );
  }, [transactions, search]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/65 font-dm-sans" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full animate-in slide-in-from-bottom duration-200 overflow-hidden rounded-t-2xl border border-[#22222e] bg-[#12121a] text-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[#22222e] px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-6 text-white">Salik Transactions</h2>
            <p className="mt-1 truncate font-ibm-plex-mono text-xs text-white/50">{contractId}</p>
          </div>
          <button
            type="button"
            aria-label="Close Salik transactions"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[#22222e] text-white/70 transition hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="max-h-[calc(88vh-76px)] overflow-y-auto">
          <section className="grid grid-cols-4 border-b border-[#22222e] bg-white/[0.02]">
            <SummaryItem label="Trips" value={summary.trips.toLocaleString("en-US")} />
            <SummaryItem label="Tolls" value={formatAed(summary.tolls)} valueClassName="text-[#22c55e]" />
            <SummaryItem label="Service fees" value={formatAed(summary.serviceFees)} />
            <SummaryItem label="Total" value={formatAed(summary.total)} valueClassName="text-[#22c55e]" />
          </section>

          <section className="space-y-3 px-4 py-4 sm:px-6">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search transaction ID or gate"
                className="h-11 border-[#22222e] bg-white/[0.03] pl-9 font-dm-sans text-white placeholder:text-white/35 focus-visible:ring-white/20"
              />
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_74px_86px] gap-2 px-1 text-[11px] font-medium uppercase tracking-normal text-white/40">
              <span>Transaction</span>
              <span>Status</span>
              <span className="text-right">Amount</span>
            </div>

            {loading ? (
              <p className="py-10 text-center text-sm text-white/55">Loading Salik transactions...</p>
            ) : error ? (
              <p className="rounded-md border border-[#ef4444]/25 bg-[#ef4444]/10 px-3 py-3 text-sm text-[#fecaca]">
                {error}
              </p>
            ) : filteredTransactions.length === 0 ? (
              <p className="rounded-md border border-[#22222e] bg-white/[0.02] px-3 py-8 text-center text-sm text-white/50">
                No Salik transactions found.
              </p>
            ) : (
              <div className="space-y-2 pb-2">
                {filteredTransactions.map((transaction) => {
                  const carName = [transaction.cars?.make, transaction.cars?.model].filter(Boolean).join(" ");
                  const carLabel = [transaction.cars?.plate, carName].filter(Boolean).join(" · ");
                  const statusLabel = transaction.status === "Paid" ? "Paid" : "Unpaid";

                  return (
                    <div
                      key={transaction.id}
                      className="grid min-h-11 grid-cols-[minmax(0,1fr)_74px_86px] items-center gap-2 rounded-md border border-[#22222e] bg-white/[0.025] px-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">
                          {transaction.toll_gate || "Salik transaction"}
                        </p>
                        <p className="mt-1 truncate font-ibm-plex-mono text-[11px] tabular-nums text-white/50">
                          {formatDate(transaction.charge_date)}{transaction.trip_time ? ` · ${transaction.trip_time}` : ""} / {transaction.transaction_id || "No transaction ID"}
                        </p>
                        <p className="mt-1 truncate text-[11px] text-white/45">
                          {carLabel || "No car"}
                        </p>
                      </div>
                      <span
                        className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                          statusLabel === "Paid"
                            ? "border-[#22c55e]/25 bg-[#22c55e]/15 text-[#22c55e]"
                            : "border-[#ef4444]/25 bg-[#ef4444]/15 text-[#ef4444]"
                        }`}
                      >
                        {statusLabel}
                      </span>
                      <p className="font-ibm-plex-mono text-xs font-semibold tabular-nums text-white text-right">
                        {formatAed(toNumber(transaction.amount))}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <footer className="sticky bottom-0 flex min-h-14 items-center justify-between gap-4 border-t border-[#22222e] bg-[#12121a] px-4 py-3 sm:px-6">
            <span className="text-sm font-medium text-white/70">Total charged to client</span>
            <span className="font-ibm-plex-mono text-base font-semibold tabular-nums text-[#22c55e]">
              {formatAed(summary.total)}
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
}

interface SummaryItemProps {
  label: string;
  value: string;
  valueClassName?: string;
}

function SummaryItem({ label, value, valueClassName = "text-white" }: SummaryItemProps) {
  return (
    <div className="min-w-0 border-r border-[#22222e] px-2 py-3 last:border-r-0 sm:px-4">
      <p className="truncate text-[10px] font-medium uppercase tracking-normal text-white/40">{label}</p>
      <p className={`mt-1 truncate font-ibm-plex-mono text-xs font-semibold tabular-nums sm:text-sm ${valueClassName}`}>
        {value}
      </p>
    </div>
  );
}

export default SalikDetailModal;
