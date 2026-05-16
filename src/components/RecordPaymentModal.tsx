import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ScrollArea } from "@/components/ui/scroll-area";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PaymentModalLedgerEntry {
  id: string;
  description: string;
  amount: number;
  status: string;
  type: "Rental" | "Salik" | "Payment" | "Fine" | "Deposit";
}

interface RecordPaymentModalProps {
  open: boolean;
  onClose: () => void;
  contractId: string;
  balanceDue: number;
  ledgerEntries: PaymentModalLedgerEntry[];
  clientId: string;
}

type PaymentMethod = "Cash" | "Card" | "Transfer";

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  open,
  onClose,
  contractId,
  balanceDue,
  ledgerEntries,
  clientId,
}) => {
  const [amount, setAmount] = useState<number | "">("");
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [allocations, setAllocations] = useState<Record<string, number>>({});

  const unpaidEntries = useMemo(
    () => ledgerEntries.filter((entry) => {
      const isPaid = entry.status.toLowerCase() === "paid";
      const isDeposit = entry.description.toLowerCase().includes("deposit");
      return !isPaid && !isDeposit;
    }),
    [ledgerEntries]
  );

  const totalAllocated = useMemo(
    () => Object.values(allocations).reduce((sum, val) => sum + (val || 0), 0),
    [allocations]
  );

  const currentAmount = typeof amount === "number" ? amount : 0;
  const unallocatedAmount = currentAmount - totalAllocated;

  const handleAllocationChange = (id: string, value: string, max: number) => {
    const numValue = Math.min(max, Math.max(0, Number(value) || 0));
    setAllocations((prev) => ({
      ...prev,
      [id]: numValue,
    }));
  };

  const fillAllUnpaid = () => {
    let remaining = currentAmount;
    const newAllocations: Record<string, number> = {};

    for (const entry of unpaidEntries) {
      const allocate = Math.min(remaining, entry.amount);
      newAllocations[entry.id] = allocate;
      remaining -= allocate;
    }

    setAllocations(newAllocations);
  };

  const fmtAed = (n: number) => `AED ${Number(n).toLocaleString()}`;

  const isSaveDisabled = currentAmount <= 0 || Math.abs(unallocatedAmount) > 0.01;

  const handleSave = async () => {
    try {
      // 1. Insert into 'payments'
      const { error: payError } = await supabase.from("payments").insert({
        contract_id: contractId,
        client_id: clientId,
        amount: currentAmount,
        method: method,
        payment_date: new Date().toISOString().split("T")[0],
        status: "Paid",
      });

      if (payError) throw payError;

      // 2. Update status of fully allocated fines/salik.
      // Ledger entry IDs are prefixed ("fine-<uuid>", "salik-<uuid>", etc.),
      // so strip the prefix to get the real DB row id.
      for (const entry of unpaidEntries) {
        const allocated = allocations[entry.id] ?? 0;
        if (allocated >= entry.amount) {
          const dbId = entry.id.replace(/^(fine|salik|rental|deposit|pay)-/, "");

          if (entry.type === "Fine") {
            const { error: updError } = await supabase
              .from("fines")
              .update({ status: "Paid" } as never)
              .eq("id", dbId);
            if (updError) console.error(`Failed to update fine ${dbId}:`, updError);
          } else if (entry.type === "Salik") {
            const { error: updError } = await supabase
              .from("salik")
              .update({ status: "Paid" } as never)
              .eq("id", dbId);
            if (updError) console.error(`Failed to update salik ${dbId}:`, updError);
          }
          // Rental / Deposit / Payment — no table row to flip
        }
      }

      toast.success("Payment recorded successfully");
      onClose();
      window.location.reload();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Payment error:", err);
      toast.error(`Failed to record payment: ${message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription className="text-xs">
            Contract: <span className="font-mono">{contractId.slice(0, 8).toUpperCase()}</span> ·{" "}
            <span className="text-destructive font-semibold">
              Balance due: {fmtAed(balanceDue)}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="amount" className="text-xs uppercase tracking-wide text-muted-foreground">
                Amount
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  AED
                </span>
                <Input
                  id="amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
                  className="pl-12"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Payment Method
              </Label>
              <ToggleGroup
                type="single"
                value={method}
                onValueChange={(val) => val && setMethod(val as PaymentMethod)}
                className="justify-start"
              >
                <ToggleGroupItem value="Cash" className="flex-1 text-xs">
                  Cash
                </ToggleGroupItem>
                <ToggleGroupItem value="Card" className="flex-1 text-xs">
                  Card
                </ToggleGroupItem>
                <ToggleGroupItem value="Transfer" className="flex-1 text-xs">
                  Trans
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          <div className="grid gap-2 mt-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Allocate payment
              </Label>
              <button
                type="button"
                onClick={fillAllUnpaid}
                className="h-6 text-[10px] uppercase font-bold text-blue-600 hover:text-blue-700 px-2"
              >
                Fill all unpaid
              </button>
            </div>

            <ScrollArea className="h-[200px] rounded-md border border-border p-2">
              {unpaidEntries.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground italic">
                  No unpaid ledger entries
                </div>
              ) : (
                <div className="space-y-3">
                  {unpaidEntries.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-3 text-xs">
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium text-foreground">{entry.description}</p>
                        <p className="text-muted-foreground font-mono text-[10px]">Due: {fmtAed(entry.amount)}</p>
                      </div>
                      <div className="relative w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                          AED
                        </span>
                        <input
                          type="number"
                          className="h-8 w-full rounded-md border border-input bg-background px-3 py-2 pl-8 text-right text-xs ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          value={allocations[entry.id] || ""}
                          placeholder="0.00"
                          max={entry.amount}
                          onChange={(e) => handleAllocationChange(entry.id, e.target.value, entry.amount)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            <div className="flex justify-between items-center px-1 mt-1">
              <span className={`text-[11px] font-semibold ${Math.abs(unallocatedAmount) > 0.01 ? "text-destructive" : "text-emerald-600"}`}>
                Unallocated: {fmtAed(unallocatedAmount)}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button disabled={isSaveDisabled} onClick={handleSave} className="w-full sm:w-auto">
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
