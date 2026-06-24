import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, ReceiptText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  clientId: string;
  ownerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaymentRecorded?: () => void;
}

type FineStatus = "Paid" | "Charged to Client" | "Unpaid" | string;

interface ContractFine {
  id: string;
  fine_number: string | null;
  fine_type: string;
  black_points: number | string | null;
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

type FinePaymentMethod = "Cash" | "Card" | "Bank Transfer" | "Cheque";

type FinePaymentDraft = {
  amount: string;
  taxRate: string;
  method: FinePaymentMethod;
};

export function FinesModal({ contractId, clientId, ownerId, open, onOpenChange, onPaymentRecorded }: FinesModalProps) {
  const { toast } = useToast();
  const [fines, setFines] = useState<ContractFine[]>([]);
  const [loading, setLoading] = useState(false);
  const [payingFineId, setPayingFineId] = useState<string | null>(null);
  const [openPaymentFineId, setOpenPaymentFineId] = useState<string | null>(null);
  const [paymentDraft, setPaymentDraft] = useState<FinePaymentDraft>({
    amount: "",
    taxRate: "0",
    method: "Cash",
  });

  const fetchFines = useCallback(async () => {
    if (!contractId) {
      setFines([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await (supabaseClient as any)
        .from("fines")
        .select("id, fine_number, fine_type, black_points, amount, fine_date, status, paid_at, notes")
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

  const toggleFinePayment = (fine: ContractFine) => {
    if (openPaymentFineId === fine.id) {
      setOpenPaymentFineId(null);
      return;
    }

    setPaymentDraft({
      amount: toAmount(fine.amount).toFixed(2),
      taxRate: "0",
      method: "Cash",
    });
    setOpenPaymentFineId(fine.id);
  };

  const recordFinePayment = async (fine: ContractFine) => {
    const fineId = fine.id;
    const amount = Number(paymentDraft.amount);
    const taxRate = Number(paymentDraft.taxRate);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Enter a payment amount greater than zero.",
        variant: "destructive",
      });
      return;
    }
    if (!Number.isFinite(taxRate) || taxRate < 0) {
      toast({
        title: "Invalid tax",
        description: "Enter a valid tax percentage.",
        variant: "destructive",
      });
      return;
    }

    const taxAmount = Math.round(((amount * taxRate) / 100) * 100) / 100;
    setPayingFineId(fineId);
    try {
      const { error: paymentError } = await (supabaseClient as any)
        .from("payments")
        .insert({
          amount,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          method: paymentDraft.method,
          contract_id: contractId,
          client_id: clientId,
          owner_id: ownerId,
          payment_date: new Date().toISOString().split("T")[0],
          status: "Paid",
          allocations: {
            rental: 0,
            fines: amount,
            salik: 0,
            fees: 0,
            lines: {
              [`fine-${fineId}`]: amount,
            },
          },
        });

      if (paymentError) throw paymentError;

      const { error: fineError } = await (supabaseClient as any)
        .from("fines")
        .update({
          status: "Paid",
          paid_at: new Date().toISOString(),
        })
        .eq("id", fineId);

      if (fineError) throw fineError;

      toast({
        title: "Payment recorded",
        description: "The fine payment was recorded successfully.",
      });
      setOpenPaymentFineId(null);
      await fetchFines();
      onPaymentRecorded?.();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to record fine payment:", error);
      toast({
        title: "Failed to record payment",
        description: message,
        variant: "destructive",
      });
    } finally {
      setPayingFineId(null);
    }
  };

  const renderFinePaymentForm = (fine: ContractFine) => {
    const amount = Number(paymentDraft.amount) || 0;
    const taxRate = Number(paymentDraft.taxRate) || 0;
    const taxAmount = Math.round(((amount * taxRate) / 100) * 100) / 100;
    const total = Math.round((amount + taxAmount) * 100) / 100;
    const isSaving = payingFineId === fine.id;

    return (
      <div className="mt-3 -mx-3 max-w-lg border-t border-[#1e3a5f] bg-[#0f1729] px-4 py-3">
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="grid flex-[7] gap-1.5">
              <Label className="text-[10px] uppercase tracking-wide text-[#e8eaf0]/55">Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={paymentDraft.amount}
                onChange={(event) => setPaymentDraft((draft) => ({ ...draft, amount: event.target.value }))}
                className="h-9 rounded-lg border border-[#2a3a55] bg-[#1a2338] font-mono text-sm tabular-nums text-[#e8eaf0]"
              />
            </div>
            <div className="grid flex-[3] gap-1.5">
              <Label className="text-[10px] uppercase tracking-wide text-[#e8eaf0]/55">Tax %</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={paymentDraft.taxRate}
                onChange={(event) => setPaymentDraft((draft) => ({ ...draft, taxRate: event.target.value }))}
                className="h-9 rounded-lg border border-[#2a3a55] bg-[#1a2338] font-mono text-sm tabular-nums text-[#e8eaf0]"
              />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-xs text-[#e8eaf0]/55">
              <span>Tax amount</span>
              <span className="font-mono tabular-nums">{formatAed(taxAmount)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm font-semibold text-[#e8eaf0]">
              <span>Total</span>
              <span className="font-mono tabular-nums text-[#22c55e]">{formatAed(total)}</span>
            </div>
          </div>
          <Select
            value={paymentDraft.method}
            onValueChange={(value) => setPaymentDraft((draft) => ({ ...draft, method: value as FinePaymentMethod }))}
          >
            <SelectTrigger className="h-9 rounded-lg border border-[#2a3a55] bg-[#1a2338] py-2 text-sm text-[#e8eaf0]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Cash">Cash</SelectItem>
              <SelectItem value="Card">Card</SelectItem>
              <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
              <SelectItem value="Cheque">Cheque</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={payingFineId !== null}
              onClick={() => void recordFinePayment(fine)}
              className="h-9 flex-1 rounded-lg border border-blue-800 bg-blue-900 px-3 text-sm font-semibold text-blue-300 hover:bg-blue-900/80 hover:text-blue-300"
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Record Payment
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={payingFineId !== null}
              onClick={() => setOpenPaymentFineId(null)}
              className="h-9 w-24 rounded-lg border border-[#2a3a55] bg-transparent px-3 text-sm font-semibold text-[#e8eaf0] hover:bg-white/[0.06] hover:text-[#e8eaf0]"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
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
                const blackPoints = Number(fine.black_points) || 0;

                return (
                  <div
                    key={fine.id}
                    className="rounded-md border border-[#232d4a] bg-white/[0.025] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words font-mono text-base font-semibold leading-5 text-[#e8eaf0]">
                          {fine.fine_number || "No fine number"}
                        </h3>
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="min-w-0 break-words text-xs leading-5 text-[#e8eaf0]/60">
                            {formatDate(fine.fine_date)} · {(fine.fine_type || "Traffic fine").slice(0, 30)}
                          </p>
                          {blackPoints > 0 ? (
                            <Badge
                              variant="outline"
                              className="shrink-0 rounded-full border-[#f59e0b]/25 bg-[#f59e0b]/15 px-2 py-0.5 text-[10px] font-semibold text-[#f59e0b]"
                            >
                              ● {blackPoints} BP
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-sm font-semibold tabular-nums text-[#e8eaf0]">
                          {formatAed(toAmount(fine.amount))}
                        </p>
                        {fine.status !== "Charged to Client" ? (
                          <Badge
                            variant="outline"
                            className={cn("mt-2 rounded-full px-2 py-0.5 text-[10px]", statusClass)}
                          >
                            {fine.status || "Unpaid"}
                          </Badge>
                        ) : null}
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
                          onClick={() => toggleFinePayment(fine)}
                          disabled={payingFineId !== null}
                          className="h-8 border border-[#22c55e]/25 bg-[#22c55e]/15 px-3 text-xs font-medium text-[#22c55e] hover:bg-[#22c55e]/25"
                        >
                          Pay
                        </Button>
                      </div>
                    ) : null}
                    {!isPaid && openPaymentFineId === fine.id ? renderFinePaymentForm(fine) : null}
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
