import React, { useState } from "react";
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

interface RecordPaymentModalProps {
  open: boolean;
  onClose: () => void;
  contractId: string;
  balanceDue: number;
}

type PaymentMethod = "Cash" | "Card" | "Transfer";

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  open,
  onClose,
  contractId,
  balanceDue,
}) => {
  const [amount, setAmount] = useState<number>(balanceDue);
  const [method, setMethod] = useState<PaymentMethod>("Cash");

  const fmtAed = (n: number) => `AED ${Number(n).toLocaleString()}`;

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
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
                onChange={(e) => setAmount(Number(e.target.value))}
                className="pl-12"
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
              <ToggleGroupItem value="Cash" className="flex-1">
                Cash
              </ToggleGroupItem>
              <ToggleGroupItem value="Card" className="flex-1">
                Card
              </ToggleGroupItem>
              <ToggleGroupItem value="Transfer" className="flex-1">
                Transfer
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button disabled className="w-full sm:w-auto">
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
