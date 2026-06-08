import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Radar, Route } from "lucide-react";

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

interface SalikModalProps {
  contractId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SalikStatus = "Paid" | "Charged to Client" | "Unpaid" | string;

interface ContractSalikTransaction {
  id: string;
  transaction_id: string | null;
  toll_gate: string | null;
  amount: number | string | null;
  transaction_date: string;
  status: SalikStatus;
  paid_at: string | null;
  service_fee: number | string | null;
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

const toAmount = (amount: ContractSalikTransaction["amount"]) => Number(amount) || 0;

export function SalikModal({ contractId, open, onOpenChange }: SalikModalProps) {
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<ContractSalikTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [payingTransactionId, setPayingTransactionId] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    if (!contractId) {
      setTransactions([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await (supabaseClient as any)
        .from("salik")
        .select("id, transaction_id, toll_gate, amount, transaction_date:charge_date, status, paid_at, service_fee")
        .eq("contract_id", contractId)
        .order("charge_date", { ascending: false });

      if (error) throw error;
      setTransactions((data ?? []) as ContractSalikTransaction[]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to load Salik transactions:", error);
      toast({
        title: "Failed to load Salik",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [contractId, toast]);

  useEffect(() => {
    if (open) {
      fetchTransactions();
    }
  }, [fetchTransactions, open]);

  const summary = useMemo(() => {
    return transactions.reduce(
      (totals, transaction) => {
        const amount = toAmount(transaction.amount);
        if (transaction.status === "Paid") {
          totals.paid += amount;
        } else {
          totals.outstanding += amount;
        }
        return totals;
      },
      { paid: 0, outstanding: 0 },
    );
  }, [transactions]);

  const markTransactionPaid = async (transactionId: string) => {
    setPayingTransactionId(transactionId);
    try {
      const { error } = await (supabaseClient as any)
        .from("salik")
        .update({
          status: "Paid",
          paid_at: new Date().toISOString(),
        })
        .eq("id", transactionId);

      if (error) throw error;

      toast({
        title: "Salik marked paid",
        description: "The transaction status was updated successfully.",
      });
      await fetchTransactions();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to mark Salik paid:", error);
      toast({
        title: "Failed to mark paid",
        description: message,
        variant: "destructive",
      });
    } finally {
      setPayingTransactionId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-full flex-col border-l border-[#232d4a] bg-[#161d35] p-0 text-[#e8eaf0] sm:max-w-[460px]">
        <SheetHeader className="border-b border-[#232d4a] px-5 py-4 text-left">
          <div className="flex items-center gap-2">
            <Route className="h-5 w-5 text-[#e8eaf0]/70" />
            <SheetTitle className="text-lg font-semibold text-[#e8eaf0]">Contract Salik</SheetTitle>
          </div>
          <SheetDescription className="text-xs text-[#e8eaf0]/55">
            {loading
              ? "Loading transactions..."
              : `${transactions.length} ${transactions.length === 1 ? "transaction" : "transactions"} found`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-[#e8eaf0]/60">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading Salik
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-md border border-[#232d4a] bg-white/[0.02] px-4 py-12 text-center">
              <Radar className="mb-3 h-5 w-5 text-[#e8eaf0]/45" />
              <p className="text-sm font-medium text-[#e8eaf0]">No Salik linked to this contract</p>
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.map((transaction) => {
                const statusClass = statusStyles[transaction.status] ?? statusStyles.Unpaid;
                const isPaid = transaction.status === "Paid";
                const isPaying = payingTransactionId === transaction.id;

                return (
                  <div
                    key={transaction.id}
                    className="rounded-md border border-[#232d4a] bg-white/[0.025] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-[#e8eaf0]">
                          {transaction.toll_gate || "Salik transaction"}
                        </h3>
                        <p className="mt-1 font-ibm-plex-mono text-[11px] text-[#e8eaf0]/55">
                          {formatDate(transaction.transaction_date)}
                          {transaction.transaction_id ? ` - ${transaction.transaction_id}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-ibm-plex-mono text-sm font-semibold tabular-nums text-[#e8eaf0]">
                          {formatAed(toAmount(transaction.amount))}
                        </p>
                        <Badge
                          variant="outline"
                          className={cn("mt-2 rounded-full px-2 py-0.5 text-[10px]", statusClass)}
                        >
                          {transaction.status || "Unpaid"}
                        </Badge>
                      </div>
                    </div>

                    {!isPaid ? (
                      <div className="mt-3 flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => markTransactionPaid(transaction.id)}
                          disabled={payingTransactionId !== null}
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

export default SalikModal;
