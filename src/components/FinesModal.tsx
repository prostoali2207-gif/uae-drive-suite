import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, ReceiptText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface FinesModalProps {
  contractId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FineStatus = "Paid" | "Charged to Client" | "Unpaid" | string;

interface ContractFine {
  id: string;
  fine_number: string | null;
  fine_type: string;
  amount: number | string | null;
  fine_date: string;
  status: FineStatus;
  paid_at: string | null;
  notes: string | null;
}

const statusStyles: Record<string, string> = {
  Paid: "border-[#22c55e]/25 bg-[#22c55e]/15 text-[#22c55e]",
  "Charged to Client": "border-[#f59e0b]/25 bg-[#f59e0b]/15 text-[#f59e0b]",
  Unpaid: "border-[#ef4444]/25 bg-[#ef4444]/15 text-[#ef4444]",
};

const formatAed = (amount: number) =>
  `AED ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (dateValue: string) => {
  if (!dateValue) return "No date";

  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const toAmount = (amount: ContractFine["amount"]) => Number(amount) || 0;

export function FinesModal({ contractId, open, onOpenChange }: FinesModalProps) {
  const { toast } = useToast();
  const [fines, setFines] = useState<ContractFine[]>([]);
  const [loading, setLoading] = useState(false);
  const [payingFineId, setPayingFineId] = useState<string | null>(null);

  const fetchFines = useCallback(async () => {
    if (!contractId) {
      setFines([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await (supabaseClient as any)
        .from("fines")
        .select("id, fine_number, fine_type, amount, fine_date, status, paid_at, notes")
        .eq("contract_id", contractId)
        .order("fine_date", { ascending: false });

      if (error) throw error;
      setFines((data ?? []) as ContractFine[]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to load contract fines:", error);
      toast({
        title: "Failed to load fines",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [contractId, toast]);

  useEffect(() => {
    if (open) {
      fetchFines();
    }
  }, [fetchFines, open]);

  const summary = useMemo(() => {
    return fines.reduce(
      (totals, fine) => {
        const amount = toAmount(fine.amount);
        if (fine.status === "Paid") {
          totals.paid += amount;
        } else {
          totals.outstanding += amount;
        }
        return totals;
      },
      { paid: 0, outstanding: 0 },
    );
  }, [fines]);

  const markFinePaid = async (fineId: string) => {
    setPayingFineId(fineId);
    try {
      const { error } = await (supabaseClient as any)
        .from("fines")
        .update({
          status: "Paid",
          paid_at: new Date().toISOString(),
        })
        .eq("id", fineId);

      if (error) throw error;

      toast({
        title: "Fine marked paid",
        description: "The fine status was updated successfully.",
      });
      await fetchFines();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to mark fine paid:", error);
      toast({
        title: "Failed to mark paid",
        description: message,
        variant: "destructive",
      });
    } finally {
      setPayingFineId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-full flex-col border-l border-[#232d4a] bg-[#161d35] p-0 text-[#e8eaf0] sm:max-w-[460px]">
        <SheetHeader className="border-b border-[#232d4a] px-5 py-4 text-left">
          <div className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-[#e8eaf0]/70" />
            <SheetTitle className="text-lg font-semibold text-[#e8eaf0]">Contract Fines</SheetTitle>
          </div>
          <SheetDescription className="text-xs text-[#e8eaf0]/55">
            {loading ? "Loading fines..." : `${fines.length} ${fines.length === 1 ? "fine" : "fines"} found`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-[#e8eaf0]/60">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading fines
            </div>
          ) : fines.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-md border border-[#232d4a] bg-white/[0.02] px-4 py-12 text-center">
              <AlertCircle className="mb-3 h-5 w-5 text-[#e8eaf0]/45" />
              <p className="text-sm font-medium text-[#e8eaf0]">No fines linked to this contract</p>
            </div>
          ) : (
            <div className="space-y-3">
              {fines.map((fine) => {
                const statusClass = statusStyles[fine.status] ?? statusStyles.Unpaid;
                const isPaid = fine.status === "Paid";
                const isPaying = payingFineId === fine.id;

                return (
                  <div
                    key={fine.id}
                    className="rounded-md border border-[#232d4a] bg-white/[0.025] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-[#e8eaf0]">
                          {fine.fine_type || "Traffic fine"}
                        </h3>
                        <p className="mt-1 font-ibm-plex-mono text-[11px] text-[#e8eaf0]/55">
                          {formatDate(fine.fine_date)}
                          {fine.fine_number ? ` - ${fine.fine_number}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-ibm-plex-mono text-sm font-semibold tabular-nums text-[#e8eaf0]">
                          {formatAed(toAmount(fine.amount))}
                        </p>
                        <Badge
                          variant="outline"
                          className={cn("mt-2 rounded-full px-2 py-0.5 text-[10px]", statusClass)}
                        >
                          {fine.status || "Unpaid"}
                        </Badge>
                      </div>
                    </div>

                    {fine.notes ? (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#e8eaf0]/55">
                        {fine.notes}
                      </p>
                    ) : null}

                    {!isPaid ? (
                      <div className="mt-3 flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => markFinePaid(fine.id)}
                          disabled={payingFineId !== null}
                          className="h-8 border border-[#22c55e]/25 bg-[#22c55e]/15 px-3 text-xs font-medium text-[#22c55e] hover:bg-[#22c55e]/25"
                        >
                          {isPaying ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                          Mark Paid
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-[#232d4a] bg-[#12182d] px-5 py-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[#e8eaf0]/65">Paid</span>
            <span className="font-ibm-plex-mono font-semibold tabular-nums text-[#22c55e]">
              {formatAed(summary.paid)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-[#e8eaf0]/65">Outstanding</span>
            <span className="font-ibm-plex-mono font-semibold tabular-nums text-[#ef4444]">
              {formatAed(summary.outstanding)}
            </span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default FinesModal;
