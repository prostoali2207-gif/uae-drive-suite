import { useEffect, useMemo, useState } from "react";
import { CarFront } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ParkingRow = {
  id: string;
  parking_date: string;
  location: string;
  parking_zone?: string | null;
  amount: number | string;
  status: string;
  cars: { plate: string | null; make: string | null; model: string | null } | null;
};

type ParkingContractRef = {
  id: string;
  client_id: string;
  owner_id: string;
};

interface ParkingBulkSheetProps {
  contract: ParkingContractRef;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: ParkingRow[];
  onRefresh: () => void | Promise<void>;
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

const today = () => new Date().toISOString().slice(0, 10);

export function ParkingBulkSheet({ contract, open, onOpenChange, transactions, onRefresh }: ParkingBulkSheetProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "Bank Transfer">("Cash");
  const [confirmingPayment, setConfirmingPayment] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedIds(new Set());
      setPaymentDialogOpen(false);
      setPaymentMethod("Cash");
    }
  }, [open]);

  const unpaidTransactions = useMemo(
    () => transactions.filter((transaction) => transaction.status.toLowerCase() !== "paid"),
    [transactions],
  );

  const monthGroups = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; ids: string[] }>();
    unpaidTransactions.forEach((transaction) => {
      const date = new Date(transaction.parking_date);
      const key = Number.isNaN(date.getTime()) ? transaction.parking_date.slice(0, 7) : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const label = Number.isNaN(date.getTime())
        ? transaction.parking_date.slice(0, 7)
        : date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      const group = groups.get(key) ?? { key, label, ids: [] };
      group.ids.push(transaction.id);
      groups.set(key, group);
    });
    return Array.from(groups.values());
  }, [unpaidTransactions]);

  const visibleIds = useMemo(() => unpaidTransactions.map((transaction) => transaction.id), [unpaidTransactions]);
  const selectedTransactions = useMemo(
    () => unpaidTransactions.filter((transaction) => selectedIds.has(transaction.id)),
    [selectedIds, unpaidTransactions],
  );
  const selectedTotal = selectedTransactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));

  const toggleTransaction = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleVisibleTransactions = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const openPaymentDialog = async () => {
    if (selectedTransactions.length === 0) return;
    const { data, error } = await (supabase as any)
      .from("parking_charges")
      .select("id, status")
      .in("id", Array.from(selectedIds));

    if (error) {
      toast.error("Failed to verify Parking payment status");
      return;
    }

    const paidIds = new Set(
      ((data ?? []) as Array<{ id: string; status: string }>).filter((row) => row.status.toLowerCase() === "paid").map((row) => row.id),
    );
    if (paidIds.size > 0) {
      setSelectedIds((current) => {
        const next = new Set(current);
        paidIds.forEach((id) => next.delete(id));
        return next;
      });
      toast.warning("Some selected parking charges were already paid and have been removed.");
      await onRefresh();
      if (selectedTransactions.every((transaction) => paidIds.has(transaction.id))) return;
    }
    setPaymentDialogOpen(true);
  };

  const confirmParkingPayment = async () => {
    if (selectedTransactions.length === 0 || selectedTotal <= 0) return;
    setConfirmingPayment(true);
    try {
      const ids = selectedTransactions.map((transaction) => transaction.id);
      const { data: statusRows, error: statusError } = await (supabase as any)
        .from("parking_charges")
        .select("id, status")
        .in("id", ids);
      if (statusError) throw statusError;

      const paidIds = new Set(
        ((statusRows ?? []) as Array<{ id: string; status: string }>).filter((row) => row.status.toLowerCase() === "paid").map((row) => row.id),
      );
      const validTransactions = selectedTransactions.filter((transaction) => !paidIds.has(transaction.id));
      const validTotal = validTransactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0);

      if (paidIds.size > 0) {
        setSelectedIds(new Set(validTransactions.map((transaction) => transaction.id)));
        toast.warning("Some selected parking charges were already paid and have been removed.");
        await onRefresh();
      }
      if (validTransactions.length === 0 || validTotal <= 0) {
        setPaymentDialogOpen(false);
        toast.warning("No unpaid Parking charges remain for this payment");
        return;
      }

      const lines = validTransactions.reduce<Record<string, number>>((allocations, transaction) => {
        allocations[`parking-${transaction.id}`] = Number(transaction.amount);
        return allocations;
      }, {});

      const { error: paymentError } = await (supabase as any).from("payments").insert({
        contract_id: contract.id,
        client_id: contract.client_id,
        owner_id: contract.owner_id,
        amount: validTotal,
        payment_date: today(),
        method: paymentMethod,
        status: "Paid",
        tax_rate: 0,
        tax_amount: 0,
        allocations: { rental: 0, fees: 0, fines: 0, salik: 0, parking: validTotal, lines },
      });
      if (paymentError) throw paymentError;

      toast.success("Parking payment recorded");
      setSelectedIds(new Set());
      setPaymentDialogOpen(false);
      setPaymentMethod("Cash");
      await onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to record Parking payment");
    } finally {
      setConfirmingPayment(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex h-full w-full flex-col border-l border-[#232d4a] bg-[#161d35] p-0 text-[#e8eaf0] sm:max-w-[520px]">
          <SheetHeader className="border-b border-[#232d4a] px-5 py-4 text-left">
            <div className="flex items-center gap-2">
              <CarFront className="h-5 w-5 text-[#e8eaf0]/70" />
              <SheetTitle className="text-lg font-semibold text-[#e8eaf0]">Contract Parking</SheetTitle>
            </div>
            <SheetDescription className="text-xs text-[#e8eaf0]/55">
              {unpaidTransactions.length} unpaid {unpaidTransactions.length === 1 ? "charge" : "charges"} found
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 pb-28 pt-4">
            {unpaidTransactions.length === 0 ? (
              <div className="rounded-md border border-[#232d4a] bg-white/[0.02] px-4 py-10 text-center text-sm text-[#e8eaf0]/60">
                No unpaid Parking linked to this contract.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {monthGroups.map((month) => (
                    <button
                      key={month.key}
                      type="button"
                      className={cn(
                        "h-8 shrink-0 rounded-full border px-3 font-mono text-[11px] font-medium tabular-nums transition-colors",
                        month.ids.every((id) => selectedIds.has(id))
                          ? "border-[#1d4ed8] bg-[#0c1f3a] text-[#e8eaf0]"
                          : "border-[#232d4a] bg-white/[0.03] text-[#e8eaf0]/70 hover:bg-white/[0.06]",
                      )}
                      onClick={() => setSelectedIds(new Set(month.ids))}
                    >
                      {month.label} · {month.ids.length}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="flex min-h-10 w-full items-center gap-3 rounded-md border border-[#232d4a] bg-white/[0.02] px-3 py-2 text-left text-xs font-medium text-[#e8eaf0]/80 transition-colors hover:bg-white/[0.05]"
                  onClick={toggleVisibleTransactions}
                >
                  <Checkbox
                    checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                    onCheckedChange={toggleVisibleTransactions}
                    onClick={(event) => event.stopPropagation()}
                    className="h-4 w-4 shrink-0 border-[#64748b] data-[state=checked]:border-[#1d4ed8] data-[state=checked]:bg-[#1d4ed8]"
                  />
                  <span>Select all</span>
                  <span className="ml-auto font-mono text-[11px] tabular-nums text-[#e8eaf0]/45">{visibleIds.length}</span>
                </button>

                <div className="space-y-1.5">
                  {unpaidTransactions.map((transaction) => {
                    const selected = selectedIds.has(transaction.id);
                    const vehicle = [transaction.cars?.plate, [transaction.cars?.make, transaction.cars?.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
                    return (
                      <div
                        key={transaction.id}
                        role="button"
                        tabIndex={0}
                        className={cn(
                          "grid min-h-12 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-2 transition-colors",
                          selected ? "border-[#1d4ed8] bg-[#0c1f3a]" : "border-[#232d4a] bg-white/[0.015] hover:bg-white/[0.04]",
                        )}
                        onClick={() => toggleTransaction(transaction.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleTransaction(transaction.id);
                          }
                        }}
                      >
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() => toggleTransaction(transaction.id)}
                          onClick={(event) => event.stopPropagation()}
                          className="h-4 w-4 shrink-0 border-[#64748b] data-[state=checked]:border-[#1d4ed8] data-[state=checked]:bg-[#1d4ed8]"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-[#e8eaf0]">{transaction.location || "Parking"}</div>
                          <div className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-[#e8eaf0]/50">
                            {formatDateTime(transaction.parking_date)}{transaction.parking_zone ? ` · Zone ${transaction.parking_zone}` : ""}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-[#e8eaf0]/45">{vehicle || "No car"}</div>
                        </div>
                        <div className="shrink-0 text-right font-mono text-sm font-semibold tabular-nums text-[#e8eaf0]">
                          {fmtAed(Number(transaction.amount))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className={cn(
            "absolute inset-x-0 bottom-0 border-t border-[#1d4ed8]/30 bg-[#0d1526] px-5 py-4 shadow-2xl transition-all duration-200 ease-out",
            selectedIds.size > 0 ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0",
          )}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 font-mono text-sm font-semibold tabular-nums text-[#e8eaf0]">
                {selectedIds.size} {selectedIds.size === 1 ? "charge" : "charges"} · {fmtAed(selectedTotal)}
              </div>
              <Button type="button" size="sm" className="h-9 shrink-0 bg-[#1d4ed8] px-4 text-xs font-semibold text-white hover:bg-[#2563eb]" onClick={openPaymentDialog} disabled={confirmingPayment}>
                Pay
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Parking Payment</DialogTitle>
            <DialogDescription className="text-xs">Record payment for the selected Parking charges.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Amount</div>
              <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">{fmtAed(selectedTotal)}</div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Payment method</Label>
              <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as "Cash" | "Bank Transfer")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setPaymentDialogOpen(false)} disabled={confirmingPayment}>Cancel</Button>
            <Button type="button" onClick={confirmParkingPayment} disabled={confirmingPayment || selectedTransactions.length === 0}>
              {confirmingPayment ? "Recording..." : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ParkingBulkSheet;
