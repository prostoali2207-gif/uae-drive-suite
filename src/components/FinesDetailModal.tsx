import React, { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

interface FinesDetailModalProps {
  contractId: string;
  open: boolean;
  onClose: () => void;
}

type FineRow = {
  id: string;
  fine_number: string | null;
  fine_type: string | null;
  fine_date: string | null;
  amount: number | string | null;
  original_amount: number | string | null;
  service_fee: number | string | null;
  status: string | null;
};

const formatAed = (value: number) =>
  `AED ${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

function formatDate(isoString: string | null): string {
  if (!isoString) return "—";
  const date = new Date(isoString);
  return date.toLocaleString("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).replace(",", " ·");
}

const toNumber = (value: number | string | null) => Number(value) || 0;

export function FinesDetailModal({ contractId, open, onClose }: FinesDetailModalProps) {
  const [fines, setFines] = useState<FineRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let active = true;

    const fetchFines = async () => {
      setLoading(true);
      setError(null);

      const { data, error: finesError } = await (supabase as any)
        .from("fines")
        .select("id, fine_number, fine_type, fine_date, amount, original_amount, service_fee, status")
        .eq("contract_id", contractId)
        .order("fine_date", { ascending: false });

      if (!active) return;

      if (finesError) {
        setError(finesError.message || "Failed to load traffic fines.");
        setFines([]);
      } else {
        setFines((data ?? []) as FineRow[]);
      }

      setLoading(false);
    };

    fetchFines();

    return () => {
      active = false;
    };
  }, [contractId, open]);

  const summary = useMemo(
    () =>
      fines.reduce(
        (totals, fine) => ({
          violations: totals.violations + 1,
          fines: totals.fines + toNumber(fine.original_amount),
          serviceFees: totals.serviceFees + toNumber(fine.service_fee),
          total: totals.total + toNumber(fine.amount),
        }),
        { violations: 0, fines: 0, serviceFees: 0, total: 0 },
      ),
    [fines],
  );

  const filteredFines = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return fines;

    return fines.filter((fine) =>
      [fine.fine_number, fine.fine_type].some((value) => value?.toLowerCase().includes(query)),
    );
  }, [fines, search]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/65 font-dm-sans" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full animate-in slide-in-from-bottom duration-200 overflow-hidden rounded-t-2xl border border-border bg-card text-foreground shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-6 text-foreground">Traffic Fines</h2>
            <p className="mt-1 truncate font-ibm-plex-mono text-xs text-muted-foreground">{contractId}</p>
          </div>
          <button
            type="button"
            aria-label="Close traffic fines"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="max-h-[calc(88vh-76px)] overflow-y-auto">
          <section className="grid grid-cols-2 border-b border-border bg-muted/10 sm:grid-cols-4">
            <SummaryItem label="Violations" value={summary.violations.toLocaleString("en-US")} />
            <SummaryItem label="Fines" value={formatAed(summary.fines)} valueClassName="text-tint-rose-foreground" />
            <SummaryItem label="Service fees" value={formatAed(summary.serviceFees)} />
            <SummaryItem label="Total" value={formatAed(summary.total)} valueClassName="text-tint-rose-foreground" />
          </section>

          <section className="space-y-3 px-4 py-4 sm:px-6">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search fine number or type"
                className="h-11 border-input bg-input pl-9 font-dm-sans text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
              />
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 px-1 text-[11px] font-medium uppercase tracking-normal text-muted-foreground sm:grid-cols-[minmax(0,1.6fr)_82px_86px_76px]">
              <span>Violation</span>
              <span className="hidden sm:block">Date</span>
              <span className="text-right">Amount</span>
              <span className="hidden text-right sm:block">Status</span>
            </div>

            {loading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Loading traffic fines...</p>
            ) : error ? (
              <p className="rounded-md border border-tint-rose-foreground/20 bg-tint-rose px-3 py-3 text-sm text-tint-rose-foreground">
                {error}
              </p>
            ) : filteredFines.length === 0 ? (
              <p className="rounded-md border border-border bg-muted/10 px-3 py-8 text-center text-sm text-muted-foreground">
                No traffic fines found.
              </p>
            ) : (
              <div className="space-y-2 pb-2">
                {filteredFines.map((fine) => {
                  const isUnpaid = fine.status === "Unpaid";

                  return (
                    <div
                      key={fine.id}
                      className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border bg-muted/10 px-3 py-3 sm:grid-cols-[minmax(0,1.6fr)_82px_86px_76px]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {fine.fine_type || "Traffic violation"}
                        </p>
                        <p className="mt-1 truncate font-ibm-plex-mono text-[11px] text-muted-foreground">
                          {fine.fine_number || "No fine number"}
                        </p>
                        <p className="mt-1 font-ibm-plex-mono text-[10px] text-muted-foreground sm:hidden">
                          {formatDate(fine.fine_date)}
                        </p>
                      </div>
                      <p className="hidden font-ibm-plex-mono text-[11px] text-muted-foreground sm:block">
                        {formatDate(fine.fine_date)}
                      </p>
                      <p className="font-ibm-plex-mono text-xs font-semibold tabular-nums text-foreground text-right">
                        {formatAed(toNumber(fine.amount))}
                      </p>
                      <div className="col-start-2 row-start-2 flex justify-end sm:col-start-auto sm:row-start-auto">
                        <Badge
                          className={
                            isUnpaid
                              ? "border-tint-rose-foreground/20 bg-tint-rose text-tint-rose-foreground hover:bg-tint-rose/80"
                              : "border-tint-green-foreground/20 bg-tint-green text-tint-green-foreground hover:bg-tint-green/80"
                          }
                          variant="outline"
                        >
                          {isUnpaid ? "Unpaid" : "Charged"}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <footer className="sticky bottom-0 flex min-h-14 items-center justify-between gap-4 border-t border-border bg-card px-4 py-3 sm:px-6">
            <span className="text-sm font-medium text-muted-foreground">Total charged to client</span>
            <span className="font-ibm-plex-mono text-base font-semibold tabular-nums text-tint-rose-foreground">
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

function SummaryItem({ label, value, valueClassName = "text-foreground" }: SummaryItemProps) {
  return (
    <div className="min-w-0 border-r border-border px-2 py-3 even:border-r-0 sm:border-r sm:px-4 sm:even:border-r sm:last:border-r-0">
      <p className="truncate text-[10px] font-medium uppercase tracking-normal text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate font-ibm-plex-mono text-xs font-semibold tabular-nums sm:text-sm ${valueClassName}`}>
        {value}
      </p>
    </div>
  );
}

export default FinesDetailModal;
